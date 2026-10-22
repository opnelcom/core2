/* Shared schema presentation conditions. No record validation or mutation. */
(function (root) {
  "use strict";
  const operators = ["eq", "ne", "gt", "gte", "lt", "lte", "in", "notIn", "isEmpty", "isNotEmpty"];
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const empty = value => value === undefined || value === null || value === "" || Array.isArray(value) && !value.length;
  function evaluate(condition, object = {}, row, defaultScope = "object", schema = {}, rowSchema = {}) {
    if (condition === undefined) return true;
    if (!condition || typeof condition !== "object") return false;
    if (condition.all) return condition.all.every(item => evaluate(item, object, row, defaultScope, schema, rowSchema));
    if (condition.any) return condition.any.some(item => evaluate(item, object, row, defaultScope, schema, rowSchema));
    const scope = condition.scope || defaultScope;
    const data = scope === "row" ? row || {} : object;
    const properties = (scope === "row" ? rowSchema : schema).properties || {};
    const normalize = (value, field) => {
      if (empty(value)) return value;
      if (["number", "integer", "currency", "decimal"].includes(field?.type)) return Number(value);
      if (field?.type === "date_time" || field?.format === "date-time") return Date.parse(value);
      return value;
    };
    const left = normalize(data[condition.field], properties[condition.field]);
    const right = own(condition, "valueField") ? normalize(data[condition.valueField], properties[condition.valueField]) : normalize(condition.value, properties[condition.field]);
    switch (condition.operator) {
      case "isEmpty": return empty(left);
      case "isNotEmpty": return !empty(left);
      case "eq": return left === right;
      case "ne": return left !== right;
      case "in": return Array.isArray(condition.value) && condition.value.some(value => normalize(value, properties[condition.field]) === left);
      case "notIn": return Array.isArray(condition.value) && !condition.value.some(value => normalize(value, properties[condition.field]) === left);
      case "gt": return !empty(left) && !empty(right) && left > right;
      case "gte": return !empty(left) && !empty(right) && left >= right;
      case "lt": return !empty(left) && !empty(right) && left < right;
      case "lte": return !empty(left) && !empty(right) && left <= right;
      default: return false;
    }
  }
  function validate(condition, schema, rootSchema = schema, defaultScope = "object", path = "showif", depth = 0) {
    if (condition === undefined) return [];
    const fail = message => [`${path}: ${message}`];
    if (depth > 20) return fail("conditions may nest at most 20 levels");
    if (!condition || typeof condition !== "object" || Array.isArray(condition)) return fail("must be a condition object");
    const groups = ["all", "any"].filter(key => own(condition, key));
    if (groups.length) {
      const key = groups[0];
      if (Object.keys(condition).length !== 1 || !Array.isArray(condition[key]) || !condition[key].length) return fail("use either a non-empty all or any array");
      return condition[key].flatMap((item, index) => validate(item, schema, rootSchema, defaultScope, `${path}.${key}[${index}]`, depth + 1));
    }
    if (Object.keys(condition).some(key => !["scope", "field", "operator", "value", "valueField"].includes(key))) return fail("unknown condition attribute");
    const scope = condition.scope || defaultScope;
    if (!["object", "row"].includes(scope) || scope === "row" && defaultScope !== "row") return fail("scope must identify an available object or row");
    const properties = (scope === "row" ? schema : rootSchema).properties || {};
    const scalar = name => typeof name === "string" && own(properties, name) && !["grid", "array", "object"].includes(properties[name].type);
    if (!scalar(condition.field)) return fail("field must name an existing scalar field in the selected scope");
    if (!operators.includes(condition.operator)) return fail("unsupported operator");
    const operands = Number(own(condition, "value")) + Number(own(condition, "valueField"));
    if (["isEmpty", "isNotEmpty"].includes(condition.operator)) return operands ? fail("empty checks do not take a value") : [];
    if (operands !== 1) return fail("provide exactly one value or valueField");
    if (own(condition, "valueField") && !scalar(condition.valueField)) return fail("valueField must name an existing scalar field in the selected scope");
    const literal = value => value === null || ["string", "number", "boolean"].includes(typeof value);
    if (["in", "notIn"].includes(condition.operator)) return !Array.isArray(condition.value) || !condition.value.every(literal) ? fail("membership checks require an array of literal values") : [];
    if (own(condition, "value") && !literal(condition.value)) return fail("value must be a scalar literal");
    return [];
  }
  // Option conditions use the same object/row scopes as field visibility.
  function availableOptions(field, object, row, scope = "object", schema = {}, rowSchema = {}) {
    return (field.options || []).filter(option => !option || typeof option !== "object" || evaluate(option.showif, object, row, scope, schema, rowSchema));
  }
  const api = { evaluate, validate, availableOptions };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SchemaVisibility = api;
})(globalThis);
