'use strict';
const fs = require('node:fs');
const path = require('node:path');
class BrowserGap extends Error {
  constructor(message, kind = 'automation_gap') { super(message); this.code = kind; }
}
// Form contracts use the ERP's existing controls. Unsupported operations stop;
// this adapter never invokes a mutation API or assigns application state.
const forms = {
  'organisations/save': ['organisations','add-org','organisation-form', {organisation_code:'org-code',organisation_name:'org-name',base_currency_code:'org-currency',is_template:'org-template'}],
  'divisions/save': ['divisions','add-division','division-form',{parent_division_id:'division-parent',division_code:'division-code',division_name:'division-name',workflow_status:'division-status'}],
  'modules/save': ['modules','add-module','module-form',{module_code:'module-code',module_name:'module-name',is_active:'module-active'}],
  'fiscal/save-year': ['fiscal','add-fiscal-year','fiscal-form',{fiscal_year_code:'fiscal-code',start_date:'fiscal-start',end_date:'fiscal-end',status:'fiscal-status',create_periods:'fiscal-periods'}],
  'fiscal/save-period': ['fiscal','new-fiscal-period','fiscal-period-form',{period_number:'period-number',start_date:'period-start',end_date:'period-end',status:'period-status'}],
  'gl-account-types/save': ['glaccounttypes','add-gl-account-type','gl-account-type-form',{type_code:'gl-account-type-code',type_name:'gl-account-type-name',is_required:'gl-account-type-required',is_active:'gl-account-type-active'}],
  'legal-entities/save': ['legalentities','add-legal-entity','legal-entity-form',{entity_type:'legal-entity-type',legal_name:'legal-entity-legal-name',known_name:'legal-entity-known-name',workflow_status:'legal-entity-status'}],
  'transaction-groups/save': ['transactiongroups','add-transaction-group','transaction-group-form',{group_code:'transaction-group-code',group_name:'transaction-group-name',is_active:'transaction-group-active'}],
  'tax-types/save': ['taxtypes','add-tax-type','tax-type-form',{tax_type_code:'tax-type-code',tax_type_description:'tax-type-description',tax_direction:'tax-type-direction',is_active:'tax-type-active'}],
  'transaction-types/save': ['transactiontypes','add-transaction-type','transaction-type-form',{transaction_group_id:'transaction-type-group',type_code:'transaction-type-code',type_name:'transaction-type-name',is_financial:'transaction-type-financial',allow_additional_lines:'transaction-type-additional-lines',is_active:'transaction-type-active'}],
  'financial-formats/save': ['financialformats','add-financial-format','financial-format-form',{format_code:'financial-format-code',format_name:'financial-format-name',statement_type:'financial-format-type',is_active:'financial-format-active'}]
};
forms['permissions/save']=['permissions','add-role','role-form',{role_name:'role-name',is_admin:'role-admin',is_active:'role-active'}];
for (const [route,prefix,view,button] of [
  ['subledger-account-types/save','ledger-family','ledgerfamilies','add-ledger-family'],
  ['accounting-objects/save-type','accounting-object-type','accountingobjecttypes','add-accounting-object-type'],
  ['accounting-dimensions/save-type','accounting-dimension-type','accountingdimensiontypes','add-accounting-dimension-type']
]) forms[route]=[view,button,`${prefix}-form`,{type_code:`${prefix}-code`,type_name:`${prefix}-name`,workflow_path_id:`${prefix}-workflow-path`,schema_json:`${prefix}-schema`,is_active:`${prefix}-active`,...(prefix==='ledger-family'?{requires_legal_entity:'ledger-family-legal-entity'}:{})},prefix];
class BrowserExecutor {
  constructor(client, root, options={}) { this.client=client; this.root=root; this.options=options; this.sessions=new Map(); }
  async page(run, mode) {
    const key=`${run.id}:${mode}`;
    if(this.sessions.has(key))return this.sessions.get(key).page;
    let playwright;
    try { playwright=this.options.playwright || require(process.env.ERP_TEST_PLAYWRIGHT_MODULE || 'playwright'); }
    catch { throw new BrowserGap('Install the test tool dependencies (Playwright) before browser execution.'); }
    const channel=process.env.ERP_TEST_BROWSER_CHANNEL||'chrome';
    const browser=await playwright.chromium.launch({headless:mode==='ui-headless',...(channel==='chromium'?{}:{channel}),slowMo:mode==='ui-visible'?150:0});
    try {
      const context=await browser.newContext({viewport:{width:1440,height:1000}});
      await context.addCookies([...this.client.cookies].map(([name,value])=>({name,value,url:this.client.baseUrl,httpOnly:true,sameSite:'Lax'})));
      const page=await context.newPage();page.setDefaultTimeout(12000);
      page.on('dialog',async dialog=>{ if(dialog.type()==='confirm')await dialog.dismiss();else await dialog.accept(); });
      // Record metadata only; request bodies and authentication headers are excluded.
      const requests=[]; page.on('response',r=>{ const u=new URL(r.url());if(u.origin===this.client.baseUrl&&u.pathname.startsWith('/erp/api/'))requests.push({path:u.pathname,method:r.request().method(),status:r.status()}); });
      this.sessions.set(key,{browser,context,page,requests});return page;
    } catch(error) { await browser.close();throw error; }
  }
  async close() { for(const s of this.sessions.values())await s.browser.close();this.sessions.clear(); }
  async reveal(page, locator) {
    if(await locator.isVisible())return;
    // Inspect panel metadata only, then click the actual tab controlling it.
    const panels=await locator.evaluate(e=>{const a=[];for(let p=e.parentElement;p;p=p.parentElement)if(p.hidden)a.push({id:p.id,setup:p.dataset.setupTypePanel,panel:p.dataset.panel,detail:p.dataset.accountDetailPanel,fixed:p.dataset.accountFixedPanel,record:p.dataset.recordPanel,tx:p.dataset.transactionTypePanel});return a.reverse();});
    for(const p of panels){let selector;
      if(p.setup)selector=`[data-setup-type-tab="${p.setup}"][data-tab="${p.panel}"]`;
      else if(p.detail)selector=`[data-account-detail-tab="${p.detail}"]`;
      else if(p.fixed)selector=`[data-account-fixed-tab="${p.fixed}"]`;
      else if(p.record)selector=`[data-record-tab="${p.record}"]`;
      else if(p.tx)selector=`[data-transaction-type-tab="${p.tx}"]`;
      else if(p.id?.startsWith('transaction-type-tab-'))selector=`[data-transaction-type-tab="${p.id.replace('transaction-type-tab-','')}"]`;
      else if(p.id?.startsWith('role-tab-'))selector=`[data-role-tab="${p.id.replace('role-tab-','')}"]`;
      else if(p.id)selector=`[aria-controls="${p.id}"]`;
      if(selector)await page.locator(selector).filter({visible:true}).first().click();
    }
    await locator.waitFor({state:'visible'});
  }
  async field(page, locator, value) {
    if(value===undefined||value===null)return;
    await this.reveal(page,locator);
    const meta=await locator.evaluate(e=>({tag:e.tagName,type:e.type,disabled:e.disabled,readOnly:e.readOnly}));
    if(meta.disabled||meta.readOnly){const current=await locator.inputValue();if(String(current)!==String(value))throw new BrowserGap('A locked ERP field differs from the scenario value.');return;}
    if(meta.type==='checkbox')await locator.setChecked(Boolean(value));
    else if(meta.tag==='SELECT')await locator.selectOption(Array.isArray(value)?value.map(String):String(value));
    else {await locator.fill(typeof value==='object'?JSON.stringify(value):String(value));await locator.dispatchEvent('change');}
  }
  async fields(page, scope, map, body) {for(const [key,selector]of Object.entries(map))await this.field(page,scope.locator(selector.startsWith('.')?selector:`#${selector}`),body[key]);}
  async modules(page,prefix,ids) {
    if(!ids)return;
    const l=page.locator(`#${prefix}-modules`);await this.reveal(page,l);
    if(await l.evaluate(e=>e.tagName==='SELECT'))await l.selectOption(ids);
    else {for(const checkbox of await l.locator('input[type="checkbox"]').all())await checkbox.setChecked(ids.includes(await checkbox.getAttribute('value')));}
  }
  async navigate(page,run,body,view) {
    const query=new URLSearchParams({organisation_id:body.organisation_id||body.access_organisation_id||run.parameters.adminOrganisationId,view});
    if(run.outputs.root?.division_id)query.set('division_id',run.outputs.root.division_id);
    await page.goto(`${this.client.baseUrl}/erp/?${query}`);
    await page.locator('body').waitFor();
  }
  async submit(page,form,endpoint) {
    const response=page.waitForResponse(r=>new URL(r.url()).pathname===endpoint&&r.request().method()==='POST');
    const [r]=await Promise.all([response,form.locator('button[type="submit"], button:not([type])').filter({visible:true}).first().click()]);
    const payload=await r.json();if(!r.ok())throw new Error(payload.error||`ERP UI save returned ${r.status()}`);
  }
  async rows(page, selector, add, items, map) {
    while(await page.locator(selector).count())await page.locator(selector).last().locator('button').filter({hasText:/Remove|Delete/}).click();
    for(const item of items){await this.reveal(page,page.locator(add));await page.locator(add).click();await this.fields(page,page.locator(selector).last(),map,item);}
  }
  async entity(page,run,step,body) {
    const route=step.endpoint.replace('/erp/api/','');
    if(route==='permissions/claim-admin')throw new BrowserGap('ERP UI has no control for claiming the initial setup administrator. Complete this step explicitly in API mode, then resume UI execution.', 'capability_gap');
    if(route==='permissions/save'&&(body.master_permissions?.length||body.transaction_permissions?.length))throw new BrowserGap('The browser adapter cannot reproduce wildcard permission rows through the ERP permission tree. Explicit API or manual execution is required for this saved scenario version.');
    let contract=forms[route];
    if(route==='gl-accounts/save'||route==='subledger-accounts/save')contract=['accounts','add-account','account-form',{}];
    if(route==='accounting-objects/save'||route==='accounting-dimensions/save'){const p=route.includes('objects')?'accounting-object':'accounting-dimension';contract=[route.includes('objects')?'accountingobjects':'accountingdimensions',`add-${p}`,`${p}-form`,{},p];}
    if(route==='setup/workflows')contract=['workflows','add-workflow','workflow-form',{}];
    if(!contract)throw new BrowserGap(`No browser form contract for ${route}`);
    const [view,add,formId,map,prefix]=contract;
    await this.navigate(page,run,body,view);
    if(route==='gl-accounts/save'||route==='subledger-accounts/save'){
      const type=Object.values(run.outputs).find(o=>o.subledger_account_type_id===body.subledger_account_type_id&&o.type_code);
      const family=body.subledger_account_type_id?type?.type_code:'gl';if(!family)throw new Error('Subledger class output missing');
      const menu=page.locator(`[data-ledger-family="${family}"]`).first();await this.reveal(page,menu);await menu.click();
    }
    if(route==='fiscal/save-period'){
      const year=run.outputs.year.fiscal_year_code;await page.locator('#fiscal-year-list').getByText(year,{exact:true}).click();
      if(body.period_code!==`${year}-01`)throw new BrowserGap('The ERP UI generates period code YEAR-01; the requested custom period code cannot be entered.','capability_gap');
    }
    await page.locator(`#${add}`).click();const form=page.locator(`#${formId}`);await form.waitFor({state:'visible'});
    await this.fields(page,form,map,body);
    if(route==='permissions/save'){
      await this.modules(page,'role',body.module_ids);
      await page.locator('[data-role-tab="users"]').click();
      await this.rows(page,'.role-user-line:not(.role-user-line-head)','#add-role-user',body.role_users,{email:'.role-user-email',valid_from:'.role-user-from',valid_to:'.role-user-to'});
    }
    if((prefix&&route.endsWith('type'))||route==='subledger-account-types/save')await this.modules(page,prefix,body.module_ids);
    if(route==='gl-accounts/save'||route==='subledger-accounts/save'){
      let family='gl';if(body.subledger_account_type_id){const type=Object.values(run.outputs).find(o=>o.subledger_account_type_id===body.subledger_account_type_id&&o.type_code);if(!type)throw new Error('Subledger class output missing');family=type.type_code;}
      await this.field(page,form.locator('#account-form-family'),family);
      await this.fields(page,form,{gl_account_type_id:'account-type',owner_division_id:'account-division',legal_entity_id:'account-legal-entity',requires_subledger:'account-requires-subledger',required_subledger_account_type_id:'account-subledger-family',account_code:'account-code',account_name:'account-name'},body);
    }
    if(route==='accounting-objects/save'||route==='accounting-dimensions/save'){
      const object=route.includes('objects'),p=prefix;
      await this.fields(page,form,{[object?'accounting_object_type_id':'accounting_dimension_type_id']:`${p}-type`,owner_division_id:`${p}-division`,[object?'object_code':'dimension_code']:`${p}-code`,[object?'object_name':'dimension_name']:`${p}-name`},body);
      for(const [key,value]of Object.entries(body.additional_data||{}))await this.field(page,form.locator(`[data-detail-field="${key}"]`),value);
    }
    if(route==='tax-types/save')await this.rows(page,'.tax-rate-line:not(.tax-rate-line-head)','#add-tax-rate',body.rates,{tax_rate:'.tax-rate-value',valid_from:'.tax-rate-from',valid_to:'.tax-rate-to',is_active:'.tax-rate-active'});
    if(route==='setup/workflows'){
      await this.fields(page,form,{path_name:'workflow-path-name',is_active:'workflow-path-active'},body);
      await this.rows(page,'.workflow-step-line:not(.workflow-step-line-head)','#add-workflow-step',body.steps,{step_code:'.workflow-step-code',step_label:'.workflow-step-label',sort_order:'.workflow-step-sort'});
      await this.field(page,form.locator('#workflow-initial-step'),body.initial_step_code);
    }
    if(route==='financial-formats/save')await this.rows(page,'.financial-line:not(.financial-line-head)','#add-financial-line',body.lines,{sort_order:'.financial-line-order',line_code:'.financial-line-code',line_label:'.financial-line-label',line_type:'.financial-line-type',account_ids:'.financial-line-accounts'});
    if(route==='transaction-types/save'){
      await this.modules(page,'transaction-type',body.module_ids);
      const tab=page.locator('[data-setup-type-tab="transaction-type"][data-tab="lines"]');await tab.click();
      while(await page.locator('.transaction-type-line').count()) {const row=page.locator('.transaction-type-line').last();await row.locator('.transaction-line-summary').click();await row.locator('.tx-line-remove').click();}
      for(const line of body.lines){await page.locator('#add-transaction-line').click();const row=page.locator('.transaction-type-line').last();if(!await row.locator('.tx-line-code').isVisible())await row.locator('.transaction-line-summary').click();
        await this.fields(page,row,{line_code:'.tx-line-code',occurrence:'.tx-line-occurrence',amount_source:'.tx-line-amount-source',debit_credit:'.tx-line-drcr',gl_account_id:'.tx-line-gl',subledger_requirement:'.tx-line-subledger-requirement',subledger_account_type_id:'.tx-line-subledger'},line);
        for(const kind of ['object','dimension'])for(const requirement of line[`${kind}_requirements`]||[]){await row.locator(`.tx-add-${kind}`).click();const item=row.locator(`.tx-line-${kind}-requirements .tx-line-classification-requirement`).last();await this.fields(page,item,{type_id:'.tx-classification-type',requirement:'.tx-classification-requirement',value_behaviour:'.tx-classification-behaviour',[`accounting_${kind}_id`]:'.tx-classification-value'},requirement);}
      }
    }
    await this.submit(page,form,step.endpoint);
  }
  async execute(run,step,body,mode,runner) {
    const page=await this.page(run,mode),session=this.sessions.get(`${run.id}:${mode}`),start=session.requests.length;
    const evidence={mode};
    let action='created';
    try {
      if(!['journal','negative','checkpoint','statement'].includes(step.kind)){
        let found;try{found=await runner.find(run,step);}catch(error){if(step.id!=='claim'||error.status!==403)throw error;}
        if(found?.row){await this.navigate(page,run,body,forms[step.endpoint.replace('/erp/api/','')]?.[0]||'dashboard');action='existing';}
        else await this.entity(page,run,step,body);
      } else if(step.kind==='journal')await this.journal(page,run,step,body,runner);
      else if(step.kind==='checkpoint'||step.kind==='statement')await this.report(page,run,step,body);
      else throw new BrowserGap('UI validation probes are not implemented yet. API rejection tests remain a separate explicit execution mode.');
      Object.assign(evidence,{action,url:page.url(),requests:session.requests.slice(start)});return evidence;
    } catch(error) {
      Object.assign(evidence,{action:'failed',url:page.url(),requests:session.requests.slice(start)});error.browserEvidence=evidence;throw error;
    } finally {
      const folder=path.join(this.root,run.id);fs.mkdirSync(folder,{recursive:true});
      // Screenshot filenames use a digest rather than scenario text or user input.
      const name=require('node:crypto').createHash('sha256').update(step.id).digest('hex').slice(0,20);
      const screenshot=path.join(folder,`${name}.png`);
      try{await page.screenshot({path:screenshot,fullPage:true});evidence.screenshot=screenshot;}catch{evidence.screenshotError='Screenshot unavailable';}
    }
  }
  async journal(page,run,step,body,runner) {
    const marker=`ERPTEST:${run.id}:${step.id}`;
    const list=(await this.client.request('/erp/api/journals/list','GET',{organisation_id:body.organisation_id})).journals;
    const matches=list.filter(j=>j.description===marker);if(matches.length>1)throw new Error('Duplicate journal marker');
    await this.navigate(page,run,body,'journals');
    // Transaction menus select the capture type through the application's normal navigation.
    const menu=page.locator(`[data-transaction-type="${body.transaction_type_id}"]`).first();
    await this.reveal(page,menu);
    await menu.click();
    if(matches.length)await page.locator('#journal-list').getByText(marker,{exact:true}).click();
    else {
      await page.locator('#add-journal').click();const form=page.locator('#journal-form');
      await this.fields(page,form,{source_division_id:'journal-division',journal_date:'journal-date',fiscal_period_id:'journal-period'},body);
      await this.field(page,form.locator('#journal-description'),marker);
      const reference=await this.client.request('/erp/api/setup/reference','GET',{organisation_id:body.organisation_id});
      const defs=reference.line_definitions.filter(d=>d.transaction_type_id===body.transaction_type_id);
      const used=new Set();
      for(const line of body.lines){const d=defs.find(d=>d.line_code===line.definition);if(!d)throw new Error('Missing definition');let row;
        const rows=await form.locator('.journal-line:not(.journal-line-head)').all();
        for(let i=0;i<rows.length;i++)if(!used.has(i)&&await rows[i].locator('.line-definition').inputValue()===d.transaction_line_definition_id){row=rows[i];used.add(i);break;}
        if(!row){await page.locator('#add-journal-line').click();row=form.locator('.journal-line:not(.journal-line-head)').last();await row.locator('.line-definition').selectOption(d.transaction_line_definition_id);used.add(await form.locator('.journal-line:not(.journal-line-head)').count()-1);}
        if(line.subledger_account_id)await this.field(page,row.locator('.line-sub'),line.subledger_account_id);
        if(d.amount_source!=='balancing')await this.field(page,row.locator('.line-amount'),Number(line.debit_amount)||Number(line.credit_amount));
        for(const kind of ['object','dimension'])for(const c of line[`accounting_${kind}s`]||[])await this.field(page,row.locator(`[data-classification-kind="${kind}"][data-type-id="${c.type_id}"]`),c.value_id);
      }
      const rows=await form.locator('.journal-line:not(.journal-line-head)').all();for(let i=rows.length-1;i>=0;i--)if(!used.has(i))await rows[i].getByRole('button',{name:'Remove',exact:true}).click();
      await this.submit(page,form,'/erp/api/journals/save');
      await page.locator('#journal-list').getByText(marker,{exact:true}).click();
    }
    for(const [status,action]of [['draft','submit'],['submitted','approve']]){
      const j=(await this.client.request('/erp/api/journals/list','GET',{organisation_id:body.organisation_id})).journals.find(j=>j.description===marker);
      if(j?.workflow_status===status){const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/erp/api/journals/workflow'&&r.request().method()==='POST');const [r]=await Promise.all([response,page.locator(`[data-journal-action="${action}"]`).click()]);if(!r.ok())throw new Error((await r.json()).error);}
    }
  }
  async report(page,run,step,query){
    await this.navigate(page,run,query,'reports');
    const kind=step.kind==='checkpoint'?'ledger':'financial_statement';
    const menu=page.locator(`[data-report-view="${kind}"]`).first();
    await this.reveal(page,menu);
    await menu.click();
    await this.field(page,page.locator('#report-year'),run.outputs.year.fiscal_year_id);
    await this.fields(page,page,{format_id:'report-format',period_from_id:'report-period-from',period_to_id:'report-period-to'},query);
    const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/erp/api/reports/financial');
    const [r]=await Promise.all([response,page.locator('#run-report').click()]);if(!r.ok())throw new Error((await r.json()).error);
    await page.locator('#report-result table').first().waitFor({state:'visible'});
  }
}
module.exports={BrowserExecutor,BrowserGap,forms};
