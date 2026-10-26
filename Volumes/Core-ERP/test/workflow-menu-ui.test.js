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
  const button = { isConnected: true, attributes: {}, closest: () => null,
    setAttribute(name, value) { this.attributes[name] = value; },
    getBoundingClientRect: () => rect, focus() { this.focused = true; } };
  const menu = { style: {}, hidden: true, attached: false,
    setAttribute(name, value) { this[name] = value; },
    showPopover() { this.popoverOpen = true; }, hidePopover() { this.popoverOpen = false; },
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


let chromium; try {({chromium}=require('playwright'));} catch {}
test('workflow actions appear above native transaction modals and preserve dismissal', {skip:!chromium}, async () => {
  const browser=await chromium.launch({headless:true,channel:process.env.SHOWIF_BROWSER_CHANNEL || 'msedge'});
  try {
    const page=await browser.newPage();
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    for(const width of [1280,390]) {
      await page.goto("about:blank");
      await page.setViewportSize({width,height:800});
      await page.setContent(`<form id="journal-form" class="panel form"><h2>Transaction Capture</h2><button type="button" class="panel-close" onclick="this.closest('form').hidden=true">x</button><div style="height:120px">Journal fields</div><div id="footer"></div></form>`);
      await page.addStyleTag({path:require.resolve('../public/style.css')});
      await page.addScriptTag({path:require.resolve('../public/modal-editors.js')});
      await page.addScriptTag({content:`
        const workflowDot=colour=>document.createElement('span');
        const workflowStepLabel=row=>row.workflow_step_label;
        const pretty=value=>value;
        ${source.slice(source.indexOf('  let activeWorkflowMenu ='),source.indexOf('  function refreshWorkflowEditor('))}
        window.moves=[];
        document.getElementById('footer').append(workflowStatusButton({row:{workflow_step_label:'Submitted',available_workflow_steps:[{workflow_next_id:'reject',action_label:'Reject'},{workflow_next_id:'post',action_label:'Post'}]},onMove:id=>window.moves.push(id)}));
        window.erpModalEditors.install();
      `});
      const button=page.locator('.workflow-status-button');
      await button.click();
      const menu=page.locator('.workflow-status-menu');
      await menu.locator('button').last().focus();
      assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Post');
      const geometry=await menu.evaluate(node=>{
        const r=node.getBoundingClientRect();
        return {top:r.top,left:r.left,right:r.right,bottom:r.bottom,topLayer:node.matches(':popover-open'),
          modal:!!node.closest('dialog[open]'),hit:node.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};
      });
      assert.ok(geometry.topLayer && geometry.modal && geometry.hit,JSON.stringify(geometry));
      assert.ok(geometry.left>=0 && geometry.right<=width && geometry.top>=0 && geometry.bottom<=800);
      await menu.getByRole('button',{name:'Post',exact:true}).click();
      assert.deepEqual(await page.evaluate(()=>window.moves),['post']);
      assert.equal(await menu.count(),0);
      await button.click();
      await page.keyboard.press('Escape');
      assert.equal(await menu.count(),0);
      assert.equal(await page.locator('dialog[open]').count(),1);
      assert.equal(await button.evaluate(node=>node===document.activeElement),true);
      await button.click();
      await page.locator('.panel-close').click();
      await page.waitForFunction(()=>!document.querySelector('dialog[open]') && !document.querySelector('.workflow-status-menu'));
      assert.deepEqual(errors,[]);
    }
  } finally {await browser.close();}
});
