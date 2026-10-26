'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
let chromium; try { ({ chromium } = require('playwright')); } catch {}
const read = name => fs.readFileSync(path.join(__dirname, '../public', name), 'utf8');
async function setup(browser) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  await page.setContent(`<style>${read('style.css')}\n${read('standard-grid.css')}body{display:block;padding:20px;overflow:auto}</style><div class="panel-head" id="toolbar"><div class="panel-actions"></div></div><div id="grid"></div>`);
  await page.addScriptTag({ content: read('standard-grid.js') });
  await page.evaluate(() => {
    const rows = [
      { name: 'Lease A', status: 'draft', owner: 'north', amount: 30, date: '2026-10-01' },
      { name: 'Lease B', status: 'approved', owner: 'south', amount: 10, date: '2026-10-23' },
      { name: 'Service', status: 'submitted', owner: 'north', amount: 20, date: '' },
    ];
    window.opened = []; window.actions = 0;
    window.config = { target: document.querySelector('#grid'), toolbar: document.querySelector('#toolbar'), contextKey: 'org:type', rows, onOpen: row => opened.push(row.name),
      columns: [
        { key: 'name', label: 'Name', type: 'text', width: 240, value: r => r.name },
        { key: 'status', label: 'Status', type: 'enum', value: r => r.status, options: ['draft', 'approved', 'submitted'] },
        { key: 'owner', label: 'Owner', type: 'enum', value: r => r.owner },
        { key: 'amount', label: 'Value', type: 'number', value: r => r.amount },
        { key: 'date', label: 'Valid from', type: 'date', value: r => r.date },
        { key: 'actions', label: 'Actions', export: false, value: () => '', render: () => { const b = document.createElement('button'); b.textContent = 'Action'; b.onclick = () => actions++; return b; } },
      ] };
    erpStandardGrid.render(config);
  });
  return page;
}
const launch = () => chromium.launch({ headless: true, ...(process.env.SHOWIF_BROWSER_CHANNEL ? { channel: process.env.SHOWIF_BROWSER_CHANNEL } : {}) });
test('shared headers are compact, vertically aligned and have only a bottom border at rest', { skip: !chromium }, async () => {
  const browser = await launch();
  try {
    const page = await setup(browser);
    for (const width of [1200, 390]) {
      await page.setViewportSize({ width, height: 900 });
      const geometry = await page.locator('thead th').evaluateAll(headers => headers.map(th => {
        const title = th.querySelector('.standard-grid-sort, .standard-grid-heading > span');
        const range = document.createRange(); range.selectNodeContents(title);
        const rect = range.getBoundingClientRect(), bounds = th.getBoundingClientRect(), style = getComputedStyle(th);
        return { height: bounds.height, centre: rect.y + rect.height / 2,
          top: style.borderTopWidth, left: style.borderLeftWidth, right: style.borderRightWidth, bottom: style.borderBottomWidth,
          resizeBorder: getComputedStyle(th.querySelector('.standard-grid-resize')).borderRightColor };
      }));
      assert.ok(geometry.every(th => th.height <= 40), JSON.stringify(geometry));
      assert.ok(Math.max(...geometry.map(th => th.centre)) - Math.min(...geometry.map(th => th.centre)) <= 1, JSON.stringify(geometry));
      assert.ok(geometry.every(th => th.top === '0px' && th.left === '0px' && th.right === '0px' && th.bottom === '1px' && th.resizeBorder === 'rgba(0, 0, 0, 0)'), JSON.stringify(geometry));
      assert.ok(await page.locator('[data-filter-key] svg').evaluateAll(icons => icons.every(icon => getComputedStyle(icon).fill === getComputedStyle(icon).color)));
      assert.equal(await page.locator('.standard-grid-menu-trigger svg').evaluate(icon => getComputedStyle(icon).fill), 'none');
    }
  } finally { await browser.close(); }
});
test('grid fills a wide panel and contains workflow buttons after narrowing columns', { skip: !chromium }, async () => {
  const browser = await launch();
  try {
    const page = await setup(browser);
    await page.evaluate(() => {
      config.columns[1].render = row => {
        const wrap = document.createElement('span'); wrap.className = 'workflow-status-wrap';
        const button = document.createElement('button'); button.className = 'workflow-status-button';
        const label = document.createElement('span'); label.className = 'workflow-status-label'; label.textContent = row.status;
        button.append(label); wrap.append(button); return wrap;
      };
      erpStandardGrid.render(config);
    });
    for (const width of [1834, 1200, 390]) {
      await page.setViewportSize({ width, height: 900 });
      const geometry = await page.locator('#grid').evaluate(grid => {
        const table = grid.querySelector('table').getBoundingClientRect();
        return { container: grid.clientWidth, table: table.width, contained: [...grid.querySelectorAll('.workflow-status-button')].every(button => {
          const a = button.getBoundingClientRect(), b = button.closest('td').getBoundingClientRect();
          return a.left >= b.left && a.right <= b.right;
        }) };
      });
      assert.ok(geometry.table >= geometry.container - 1, JSON.stringify(geometry));
      if (width === 1834) assert.ok(Math.abs(geometry.table - geometry.container) < 1, JSON.stringify(geometry));
      assert.equal(geometry.contained, true);
    }
    await page.setViewportSize({ width: 1200, height: 900 });
    await page.getByRole('separator', { name: 'Resize Status', exact: true }).focus();
    for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowLeft');
    assert.equal(await page.getByRole('separator', { name: 'Resize Status', exact: true }).getAttribute('aria-valuenow'), '90');
    assert.ok(await page.locator('.workflow-status-button').evaluateAll(buttons => buttons.every(button => button.getBoundingClientRect().right <= button.closest('td').getBoundingClientRect().right)));
  } finally { await browser.close(); }
});
test('Accounting Objects pilot uses the shared control while preserving hidden statuses, view switches and original action nodes', { skip: !chromium }, async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.setContent(`<style>${read('style.css')}\n${read('standard-grid.css')}body{display:block;padding:20px;overflow:auto}</style><section class="view"><div class="panel object-grid-panel"><div class="panel-head object-grid-toolbar"><h2 id="accounting-object-grid-title"></h2><div class="panel-actions"></div></div><div class="object-grid-filters"><input id="accounting-object-search"></div><div id="accounting-object-list"></div></div></section>`);
    for (const name of ['standard-grid.js', 'standard-grid-lists.js', 'workflow-grid-visibility.js', 'object-grid-views.js']) await page.addScriptTag({ content: read(name) });
    const app = read('app.js'), start = app.indexOf('  function renderAccountingMaster(kind)'), end = app.indexOf('\n  async function loadAccountingMasterRecords', start);
    await page.addScriptTag({ content: `
      const $=id=>document.getElementById(id);
      const state={orgId:'org',objects:[{object_code:'CON-1',object_name:'Contract',owner_division_id:'north',owner_division_name:'North',workflow_status:'submitted',workflow_step_label:'Submitted',valid_from:'2026-10-23'}, {object_code:'CON-2',object_name:'Hidden',owner_division_id:'south',owner_division_name:'South',workflow_status:'hidden',workflow_step_label:'Hidden'}],types:[{type_id:'type',default_grid_view:'columnar'}],workflowStatuses:[{status_code:'hidden',status_label:'Hidden',displayed:false},{status_code:'submitted',status_label:'Submitted'}],workflowSteps:[]};
      state.objects.forEach(r=>r.type_id='type');
      window.opened=[];window.actionClicks=0;window.workflowClicks=0;
      const accountingMasterConfig=()=>({isObject:true,prefix:'accounting-object',recordsKey:'objects',typesKey:'types',typeId:'type_id',selectedType:()=> 'type',code:'object_code',name:'object_name',viewId:'accountingobjects'});
      const fillAccountingMasterTypes=()=>{},syncAccountingMasterContext=()=>{},syncObjectGridContext=()=>{},closeWorkflowMenu=()=>{};
      const accountingMasterContextType=()=>({type_id:'type',type_name:'Contract'}),searchTerm=()=>'',rowMatches=()=>true;
      const accountingObjectParentLabel=()=>'',dateOnly=v=>v||'',workflowStepLabel=r=>r.workflow_step_label;
      const openAccountingMasterRecord=(kind,row)=>opened.push(row.object_code),objectActionContext=(kind,row)=>row;
      const objectActions={close(){},button(){const b=document.createElement('button');b.textContent='Actions';b.onclick=()=>actionClicks++;return b}};
      const workflowStatusButton=({row})=>{const b=document.createElement('button');b.textContent=row.workflow_step_label;b.onclick=()=>workflowClicks++;return b};
      const moveAccountingObjectWorkflow=async()=>{},selectedAccountingObjectTypeId='type';
      ${app.slice(app.indexOf('  function table('),app.indexOf('  function workflowStepsForPath('))}
      ${app.slice(start,end)}
      renderAccountingMaster('object');window.renderPilot=()=>renderAccountingMaster('object');
    ` });
    assert.equal(await page.locator('.standard-grid').count(), 1); assert.equal(await page.locator('tbody tr').count(), 1);
    await page.locator('tbody').getByRole('button', { name: 'Submitted', exact: true }).click();
    await page.locator('tbody').getByRole('button', { name: 'Actions', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => [opened, workflowClicks, actionClicks]), [[], 1, 1]);
    await page.getByLabel('Show hidden records').check(); assert.equal(await page.locator('tbody tr').count(), 2);
    await page.locator('.object-grid-view-control').getByRole('button', { name: 'Status', exact: true }).click();
    assert.equal(await page.locator('.standard-grid').count(), 0); assert.equal(await page.locator('.object-status-tile').count(), 2);
    assert.equal(await page.getByRole('button', { name: 'Grid options', exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Columnar', exact: true }).click(); assert.equal(await page.locator('.standard-grid').count(), 1);
    await page.evaluate(() => { renderPilot(); renderPilot(); }); assert.equal(await page.getByRole('button', { name: 'Grid options', exact: true }).count(), 1);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
test('shared grid stages enum search and all/none, applies/clears, discards drafts, and isolates record actions', { skip: !chromium }, async () => {
  const browser = await launch();
  try {
    const page = await setup(browser), errors = []; page.on('pageerror', error => errors.push(error.message));
    assert.equal(await page.getByRole('button', { name: 'Grid options', exact: true }).count(), 1);
    assert.equal(await page.locator('.standard-grid-popover').count(), 0);
    await page.locator('[data-filter-key=status]').click();
    let panel = page.locator('.standard-grid-popover');
    await panel.getByRole('searchbox').fill('appro'); assert.equal(await panel.locator('label:visible').count(), 1);
    await panel.getByRole('button', { name: 'Select no options', exact: true }).click();
    assert.equal(await panel.locator('input:checked').count(), 0); assert.equal(await page.locator('tbody tr').count(), 3);
    await panel.getByRole('button', { name: 'Select all options', exact: true }).click();
    assert.equal(await panel.locator('input:checked').count(), 3);
    await panel.getByRole('button', { name: 'Select no options', exact: true }).click();
    await panel.getByLabel('approved', { exact: true }).check(); await panel.getByRole('button', { name: 'Apply', exact: true }).click();
    assert.equal(await page.locator('tbody tr').count(), 1); assert.match(await page.locator('tbody').innerText(), /Lease B/);
    assert.equal(await page.locator('.standard-grid-filter-active').count(), 1);
    assert.ok(await page.locator('.standard-grid-filter-active svg').evaluate(icon => getComputedStyle(icon).fill === getComputedStyle(icon).color));
    await page.locator('[data-filter-key=status]').click();
    await panel.getByRole('button', { name: 'Select all options', exact: true }).click();
    await panel.getByRole('button', { name: 'Close', exact: true }).click();
    assert.equal(await page.locator('tbody tr').count(), 1);
    await page.locator('[data-filter-key=status]').click();
    assert.equal(await panel.locator('input:checked').count(), 1);
    await panel.getByRole('button', { name: 'Clear', exact: true }).click(); assert.equal(await page.locator('tbody tr').count(), 3);
    await page.locator('[data-filter-key=amount]').click();
    await panel.getByLabel('From', { exact: true }).fill('20'); await panel.getByLabel('To', { exact: true }).fill('10');
    await panel.getByRole('button', { name: 'Apply', exact: true }).click();
    assert.equal(await panel.isVisible(), true); assert.equal(await page.locator('tbody tr').count(), 3);
    await panel.getByLabel('To', { exact: true }).fill('30'); await panel.getByRole('button', { name: 'Apply', exact: true }).click();
    assert.equal(await page.locator('tbody tr').count(), 2);
    await page.getByRole('button', { name: 'Grid options', exact: true }).click(); await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
    assert.equal(await page.locator('tbody tr').count(), 3);
    await page.locator('tbody button').first().click(); assert.deepEqual(await page.evaluate(() => opened), []); assert.equal(await page.evaluate(() => actions), 1);
    await page.locator('tbody td').first().click(); assert.deepEqual(await page.evaluate(() => opened), ['Lease A']);
    await page.evaluate(() => erpStandardGrid.render(config)); assert.equal(await page.getByRole('button', { name: 'Grid options', exact: true }).count(), 1);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
test('grid sorts without inactive icons, resizes temporarily, exports downloads, and fits filter fields at narrow widths', { skip: !chromium }, async () => {
  const browser = await launch();
  try {
    const page = await setup(browser);
    assert.ok((await page.locator('[data-sort-key]').allTextContents()).every(label => !/[↑↓↕]/u.test(label)));
    await page.locator('[data-sort-key=amount]').click(); assert.match(await page.locator('tbody tr').first().innerText(), /Lease B/);
    await page.locator('[data-sort-key=name]').click(); assert.equal(await page.locator('th[aria-sort=ascending]').count(), 1);
    assert.equal(await page.locator('[data-sort-key=amount]').textContent(), 'Value');
    const resize = page.getByRole('separator', { name: 'Resize Name', exact: true });
    const handle = await resize.boundingBox(); await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down(); await page.mouse.move(handle.x + handle.width / 2 + 20, handle.y + handle.height / 2); await page.mouse.up();
    assert.equal(await resize.getAttribute('aria-valuenow'), '260');
    await page.getByRole('button', { name: 'Grid options', exact: true }).click(); await page.getByRole('button', { name: 'Reset widths', exact: true }).click();
    await resize.focus(); await page.keyboard.press('ArrowRight'); assert.equal(await resize.getAttribute('aria-valuenow'), '250');
    await page.evaluate(() => erpStandardGrid.render(config)); assert.equal(await resize.getAttribute('aria-valuenow'), '250');
    await page.getByRole('button', { name: 'Grid options', exact: true }).click(); await page.getByRole('button', { name: 'Reset widths', exact: true }).click();
    assert.equal(await resize.getAttribute('aria-valuenow'), '240');
    await page.locator('[data-filter-key=name]').click(); await page.getByLabel('Matches', { exact: true }).fill('*Lease*');
    await page.getByRole('button', { name: 'Apply', exact: true }).click();
    for (const format of ['txt', 'csv']) {
      await page.getByRole('button', { name: 'Grid options', exact: true }).click();
      await page.getByRole('button', { name: 'Export', exact: true }).click();
      const panel = page.locator('.standard-grid-popover'); await panel.getByLabel('Format', { exact: true }).selectOption(format);
      assert.match(await panel.innerText(), /Export 2 filtered rows/);
      const pending = page.waitForEvent('download'); await panel.getByRole('button', { name: 'Export', exact: true }).click();
      const download = await pending; assert.ok(download.suggestedFilename().endsWith('.' + format));
      const stream = await download.createReadStream(); let content = ''; for await (const chunk of stream) content += chunk.toString('utf8');
      assert.ok(content.includes('Lease A')); assert.ok(content.includes('Lease B')); assert.ok(!content.includes('Service')); assert.ok(!content.includes('Actions'));
    }
    for (const width of [1200, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(() => { document.querySelector('#grid').scrollLeft = 700; });
      await page.locator('[data-filter-key=date]').click();
      const geometry = await page.locator('.standard-grid-filter-fields label').evaluateAll(labels => labels.map(label => {
        const a = label.querySelector('span').getBoundingClientRect(), b = label.querySelector('input').getBoundingClientRect();
        return { gap: b.left - a.right, inside: b.right <= innerWidth - 8 };
      }));
      assert.ok(geometry.every(item => Math.abs(item.gap - 16) < 1 && item.inside), JSON.stringify({ width, geometry }));
      const footer = await page.locator('.standard-grid-popover-footer').evaluate(node => {
        const [clear, apply] = [...node.children].map(button => button.getBoundingClientRect());
        return { clear: clear.width, apply: apply.width, sameHeight: clear.height === apply.height,
          gap: apply.left - clear.right, right: node.getBoundingClientRect().right - apply.right };
      });
      assert.equal(footer.clear, footer.apply); assert.ok(footer.clear <= 80); assert.equal(footer.sameHeight, true);
      assert.equal(footer.gap, 8); assert.ok(Math.abs(footer.right) < 1);
      await page.getByRole('button', { name: 'Close', exact: true }).click();
    }
    await page.evaluate(() => { erpStandardGrid.destroy(config.target); erpStandardGrid.render({ ...config, contextKey: 'other-org:type' }); });
    assert.equal(await resize.getAttribute('aria-valuenow'), '240'); assert.equal(await page.locator('tbody tr').count(), 3);
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
      await page.locator('[data-filter-key=name]').click();
      const colours = await page.locator('.standard-grid-popover').evaluate(node => ({ ink: getComputedStyle(node).color, panel: getComputedStyle(node).backgroundColor }));
      assert.notEqual(colours.ink, colours.panel);
      await page.keyboard.press('Escape'); assert.equal(await page.locator('.standard-grid-popover').count(), 0);
    }
  } finally { await browser.close(); }
});
