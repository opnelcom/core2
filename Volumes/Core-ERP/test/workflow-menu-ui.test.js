"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync(require.resolve("../public/app.js"), "utf8");

function fixture(rect, viewport = { clientWidth: 800, clientHeight: 600 }) {
  const events = {};
  const scope = {
    document: {
      body: { append(menu) { menu.attached = true; } },
      documentElement: viewport,
      addEventListener(name, handler) { events[name] = handler; },
    },
    window: { addEventListener(name, handler) { events[name] = handler; } },
  };
  vm.createContext(scope);
  vm.runInContext(source.slice(source.indexOf("  let activeWorkflowMenu ="),
    source.indexOf("  async function moveAccountingObjectWorkflow(")), scope);
  const button = { isConnected: true, attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; },
    getBoundingClientRect: () => rect, focus() { this.focused = true; } };
  const menu = { style: {}, hidden: true, attached: false,
    remove() { this.attached = false; }, contains(target) { return target === this; },
    getBoundingClientRect() { return {
      width: Math.min(190, parseFloat(this.style.maxWidth)),
      height: Math.min(150, parseFloat(this.style.maxHeight)),
    }; } };
  return { scope, button, menu, events };
}

test("last-row menu floats above its anchor outside the grid", () => {
  const { scope, button, menu } = fixture({ top: 530, bottom: 560, right: 760 });
  scope.openWorkflowMenu(button, menu);
  assert.equal(menu.attached, true);
  assert.equal(menu.hidden, false);
  assert.equal(menu.style.top, "374px");
  assert.equal(button.attributes["aria-expanded"], "true");
});

test("menu opens below when space permits and fits narrow viewports", () => {
  const { scope, button, menu } = fixture({ top: 30, bottom: 60, right: 25 },
    { clientWidth: 160, clientHeight: 300 });
  scope.openWorkflowMenu(button, menu);
  assert.equal(menu.style.top, "66px");
  assert.equal(menu.style.left, "8px");
  assert.equal(menu.style.maxWidth, "144px");
  assert.equal(menu.style.minWidth, "144px");
});

test("Escape restores focus; grid scrolling closes but menu scrolling does not", () => {
  const { scope, button, menu, events } = fixture({ top: 250, bottom: 280, right: 500 });
  scope.openWorkflowMenu(button, menu);
  events.scroll({ target: menu });
  assert.equal(menu.hidden, false);
  events.keydown({ key: "Escape", preventDefault() {} });
  assert.equal(menu.attached, false);
  assert.equal(button.focused, true);
  assert.equal(button.attributes["aria-expanded"], "false");
  scope.openWorkflowMenu(button, menu);
  events.scroll({ target: {} });
  assert.equal(menu.attached, false);
});

test("opening another status removes the previous floating menu", () => {
  const first = fixture({ top: 250, bottom: 280, right: 500 });
  const second = fixture({ top: 300, bottom: 330, right: 500 });
  first.scope.openWorkflowMenu(first.button, first.menu);
  first.scope.openWorkflowMenu(second.button, second.menu);
  assert.equal(first.menu.attached, false);
  assert.equal(first.button.attributes["aria-expanded"], "false");
  first.events.resize();
  assert.equal(second.menu.attached, false);
});
