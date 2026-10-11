'use strict';

const identifier = value => '"' + String(value).replace(/"/g, '""') + '"';
const literal = value => "'" + String(value).replace(/'/g, "''") + "'";
const invalid = message => Object.assign(new Error(message), {status:400});

function connectionOptions(input, config = {}) {
  if (!input || typeof input !== 'object') throw invalid('Connection details required');
  for (const key of ['host','database','username']) {
    if (typeof input[key] !== 'string' || !input[key].trim() || input[key].length > 255 || /[\x00-\x1f]/.test(input[key])) throw invalid('Valid ' + key + ' required');
  }
  if (input.host.startsWith('/') || input.host.includes('://')) throw invalid('Enter a hostname or IP address, not a URL or socket path');
  if (typeof input.password !== 'string' || input.password.length > 4096) throw invalid('Password required');
  const port = input.port === undefined ? 5432 : Number(input.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw invalid('Port must be between 1 and 65535');
  if (!['disable','verify-full'].includes(input.sslMode || 'verify-full')) throw invalid('Unsupported TLS mode');
  return {host:input.host.trim(), database:input.database.trim(), user:input.username.trim(), password:input.password, port,
    ssl: input.sslMode === 'disable' ? false : {rejectUnauthorized:true},
    connectionTimeoutMillis:10000, statement_timeout:config.statementTimeoutMs || 60000,
    query_timeout:(config.statementTimeoutMs || 60000) + 5000, application_name:'saas14-data-migration'};
}

async function withSource(input, config, callback, ClientClass) {
  const options = connectionOptions(input, config);
  const Client = ClientClass || require('pg').Client;
  const client = new Client(options);
  client.on('error', () => {});
  try {
    await client.connect();
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query("SET LOCAL search_path = pg_catalog; SET LOCAL standard_conforming_strings = on; SET LOCAL DateStyle = 'ISO, YMD'; SET LOCAL TimeZone = 'UTC'; SET LOCAL bytea_output = 'hex'; SET LOCAL extra_float_digits = 3");
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    // Never return/log raw driver errors: they can include remote data or connection details.
    if (error.status) throw error;
    throw Object.assign(new Error('Remote PostgreSQL operation failed. Check connectivity, credentials, TLS, SELECT permissions and query timeout.'), {status:502});
  } finally {
    await client.end().catch(() => {});
  }
}

async function catalog(client) {
  const result = await client.query(`SELECT n.nspname AS schema, c.relname AS table, a.attname AS name,
    format_type(a.atttypid,a.atttypmod) AS datatype, a.attgenerated <> '' AS generated,
    a.attidentity AS identity, a.attnotnull AS required
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
    WHERE c.relkind IN ('r','p') AND n.nspname NOT IN ('pg_catalog','information_schema')
      AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp_%'
      AND has_schema_privilege(n.oid,'USAGE') AND has_column_privilege(c.oid,a.attnum,'SELECT')
    ORDER BY n.nspname,c.relname,a.attnum`);
  const schemas = [];
  for (const row of result.rows) {
    let schema = schemas.find(item => item.name === row.schema);
    if (!schema) schemas.push(schema = {name:row.schema,tables:[]});
    let table = schema.tables.find(item => item.name === row.table);
    if (!table) schema.tables.push(table = {name:row.table,columns:[]});
    table.columns.push({name:row.name,datatype:row.datatype,generated:row.generated,identity:row.identity,required:row.required});
  }
  return schemas;
}

function validateSelection(schemas, selections) {
  if (!Array.isArray(selections) || !selections.length || selections.length > 500) throw invalid('Select between 1 and 500 tables');
  const seen = new Set();
  return selections.map(selection => {
    const key = JSON.stringify([selection.schema,selection.table]);
    if (seen.has(key)) throw invalid('Duplicate table selection');
    seen.add(key);
    const table = schemas.find(s => s.name === selection.schema)?.tables.find(t => t.name === selection.table);
    if (!table || !Array.isArray(selection.columns) || !selection.columns.length) throw invalid('Select accessible tables and columns');
    if (new Set(selection.columns).size !== selection.columns.length) throw invalid('Duplicate column selection');
    const columns = table.columns.filter(c => selection.columns.includes(c.name));
    if (columns.length !== selection.columns.length || columns.some(c => c.generated)) throw invalid('Unknown or generated column selected');
    const replacements = selection.replacements === undefined ? [] : selection.replacements;
    if (!Array.isArray(replacements)) throw invalid('Invalid column replacements');
    const replaced = new Set();
    for (const replacement of replacements) {
      if (!replacement || !columns.some(c => c.name === replacement.column) || replaced.has(replacement.column)) throw invalid('Replacements must reference distinct selected columns');
      replaced.add(replacement.column);
      if (!['value','null'].includes(replacement.mode)) throw invalid('Invalid replacement mode');
      if (replacement.mode === 'value' && (typeof replacement.value !== 'string' || replacement.value.length > 65536 || replacement.value.includes('\0'))) throw invalid('Fixed values must be text of at most 65536 characters');
    }
    return {...selection, columns, replacements};
  });
}

async function prepareReplacements(client, selection) {
  const values = new Map();
  for (const replacement of selection.replacements) {
    const column = selection.columns.find(c => c.name === replacement.column);
    if (replacement.mode === 'null') { values.set(column.name, 'NULL'); continue; }
    try {
      // Cast on the server, then quote the canonical result; input is always a bound value.
      const result = await client.query(`SELECT quote_nullable(($1::${column.datatype})::text) || $2::text AS value`, [replacement.value, '::' + column.datatype]);
      values.set(column.name, result.rows[0].value);
    } catch (error) {
      if (['22','23'].some(prefix => String(error.code).startsWith(prefix))) throw invalid(`Invalid fixed value for ${selection.schema}.${selection.table}.${column.name} (${column.datatype})`);
      throw error;
    }
  }
  return values;
}

function insertQuery(selection, previewRows) {
  const target = identifier(selection.schema) + '.' + identifier(selection.table);
  const columns = selection.columns;
  const override = columns.some(c => c.identity === 'a') ? ' OVERRIDING SYSTEM VALUE' : '';
  const prefix = `INSERT INTO ${target} (${columns.map(c => identifier(c.name)).join(', ')})${override} VALUES (`;
  // PostgreSQL serialises values directly, avoiding JS precision/date/array conversions.
  const expressions = columns.map(c => selection.fixedValues?.has(c.name) ? literal(selection.fixedValues.get(c.name)) : `CASE WHEN ${identifier(c.name)} IS NULL THEN 'NULL' ELSE quote_literal(${identifier(c.name)}::text) || ${literal('::' + c.datatype)} END`);
  const sql = `SELECT ${literal(prefix)} || ${expressions.join(" || ', ' || ")} || ');' AS statement FROM ${target}`;
  return previewRows ? sql + ' LIMIT ' + (previewRows + 1) : sql;
}

async function generate(client, body, config) {
  if (!['preview','all'].includes(body.mode)) throw invalid('Choose preview or all rows');
  const selections = validateSelection(await catalog(client), body.selections);
  const limit = body.mode === 'preview' ? config.previewRows || 100 : 0;
  const statements = [];
  const tables = [];
  let bytes = 0;
  const maxBytes = config.maxExportBytes || 52428800;
  for (const selection of selections) {
    selection.fixedValues = await prepareReplacements(client, selection);
    await client.query('DECLARE migration_rows NO SCROLL CURSOR FOR ' + insertQuery(selection,limit));
    let count = 0, truncated = false;
    try {
      while (true) {
        const batch = await client.query('FETCH FORWARD 250 FROM migration_rows');
        if (!batch.rows.length) break;
        for (const row of batch.rows) {
          if (limit && count >= limit) { truncated = true; break; }
          bytes += Buffer.byteLength(row.statement,'utf8') + 1;
          if (bytes > maxBytes) throw Object.assign(new Error('Export exceeds the 50 MiB output limit. Select fewer tables or columns.'),{status:413});
          statements.push(row.statement); count++;
        }
        if (truncated) break;
      }
    } finally { await client.query('CLOSE migration_rows'); }
    tables.push({schema:selection.schema,table:selection.table,rows:count,truncated});
  }
  return {statements,tables,mode:body.mode,previewRows:limit,bytes};
}
module.exports = {identifier,literal,connectionOptions,withSource,catalog,validateSelection,prepareReplacements,insertQuery,generate};
