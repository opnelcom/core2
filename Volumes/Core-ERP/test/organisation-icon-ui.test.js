"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync(require.resolve("../public/app.js"), "utf8");
function fixture() {
  const node = (localName, attrs = {}, children = []) => ({ localName, attrs, children,
    getAttribute(key) { return this.attrs[key] || null; },
    setAttribute(key, value) { this.attrs[key] = value; } });
  const filled = node("path", {fill: "#ff0000"});
  const outline = node("path", {fill: "none", stroke: "#000000"});
  const root = node("svg", {}, [filled, outline]);
  const icon = { style: {}, setAttribute() {}, querySelector: () => root };
  const scope = { document: { createElement: () => icon },
    sanitizedOrganisationSvg: value => value, menuIconSvg: {organisation: "fallback"} };
  vm.createContext(scope);
  vm.runInContext(source.slice(source.indexOf("  function organisationIconElement("), source.indexOf("  const menuIconSvg =")), scope);
  return { scope, icon, root, filled, outline };
}
test("colour override tints paints while preserving outlined and unpainted shapes", () => {
  const {scope, icon, filled, outline} = fixture();
  scope.organisationIconElement("original", "test-icon", "#287D94");
  assert.equal(icon.style.color, "#287D94");
  assert.equal(icon.innerHTML, "original");
  assert.equal(filled.attrs.fill, "currentColor");
  assert.equal(filled.attrs.stroke, "none");
  assert.equal(outline.attrs.fill, "none");
  assert.equal(outline.attrs.stroke, "currentColor");
});
test("no override preserves original colours and invalid colour never reaches styles", () => {
  for (const colour of [null, "red", "url(example)"]) {
    const {scope, icon, filled} = fixture();
    scope.organisationIconElement("original", "test-icon", colour);
    assert.equal(icon.style.color, undefined);
    assert.equal(filled.attrs.fill, "#ff0000");
  }
});
