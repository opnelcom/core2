"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

class Element {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.dataset = {}; this.children = []; this.listeners = {}; this.value = ""; this.attributes = {}; this.classList = { add: (...names) => { this.className = [this.className || "",...names].join(" ").trim(); } }; }
  append(...children) { this.children.push(...children); }
  prepend(...children) { this.children.unshift(...children); }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, listener) { this.listeners[name] = listener; }
  setCustomValidity(message) { this.validationMessage = message; }
  get validity() { return { valid: !this.validationMessage }; }
}
const source = fs.readFileSync(require.resolve("../public/app.js"), "utf8");
const context = { document: { createElement: (tag) => new Element(tag) }, pretty: (name) => name };
vm.createContext(context);
vm.runInContext(source.slice(source.indexOf("  function valueForDetailField("), source.indexOf("  function showAccountDetailTab(")), context);
vm.runInContext(source.slice(source.indexOf("  function collectSchemaDetail("), source.indexOf("  function collectAccountDetail(")), context);

test("renderer applies text lengths, placeholder and inferred short width", () => {
  const label = context.renderDetailInput("code", { type: "short_text", maxLength: 30, placeholder: "ABC", pattern: "[A-Z]+" }, "", true);
  const input = label.children[0];
  assert.ok(label.className.includes("detail-field--short"));
  assert.equal(input.maxLength, 30);
  assert.equal(input.placeholder, "ABC");
  assert.equal(input.pattern, "[A-Z]+");
  assert.equal(input.required, true);
});
test("renderer uses multiline rows, help text, integer bounds and decimal step", () => {
  const description = context.renderDetailInput("description", { type: "long_text", rows: 6, maxLength: 4000, helpText: "Describe the item." }, "", false);
  assert.equal(description.children[0].tagName, "TEXTAREA");
  assert.equal(description.children[0].rows, 6);
  assert.equal(description.children[1].textContent, "Describe the item.");
  const months = context.renderDetailInput("months", { type: "integer", minimum: 1, maximum: 600 }, 12, false).children[0];
  assert.equal(months.type, "number");
  assert.equal(months.step, "1");
  assert.equal(months.min, "1");
  assert.equal(months.max, "600");
  assert.equal(context.renderDetailInput("rate", { type: "number" }, 1.25, false).children[0].step, "any");
});
test("currency input formats cents without floating point and validates precision", () => {
  const input = context.renderDetailInput("amount", { type: "currency", precision: 14, scale: 2 }, "999999999999.99", false).children[0];
  assert.equal(input.type, "text");
  assert.equal(input.inputMode, "decimal");
  assert.equal(input.value, "999999999999.99");
  input.value = "12.345";
  input.listeners.input();
  assert.ok(input.validationMessage);
  input.value = "0.1";
  input.listeners.blur();
  assert.equal(input.value, "0.10");
  assert.equal(input.validationMessage, "");
  assert.equal(context.decimalDetailValue("00012.3", 2), "12.30");
});
test("required dropdowns and date/email fields use the correct controls", () => {
  const select = context.renderDetailInput("status", { type: "select", options: [{ code: "active", description: "Active" }] }, "active", true).children[0];
  assert.equal(select.tagName, "SELECT");
  assert.equal(select.required, true);
  assert.equal(select.children[0].textContent, "Active");
  for (const [type, expected] of [["date", "date"], ["date_time", "datetime-local"], ["email", "email"], ["url", "url"]]) assert.equal(context.renderDetailInput("field", { type }, "", false).children[0].type, expected);
});
test("collection retains exact decimal strings and never truncates fractional integers", () => {
  const controls = [
    { dataset: { detailField: "amount" }, value: "999999999999.99", type: "text" },
    { dataset: { detailField: "months" }, value: "1.5", type: "number" },
    { dataset: { detailField: "blank" }, value: "", type: "text" },
  ];
  context.$ = () => ({ querySelector: () => null, querySelectorAll: () => controls });
  const data = context.collectSchemaDetail("fields", { properties: { amount: { type: "currency", scale: 2 }, months: { type: "integer" }, blank: { type: "currency" } } });
  assert.equal(data.amount, "999999999999.99");
  assert.equal(data.months, 1.5);
  assert.equal(data.blank, null);
});
