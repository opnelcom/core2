"use strict";

const referenceClasses = ["resource", "accounting_object", "accounting_dimension", "subledger_account", "gl_account", "legal_entity"];

function validateGridDefinition(field, validateDefinition) {
  const errors = [];
  const row = field.rowSchema;
  if (!row || row.type !== "object" || !row.properties || typeof row.properties !== "object" || Array.isArray(row.properties)) return ["rowSchema must define an object with properties"];
  if (Object.values(row.properties).some(column => column?.type === "grid")) return ["nested grids are not supported"];
  errors.push(...validateDefinition(row));
  for (const attribute of ["minRows", "maxRows"]) if (field[attribute] !== undefined && (!Number.isInteger(field[attribute]) || field[attribute] < 0)) errors.push(`${attribute} must be a non-negative integer`);
  if (field.minRows !== undefined && field.maxRows !== undefined && field.minRows > field.maxRows) errors.push("minRows cannot exceed maxRows");
  if (field.uniqueBy !== undefined && (!Array.isArray(field.uniqueBy) || !field.uniqueBy.length || field.uniqueBy.some(key => !row.properties[key]))) errors.push("uniqueBy must name existing columns");
  const period = field.periodControl;
  if (period !== undefined) {
    if (!period || typeof period !== "object" || Array.isArray(period)) return [...errors, "periodControl must be an object"];
    for (const key of ["from", "to"]) if (typeof period[key] !== "string" || row.properties[period[key]]?.type !== "date") errors.push(`periodControl.${key} must name a date column`);
    if (period.from === period.to) errors.push("periodControl dates must use different columns");
    if (!Array.isArray(period.groupBy) || period.groupBy.some(key => !row.properties[key])) errors.push("periodControl.groupBy must be an array of existing columns (empty means the whole grid)");
    if (period.allowOverlap !== undefined && typeof period.allowOverlap !== "boolean") errors.push("periodControl.allowOverlap must be boolean");
  }
  return errors;
}

function validateGrid(field, rows, validateRow) {
  if (!Array.isArray(rows)) return ["must be a grid row array"];
  const errors = [];
  if (field.minRows !== undefined && rows.length < field.minRows) errors.push(`needs at least ${field.minRows} rows`);
  if (field.maxRows !== undefined && rows.length > field.maxRows) errors.push(`allows at most ${field.maxRows} rows`);
  rows.forEach((row, index) => errors.push(...validateRow(field.rowSchema, row).map(error => `row ${index + 1}: ${error}`)));
  const valid = rows.map((row, index) => ({ row, index })).filter(({ row }) => row && typeof row === "object" && !Array.isArray(row));
  const groupKey = (row, keys) => JSON.stringify(keys.map(key => row[key] ?? null));
  if (Array.isArray(field.uniqueBy)) {
    const seen = new Map();
    for (const { row, index } of valid) {
      const key = groupKey(row, field.uniqueBy);
      if (seen.has(key)) errors.push(`rows ${seen.get(key) + 1} and ${index + 1}: duplicate ${field.uniqueBy.join(", ")}`);
      else seen.set(key, index);
    }
  }
  const p = field.periodControl;
  if (p && Array.isArray(p.groupBy)) {
    const groups = new Map();
    for (const { row, index } of valid) {
      const start = row[p.from], end = row[p.to] || "9999-12-31";
      if (!start) { errors.push(`row ${index + 1}: ${p.from} is required for period control`); continue; }
      if (start > end) errors.push(`row ${index + 1}: ${p.to} cannot precede ${p.from}`);
      const key = groupKey(row, p.groupBy);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ start, end, index });
    }
    if (p.allowOverlap === false) for (const ranges of groups.values()) {
      ranges.sort((a, b) => String(a.start).localeCompare(String(b.start)));
      let previous;
      for (const range of ranges) {
        if (previous && range.start <= previous.end) errors.push(`rows ${previous.index + 1} and ${range.index + 1}: periods overlap within ${p.groupBy.join(", ") || "the grid"}`);
        if (!previous || range.end > previous.end) previous = range;
      }
    }
  }
  return errors;
}

function referenceFields(schema, data, prefix = "") {
  const result = [];
  for (const [key, field] of Object.entries(schema?.properties || {})) {
    const value = data?.[key];
    const name = prefix + (field.title || key);
    if (field.type === "reference" && value) result.push({ field, value, name });
    if (field.type === "grid" && Array.isArray(value)) value.forEach((row, index) => result.push(...referenceFields(field.rowSchema, row, `${name}, row ${index + 1}, `)));
  }
  return result;
}

module.exports = { referenceClasses, validateGridDefinition, validateGrid, referenceFields };
