"use strict";
const GRID_VIEWS = ["columnar", "status"];
function validateDefaultGridView(value) {
  if (value === undefined) return { value: null };
  if (!GRID_VIEWS.includes(value)) return { error: "Default grid view must be columnar or status" };
  return { value };
}
module.exports = { GRID_VIEWS, validateDefaultGridView };
