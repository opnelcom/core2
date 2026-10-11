'use strict';

// ERP prepares and validates its decisions. Broker receives ordinary SQL only.
// Reads are optimistic: the final batch locks affected tables and verifies every
// input snapshot before its first write. A conflict rolls the entire batch back.
function createTransactionPlan(ctx, tables) {
  if (!Array.isArray(tables) || !tables.length || tables.some(t => !/^erp_[a-z_]+$/.test(t)))
    throw new Error('Explicit ERP transaction tables are required');
  const guards = [], writes = [], lockedTables = new Set(tables);
  const includeTables = text => {
    for(const match of text.matchAll(/\b(?:FROM|JOIN|UPDATE|INTO|TABLE)\s+(erp_[a-z_]+)\b/gi)) lockedTables.add(match[1]);
  };
  const snapshotSql = sql => `SELECT COALESCE(jsonb_agg(to_jsonb(snapshot_row) ORDER BY to_jsonb(snapshot_row)::text),'[]'::jsonb) AS snapshot FROM (${sql}) snapshot_row`;
  const client = {
    async query(text, values = []) {
      includeTables(text);
      // Existing ERP workflows use lock queries; locks belong in the final batch.
      if (/^\s*SELECT\s+pg_advisory_xact_lock\b/i.test(text)) return {rows:[],rowCount:1};
      if (!/^\s*(SELECT|WITH)\b/i.test(text)) {
        if (/\bRETURNING\b/i.test(text)) throw new Error('Planned writes with RETURNING require an explicit ERP result');
        writes.push({text,values}); return {rows:[],rowCount:1};
      }
      if (/^\s*WITH\b/i.test(text) && /\b(INSERT|UPDATE|DELETE)\b/i.test(text))
        throw new Error('Use plan.write for modifying CTEs');
      const sql = text.replace(/\s+FOR\s+(?:UPDATE|SHARE)\s*$/i,'');
      const result = await ctx.broker('core_erp','query',{text:`WITH read_rows AS MATERIALIZED (${sql}) SELECT read_rows.*,
        (SELECT COALESCE(jsonb_agg(to_jsonb(snapshot_row) ORDER BY to_jsonb(snapshot_row)::text),'[]'::jsonb)::text FROM read_rows snapshot_row) AS __erp_snapshot FROM read_rows`,values});
      const snapshot = result.rows[0]?.__erp_snapshot || '[]';
      const checkValues = [...values,snapshot];
      guards.push({text:`SELECT 1 FROM (${snapshotSql(sql)}) checked WHERE checked.snapshot=$${checkValues.length}::jsonb`,values:checkValues,expectedRowCount:1});
      const rows=result.rows.map(({__erp_snapshot,...row})=>row);
      return {rows,rowCount:rows.length};
    }
  };
  function write(statement, result = {rows:[],rowCount:1}) {
    includeTables(statement.text);
    writes.push(statement); return result;
  }
  async function commit() {
    const statements=[{text:`LOCK TABLE ${[...lockedTables].sort().join(', ')} IN SHARE ROW EXCLUSIVE MODE`},...guards,...writes];
    try {
      const result=await ctx.broker('core_erp','transaction',{statements});
      return {results:result.results.slice(1+guards.length)};
    } catch(error) {
      if(error.code==='TRANSACTION_PRECONDITION'||error.message==='Transaction precondition failed')
        throw Object.assign(new Error('ERP data changed while preparing this operation. Retry with the current data.'),{status:409});
      throw error;
    }
  }
  return {client,write,commit};
}
module.exports={createTransactionPlan};
