'use strict';
const { randomUUID } = require('node:crypto');
const { cents, subset, comparePostings, ledgerComparison } = require('./checks');
function get(value, dotted) { return dotted.split('.').reduce((v, key) => v?.[key], value); }
function resolve(value, context) {
  if (value && typeof value === 'object' && !Array.isArray(value) && '$ref' in value) {
    const result = get(context, value.$ref);
    if (result === undefined) throw new Error(`Unresolved prerequisite ${value.$ref}`);
    return result;
  }
  if (Array.isArray(value)) return value.map(v => resolve(v, context));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolve(v, context)]));
  return value;
}
class Runner {
  constructor(store, client, browser) { this.store = store; this.client = client; this.browser = browser; this.busy = new Set(); this.pauses = new Set(); }
  create(pack, parameters, connection) {
    const run = { id: randomUUID(), createdAt: new Date().toISOString(), status: 'ready', pack,
      parameters, connection, outputs: {}, results: {}, events: [] };
    this.store.save(run); return run;
  }
  context(run) { return { parameters: run.parameters, outputs: run.outputs, connection: run.connection }; }
  event(run, message) { run.events.push({ at: new Date().toISOString(), message }); }
  pause(id) { this.pauses.add(id); }
  async find(run, step) {
    const lookup = resolve(step.lookup, this.context(run));
    const response = await this.client.request(lookup.endpoint, 'GET', lookup.query || {});
    const rows = get(response, lookup.collection);
    if (!Array.isArray(rows)) throw new Error(`Expected collection ${lookup.collection} from ${lookup.endpoint}`);
    const matches = rows.filter(row => subset(row, lookup.match).length === 0);
    if (matches.length > 1) throw new Error('Ambiguous record: multiple matches; no automatic mutation performed');
    return { row: matches[0], response };
  }
  async entity(run, step, mode) {
    let found;
    try { found = await this.find(run, step); }
    catch(error) {
      if(step.id !== 'claim' || mode !== 'auto' || error.status !== 403) throw error;
      // A new organisation has no administrator yet, so its roles cannot be read.
      await this.client.request(step.endpoint, 'POST', resolve(step.body, this.context(run)));
      found = await this.find(run, step);
    }
    if (!found.row && mode === 'auto') {
      await this.client.request(step.endpoint, 'POST', resolve(step.body, this.context(run)));
      found = await this.find(run, step);
    }
    if (!found.row) throw new Error('Record not found. Complete the ERP step, then verify again.');
    const expected = resolve(step.expected || step.lookup.match, this.context(run));
    let differences = subset(found.row, expected);
    if(step.id==='claim' && !(found.response.role_users||[]).some(u=>u.role_id===found.row.role_id&&String(u.email).toLowerCase()===String(run.connection.email).toLowerCase()))differences.push({path:'creator_administrator',expected:run.connection.email,actual:'Administrator user assignment missing'});
    if (step.kind === 'transaction-type') {
      const lines = found.response.line_definitions.filter(l => l.transaction_type_id === found.row.transaction_type_id);
      const actual = lines.map(line => ({ line_code: line.line_code, debit_credit: line.debit_credit, gl_account_id: line.gl_account_id,
        occurrence: line.occurrence, amount_source: line.amount_source, subledger_requirement: line.subledger_requirement,
        subledger_account_type_id: line.subledger_account_type_id,
        object_requirements: line.object_requirements.map(r => ({ type_id: r.accounting_object_type_id, requirement: r.requirement, value_behaviour: r.value_behaviour, accounting_object_id: r.accounting_object_id })),
        dimension_requirements: line.dimension_requirements.map(r => ({ type_id: r.accounting_dimension_type_id, requirement: r.requirement, value_behaviour: r.value_behaviour, accounting_dimension_id: r.accounting_dimension_id })) }));
      differences.push(...subset(actual, resolve(step.expectedLines, this.context(run)), 'lines'));
    }
    if (step.kind === 'tax') differences.push(...subset(found.response.tax_rates.filter(r => r.tax_type_id === found.row.tax_type_id).map(r => ({ tax_rate: Number(r.tax_rate), valid_from: String(r.valid_from).slice(0,10), valid_to: r.valid_to ? String(r.valid_to).slice(0,10) : null })).sort((a,b)=>a.valid_from.localeCompare(b.valid_from)), [...step.expectedRates].sort((a,b)=>a.valid_from.localeCompare(b.valid_from)), 'rates'));
    if (step.kind === 'permissions') {
      const body = resolve(step.body, this.context(run));
      for (const wanted of [...body.master_permissions, ...body.transaction_permissions.map(r => ({ ...r, resource_kind: 'transaction' }))]) {
        const match = { role_id: found.row.role_id, resource_kind: wanted.resource_kind, resource_code: wanted.resource_code,
          workflow_status: wanted.workflow_status, division_id: wanted.division_id || null };
        if (!found.response.role_permissions.some(r => !subset(r, match).length)) differences.push({ path: 'permissions', expected: match, actual: 'missing' });
      }
      if (!found.response.role_users.some(r => r.role_id === found.row.role_id && r.email === run.connection.email)) differences.push({ path: 'role_users', expected: run.connection.email, actual: 'missing' });
    }
    if(step.kind==='format'){
      const body=resolve(step.body,this.context(run));
      const lines=found.response.lines.filter(l=>l.financial_statement_format_id===found.row.financial_statement_format_id);
      const actual=lines.map(l=>({line_code:l.line_code,line_type:l.line_type,sign_multiplier:l.sign_multiplier,
        account_ids:found.response.mappings.filter(m=>m.financial_statement_line_id===l.financial_statement_line_id).map(m=>m.gl_account_id).sort()}));
      const wanted=body.lines.map(l=>({line_code:l.line_code,line_type:l.line_type,sign_multiplier:1,account_ids:[...l.account_ids].sort()}));
      differences.push(...subset(actual,wanted,'format_lines'));
    }
    return { output: found.row, evidence: { expected, actual: found.row, differences }, passed: !differences.length };
  }
  async journal(run, step, mode) {
    const context = this.context(run), org = resolve(step.organisation, context);
    const marker = `ERPTEST:${run.id}:${step.id}`;
    let journals = (await this.client.request('/erp/api/journals/list', 'GET', { organisation_id: org })).journals;
    let matches = journals.filter(j => j.description === marker);
    if (matches.length > 1) throw new Error('Duplicate test journal marker; inspect duplicates before continuing');
    let journal = matches[0];
    if (!journal && mode === 'auto') {
      const body = resolve(step.body, context);
      const reference = await this.client.request('/erp/api/setup/reference', 'GET', { organisation_id: org });
      const definitions = reference.line_definitions.filter(l => l.transaction_type_id === body.transaction_type_id);
      body.lines = body.lines.map(line => {
        const definition = definitions.find(d => d.line_code === line.definition);
        if (!definition) throw new Error(`Missing transaction line definition ${line.definition}`);
        const { definition: unused, ...values } = line;
        return { ...values, transaction_line_definition_id: definition.transaction_line_definition_id };
      });
      await this.client.request('/erp/api/journals/save', 'POST', { ...body, description: marker });
      journals = (await this.client.request('/erp/api/journals/list', 'GET', { organisation_id: org })).journals;
      journal = journals.find(j => j.description === marker);
    }
    if (!journal) throw new Error(`Journal not found. Use description ${marker}, then verify again.`);
    if (mode === 'auto') {
      if (['draft', 'rejected'].includes(journal.workflow_status)) journal = (await this.client.request('/erp/api/journals/workflow', 'POST', { journal_id: journal.journal_id, action: 'submit' })).journal;
      if (journal.workflow_status === 'submitted') journal = (await this.client.request('/erp/api/journals/workflow', 'POST', { journal_id: journal.journal_id, action: 'approve' })).journal;
    }
    const detail = await this.client.request('/erp/api/journals/detail', 'GET', { journal_id: journal.journal_id });
    const actual = detail.lines.map(l => ({ gl: l.gl_account_code, subledger: l.subledger_account_code || null,
      debit: l.debit_amount, credit: l.credit_amount,
      objects: l.accounting_objects.map(o => o.object_code), dimensions: l.accounting_dimensions.map(d => d.dimension_code) }));
    const differences = comparePostings(actual, step.expectedPostings);
    differences.push(...subset(detail.journal, resolve(step.expectedJournal, context)));
    if (detail.journal.workflow_status !== 'approved') differences.push({ path: 'workflow_status', expected: 'approved', actual: detail.journal.workflow_status });
    return { output: detail.journal, evidence: { expected: step.expectedPostings, actual, differences }, passed: !differences.length };
  }
  async checkpoint(run, step) {
    const query = resolve(step.query, this.context(run));
    const journals=(await this.client.request('/erp/api/journals/list','GET',{organisation_id:query.organisation_id})).journals;
    const present=run.pack.steps.filter(s=>s.kind==='journal').flatMap(s=>{
      const matches=journals.filter(j=>j.description===`ERPTEST:${run.id}:${s.id}`&&j.workflow_status==='approved');
      if(matches.length>1)throw new Error(`Duplicate approved journal for ${s.id}`);
      return matches.length?[{step:s,journal:matches[0]}]:[];
    });
    for(const id of step.dependsOn)if(!present.some(p=>p.step.id===id))throw new Error(`Required approved checkpoint journal ${id} is missing`);
    // A retry sees the current ERP state, including later transactions already posted.
    // Their independent fixtures must be included; we do not pretend to rewind the ERP.
    const expected = present.flatMap(({step})=>step.expectedPostings);
    const report = await this.client.request('/erp/api/reports/financial', 'GET', query);
    const rows = ledgerComparison(report.rows, expected);
    const actualPostings=[];
    for(const {step:source,journal} of present){
      const detail=await this.client.request('/erp/api/journals/detail','GET',{journal_id:journal.journal_id});
      if(detail.journal.workflow_status!=='approved')throw new Error(`Checkpoint journal ${source.id} is no longer approved`);
      for(const l of detail.lines)actualPostings.push({gl:l.gl_account_code,subledger:l.subledger_account_code||null,debit:l.debit_amount,credit:l.credit_amount,objects:l.accounting_objects.map(o=>o.object_code),dimensions:l.accounting_dimensions.map(d=>d.dimension_code)});
    }
    const objectDifferences=comparePostings(actualPostings,expected);
    return { output: report, evidence: { rows, includedEvents:present.map(p=>p.step.id),objectDifferences, differences: [...rows.filter(r => !r.passed),...objectDifferences] }, passed: rows.every(r => r.passed)&&!objectDifferences.length };
  }
  async statement(run,step){
    const report=await this.client.request('/erp/api/reports/financial','GET',resolve(step.query,this.context(run)));
    const postings=run.pack.steps.filter(s=>s.kind==='journal'&&step.dependsOn.includes(s.id)).flatMap(s=>s.expectedPostings);
    const expectations=new Map(step.accounts.map(a=>[a.gl,0]));
    for(const p of postings)if(expectations.has(p.gl))expectations.set(p.gl,expectations.get(p.gl)+cents(p.debit)-cents(p.credit));
    const actual=new Map(report.rows.map(r=>[r.line_code,cents(r.amount)]));
    const rows=step.accounts.map(a=>{const expected=expectations.get(a.gl)*(a.sign||1),amount=actual.get(`GL_${a.gl}`);return{gl:a.gl,expected:{balance:expected},actual:{balance:amount??0},difference:(amount??0)-expected,passed:amount!==undefined&&amount===expected};});
    for(const [code,amount]of actual)if(!step.accounts.some(a=>code===`GL_${a.gl}`))rows.push({gl:code,expected:{balance:0},actual:{balance:amount},difference:amount,passed:false});
    return{output:report,evidence:{rows,differences:rows.filter(r=>!r.passed)},passed:rows.every(r=>r.passed)};
  }
  async negative(run,step,mode){
    if(mode==='manual')throw new Error('Use Run this step for a verified API rejection, or record your screen observation as manual review.');
    const source=run.pack.steps.find(s=>s.id===step.source),body=resolve(source.body,this.context(run));
    const reference=await this.client.request('/erp/api/setup/reference','GET',{organisation_id:body.organisation_id});
    body.lines=body.lines.map(l=>{const {definition,...rest}=l;const d=reference.line_definitions.find(d=>d.transaction_type_id===body.transaction_type_id&&d.line_code===definition);if(!d)throw new Error('Missing source line definition');return{...rest,transaction_line_definition_id:d.transaction_line_definition_id};});
    if(step.mutation==='missing-subledger')body.lines[0].subledger_account_id=null;
    if(step.mutation==='wrong-subledger')body.lines[0].subledger_account_id=run.outputs['account-CUSTOMER'].subledger_account_id;
    if(step.mutation==='missing-meter')body.lines[2].accounting_objects=body.lines[2].accounting_objects.filter(o=>o.type_id!==run.outputs['objectclass-utility_meter'].accounting_object_type_id);
    if(step.mutation==='unbalanced')body.lines[0].debit_amount='1.00';
    body.description=`ERPTEST:${run.id}:${step.id}`;
    const before=(await this.client.request('/erp/api/journals/list','GET',{organisation_id:body.organisation_id})).journals;
    if(before.some(j=>j.description===body.description))throw new Error('A previous invalid probe was accepted; inspect its draft journal before retrying');
    let observed;
    try{await this.client.request('/erp/api/journals/save','POST',body);observed={status:200,error:'Invalid transaction accepted'};}
    catch(error){if(!error.status)throw error;observed={status:error.status,error:error.message};}
    const after=(await this.client.request('/erp/api/journals/list','GET',{organisation_id:body.organisation_id})).journals;
    const passed=observed.status===400&&new RegExp(step.errorPattern,'i').test(observed.error)&&!after.some(j=>j.description===body.description);
    return{output:observed,passed,evidence:{expected:{status:400,errorPattern:step.errorPattern,noJournalCreated:true},actual:observed,differences:passed?[]:[{path:'validation',expected:step.errorPattern,actual:observed}]}};
  }
  annotate(id,stepId,status,note){
    if(this.busy.has(id)||this.automating?.has(id))throw new Error('Pause execution before recording observations');
    if(!['capability_gap','manual_review'].includes(status)||!String(note||'').trim())throw new Error('Choose a result and describe the observation');
    const run=this.store.get(id);if(!run.pack.steps.some(s=>s.id===stepId))throw new Error('Unknown step');
    const invalidated=new Set([stepId]);for(const s of run.pack.steps)if(s.dependsOn.some(d=>invalidated.has(d))){invalidated.add(s.id);delete run.results[s.id];delete run.outputs[s.id];}
    run.results[stepId]={status,note,previousEvidence:run.results[stepId]?.evidence,finishedAt:new Date().toISOString()};delete run.outputs[stepId];run.status='ready';this.event(run,`${stepId}: ${status} — ${note}`);this.store.save(run);return run;
  }
  async step(id, stepId, mode) {
    if (!['manual', 'auto','ui-visible','ui-headless'].includes(mode)) throw new Error('Invalid execution mode');
    if (this.busy.has(id)) throw new Error('Run is already executing');
    const run = this.store.get(id), step = run.pack.steps.find(s => s.id === stepId);
    if (!step) throw new Error('Unknown step');
    const missing = step.dependsOn.filter(dep => run.results[dep]?.status !== 'passed');
    if (missing.length) throw new Error(`Prerequisites not passed: ${missing.join(', ')}`);
    this.busy.add(id);
    // Invalidate dependents before re-verifying an earlier result.
    const invalidated = new Set([stepId]);
    for (const s of run.pack.steps) if (s.dependsOn.some(d => invalidated.has(d))) { invalidated.add(s.id); delete run.results[s.id]; delete run.outputs[s.id]; }
    delete run.outputs[stepId];
    run.results[stepId] = { status: 'running', mode, startedAt: new Date().toISOString() };
    run.status = 'running'; this.event(run, `${mode === 'auto' ? 'Execute' : 'Verify'}: ${step.title}`); this.store.save(run);
    try {
      let browserEvidence;
      if(mode.startsWith('ui-')) {
        if(!this.browser)throw new Error('Browser executor is unavailable');
        browserEvidence=await this.browser.execute(run,step,resolve(step.body||step.query||{},this.context(run)),mode,this);
      }
      const verificationMode=mode.startsWith('ui-')?'manual':mode;
      const result = step.kind === 'journal' ? await this.journal(run, step, verificationMode)
        : step.kind === 'checkpoint' ? await this.checkpoint(run, step)
        : step.kind === 'statement' ? await this.statement(run,step)
        : step.kind === 'negative' ? await this.negative(run,step,verificationMode) : await this.entity(run, step, verificationMode);
      if(browserEvidence)result.evidence.browser=browserEvidence;
      run.results[stepId] = { ...run.results[stepId], status: result.passed ? 'passed' : 'failed', evidence: result.evidence, finishedAt: new Date().toISOString() };
      if (result.passed) run.outputs[stepId] = result.output;
    } catch (error) {
      run.results[stepId] = { ...run.results[stepId], status: ['automation_gap','capability_gap'].includes(error.code)?error.code:'failed', error: error.message, httpStatus: error.status, ...(error.browserEvidence?{evidence:{browser:error.browserEvidence}}:{}), finishedAt: new Date().toISOString() };
    } finally {
      run.status = run.pack.steps.every(s => run.results[s.id]?.status === 'passed') ? 'complete' : 'ready';
      this.event(run, `${step.title}: ${run.results[stepId].status}`); this.store.save(run); this.busy.delete(id);
    }
    return run;
  }
  async all(id, mode='auto') {
    if(!['auto','ui-visible','ui-headless'].includes(mode))throw new Error('Invalid unattended execution mode');
    if (this.busy.has(id) || this.automating?.has(id)) throw new Error('Run is already executing');
    this.automating ||= new Set(); this.automating.add(id); this.pauses.delete(id);
    try {
      for (const step of this.store.get(id).pack.steps) {
        if (this.pauses.has(id)) break;
        const run = this.store.get(id);
        if (run.results[step.id]?.status === 'passed') continue;
        if (step.dependsOn.some(d => run.results[d]?.status !== 'passed')) continue;
        const after = await this.step(id, step.id, mode);
        if(mode.startsWith('ui-')&&after.results[step.id].status!=='passed')break;
        if (after.results[step.id].httpStatus === 401 || after.results[step.id].httpStatus === 403) break;
      }
      return this.store.get(id);
    } finally { this.automating.delete(id); }
  }
}
module.exports = { Runner, resolve };
