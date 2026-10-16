const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/JoeO/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..');
(async()=>{
  const browser=await chromium.launch({headless:true,channel:'msedge'});
  try {
    const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.setContent('<html><head></head><body style="display:block;overflow:auto;padding:16px"><div class="panel"><div class="panel-head" id="toolbar"></div><div id="grid"></div></div></body></html>');
    await page.addStyleTag({content:fs.readFileSync(path.join(root,'public/style.css'),'utf8')});
    await page.addScriptTag({content:fs.readFileSync(path.join(root,'public/object-grid-views.js'),'utf8')});
    await page.evaluate(()=>{
      const form=document.createElement('form');form.id='type-default-fixture';form.className='panel form erp-field-rows organisation-setup-editor';
      for(const prefix of ['ledger-family','accounting-object-type','accounting-dimension-type','transaction-type']){
        const label=document.createElement('label');label.textContent='Workflow';
        const workflow=document.createElement('select');workflow.id=prefix+'-workflow-path';label.append(workflow);form.append(label);
        document.body.append(form);
        erpObjectGridViews.installDefaultControl(workflow,prefix+'-default-grid-view');
        erpObjectGridViews.installDefaultControl(workflow,prefix+'-default-grid-view');
      }
    });
    for(const prefix of ['ledger-family','accounting-object-type','accounting-dimension-type','transaction-type']) {
      const select=page.locator('#'+prefix+'-default-grid-view');
      assert.deepEqual(await select.locator('option').allTextContents(),['Columnar','Status']);
      await select.selectOption('status');assert.equal(await select.inputValue(),'status');
    }
    const source=fs.readFileSync(path.join(root,'public/app.js'),'utf8');
    await page.addScriptTag({content:`const pretty=s=>s;${source.slice(source.indexOf('  function table('),source.indexOf('  function workflowStepsForPath('))}${source.slice(source.indexOf('  function workflowStepLabel('),source.indexOf('  async function moveSubledgerWorkflow('))}`});
    for(const width of [1280,390]) {
      await page.setViewportSize({width,height:850});
      await page.evaluate(()=>{
        window.opened=null;window.moved=null;
        const rows=[{code:'1',name:'Contract',workflow_status:'active',path:'a',workflow_step_colour:'#067647',available_workflow_steps:[{workflow_next_id:'block-action',action_label:'Block',colour:'#b42318'}]},
          {code:'2',name:'A long contract name that should wrap safely inside its column',workflow_status:'draft',path:'a'}];
        window.config={target:document.getElementById('grid'),toolbar:document.getElementById('toolbar'),rows,
          columns:[['Code',r=>r.code],['Name',r=>r.name]],table,onOpen:r=>{window.opened=r.code;},code:r=>r.code,name:r=>r.name,
          workflowButton:r=>workflowStatusButton({row:r,onMove:id=>{window.moved=id;}}),
          statuses:[{status_code:'active',status_label:'Active',colour:'#067647'},{status_code:'draft',status_label:'Draft',colour:'#2563eb'}],
          steps:[{workflow_path_id:'a',step_code:'active',sort_order:20},{workflow_path_id:'a',step_code:'draft',sort_order:10}],workflowPath:r=>r.path,beforeChange:closeWorkflowMenu};
        erpObjectGridViews.render(window.config);
      });
      await page.getByLabel('Grid Views',{exact:true}).selectOption('Columnar');
      assert.equal(await page.locator('.data-grid tbody tr').count(),2);
      await page.getByLabel('Grid Views',{exact:true}).selectOption('Status');
      assert.equal(await page.locator('.object-status-column').count(),2);
      await page.getByRole('button',{name:'Open 1 Contract',exact:true}).click();
      assert.equal(await page.evaluate(()=>window.opened),'1');
      const workflow=page.locator('.object-status-column').nth(1).locator('.workflow-status-button');
      await workflow.scrollIntoViewIfNeeded();
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      await workflow.click();
      await page.getByRole('button',{name:'Block',exact:true}).click();
      assert.equal(await page.evaluate(()=>window.moved),'block-action');
      const sizes=await page.locator('.workflow-status-button').evaluateAll(bs=>bs.map(b=>b.getBoundingClientRect().width));
      assert.ok(sizes.every(w=>w===220));
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
      await page.evaluate(()=>{window.config.contextKey='org:type-a';window.config.defaultView='status';erpObjectGridViews.render(window.config);});
      assert.equal(await page.getByLabel('Grid Views',{exact:true}).inputValue(),'Status');
      await page.getByLabel('Grid Views',{exact:true}).selectOption('Columnar');
      await page.evaluate(()=>erpObjectGridViews.render(window.config));
      assert.equal(await page.getByLabel('Grid Views',{exact:true}).inputValue(),'Columnar');
      await page.evaluate(()=>{window.config.contextKey='org:type-b';erpObjectGridViews.render(window.config);});
      assert.equal(await page.getByLabel('Grid Views',{exact:true}).inputValue(),'Status');
      await page.evaluate(()=>{window.config.rows=window.config.rows.slice(0,1);erpObjectGridViews.render(window.config);});
      assert.equal(await page.locator('.object-status-column').count(),1);
      await page.screenshot({path:path.join(root,`tmp/grid-views-${width}.png`),fullPage:true});
      console.log(`Browser fixture passed at ${width}px: switching, populated columns, editor action, workflow transition, 220px buttons and contained scrolling.`);
    }
    assert.deepEqual(errors,[]);
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
