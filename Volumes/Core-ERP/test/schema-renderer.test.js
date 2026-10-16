"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

class Element {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.dataset = {}; this.children = []; this.listeners = {}; this.value = ""; this.attributes = {}; this.classList = { add: (...names) => { this.className = [this.className || "",...names].join(" ").trim(); } }; }
  set innerHTML(value) { this.children = []; }
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
  const select = context.renderDetailInput("status", { type: "select", options: [{ code: "active", description: "Active" }] }, "active", true).children[0].children[0];
  assert.equal(select.tagName, "SELECT");
  assert.equal(select.required, true);
  assert.equal(select.children[0].textContent, "active - Active");
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


test("currency selectors list only active organisation currencies and retain full codes", () => {
  context.state = { currencies: [
    { currency_code: "LONG-CODE", currency_name: "Local currency", is_active: true },
    { currency_code: "OFF", currency_name: "Inactive", is_active: false },
    { currency_code: "EMPTY", is_active: true },
  ] };
  const wrapper = context.renderDetailInput("currencyCode", { type: "currency_code" }, "LONG-CODE", true).children[0];
  const select = wrapper.children[0], display = wrapper.children[1];
  assert.equal(select.children.length, 2);
  assert.equal(select.children[0].textContent, "LONG-CODE - Local currency");
  assert.equal(select.value, "LONG-CODE");
  assert.equal(display.textContent, "Local currency");
  assert.equal(context.collectDetailValue(select, { type: "currency_code" }), "LONG-CODE");
  select.value = "EMPTY"; select.listeners.change();
  assert.equal(display.textContent, "");
  assert.equal(select.children[1].textContent, "EMPTY");
  context.state.currencies = [];
  assert.equal(context.renderDetailInput("currencyCode", { type: "currency_code" }, "", true).children[0].children[0].tagName, "SELECT");
});

test("enum selected labels may be blank without losing stored codes", () => {
  const wrapper = context.renderDetailInput("method", { enum: ["independent", "missing"], enumNames: ["Independent valuation"] }, "independent", true).children[0];
  const select = wrapper.children[0];
  assert.equal(wrapper.children[1].textContent, "Independent valuation");
  assert.equal(select.children[0].textContent, "independent - Independent valuation");
  select.value = "missing"; select.listeners.change();
  assert.equal(wrapper.children[1].textContent, "");
  assert.equal(context.collectDetailValue(select, { type: "select" }), "missing");
});


test("reference choices show labels while retaining UUIDs across asynchronous loading", async () => {
  const id = "c9fa4981-8de3-4a42-800c-5142779c82f8";
  context.state = { orgId: "org-1", accountingDimensionTypes: [{ type_code: "valuation_method", type_name: "Valuation Method" }] };
  context.URLSearchParams = URLSearchParams;
  let load;
  context.queueMicrotask = fn => { load = fn; };
  context.api = async () => ({ records: [{ id, code: "independent", name: "Independent valuation" }] });
  const wrapper = context.renderDetailReference("method", { type: "reference", target: { class: "accounting_dimension", types: ["valuation_method"] } }, id, true);
  await load();
  const row = wrapper.children[0], choice = row.children[0], select = choice.children[0];
  assert.equal(row.children[1].attributes["aria-label"], "Source: Accounting Dimension / Valuation Method");
  assert.equal(row.children[1].tabIndex, 0);
  assert.equal(row.children[1].children[0].textContent, "Source: Accounting Dimension / Valuation Method");
  assert.equal(select.value, id);
  assert.equal(select.children[1].textContent, "independent - Independent valuation");
  assert.equal(choice.children[1].textContent, "Independent valuation");
  assert.equal(context.collectDetailValue(select, { type: "reference" }), id);
});

test("reference source help lists mixed classes, unrestricted types and unavailable type codes", () => {
  assert.equal(context.detailReferenceSourceText({ anyOf: [
    { class: "accounting_dimension", types: ["valuation_method", "missing"] },
    { class: "subledger_account" },
  ] }), "Source: Accounting Dimension / Valuation Method, missing; Sub Ledger / All types");
});

test("source tooltip uses the top layer, stays in the viewport and dismisses on Escape", () => {
  const events = {};
  context.window = { innerWidth: 320, innerHeight: 480,
    addEventListener: (name, fn) => { events[name] = fn; },
    removeEventListener: name => { delete events[name]; } };
  const wrapper = context.renderDetailReference("location", { target: { class: "accounting_dimension" } }, "", false);
  const help = wrapper.children[0].children[1], tooltip = help.children[0];
  assert.equal(help.title, undefined);
  assert.equal(tooltip.attributes.popover, "manual");
  tooltip.style = {};
  let open = false;
  tooltip.showPopover = () => { open = true; };
  tooltip.hidePopover = () => { open = false; };
  help.getBoundingClientRect = () => ({ top: 100, bottom: 118, right: 310 });
  tooltip.getBoundingClientRect = () => ({ width: 240, height: 40 });
  help.listeners.focus();
  assert.equal(open, true);
  assert.equal(tooltip.style.left, "70px");
  assert.equal(tooltip.style.top, "52px");
  help.listeners.keydown({ key: "Escape" });
  assert.equal(open, false);
  assert.deepEqual(events, {});
  help.listeners.mouseenter();
  events.scroll();
  assert.equal(open, false);
});

test("all template currency-code definitions use organisation choices without length limits", () => {
  const seeds = require("../seeds/template-defaults.json");
  let count = 0;
  function walk(value) {
    if (!value || typeof value !== "object") return;
    for (const [key, field] of Object.entries(value)) {
      if (key === "currencyCode" && field && typeof field === "object" && field.type) {
        count++;
        assert.equal(field.type, "currency_code");
        for (const constraint of ["maxLength", "minLength", "pattern", "enum", "options"]) assert.equal(field[constraint], undefined);
      }
      walk(field);
    }
  }
  walk(seeds);
  assert.equal(count, 29);
});
