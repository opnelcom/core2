'use strict';
const fs = require('node:fs');
const path = require('node:path');
const seedPath = path.resolve(__dirname, '../../../Volumes/Core-ERP/seeds/template-defaults.json');
const ref = (id, field) => ({ $ref: `outputs.${id}.${field}` });
const parameter = name => ({ $ref: `parameters.${name}` });
const org = ref('organisation', 'organisation_id');
const root = ref('root', 'division_id');
const api = route => `/erp/api/${route}`;
function buildPack() {
  const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8')), steps = [];
  function entity(id, title, chapter, endpoint, collection, match, body, expected, deps, listEndpoint) {
    const step = { id, title, chapter, kind: 'entity', dependsOn: deps || ['access'],
      instructions: `Create ${title.toLowerCase()} in the ERP using the values below, then verify. Existing records are inspected rather than overwritten.`,
      endpoint: api(endpoint), body,
      lookup: { endpoint: api(listEndpoint || endpoint.replace(/save(?:-type|-year|-period)?$/, 'list')), collection,
        query: id === 'organisation' ? {} : { organisation_id: org }, match }, expected: expected || match };
    steps.push(step); return step;
  }
  entity('organisation', 'New test organisation', 'Organisation setup', 'organisations/save', 'organisations',
    { organisation_code: parameter('organisationCode') },
    { access_organisation_id: parameter('adminOrganisationId'), organisation_code: parameter('organisationCode'), organisation_name: parameter('organisationName'), base_currency_code: 'ZAR', is_template: false },
    { organisation_code: parameter('organisationCode'), organisation_name: parameter('organisationName'), base_currency_code: 'ZAR', is_template: false }, [], 'setup/bootstrap');
  entity('claim', 'Verify creator setup administration', 'Organisation setup', 'permissions/claim-admin', 'roles',
    { role_code: 'security_administrator' }, { organisation_id: org }, { is_admin: true, is_active: true }, ['organisation'], 'permissions/list');
  entity('root', 'Root division', 'Organisation setup', 'divisions/save', 'divisions', { division_code: 'ROOT' },
    { organisation_id: org, division_code: 'ROOT', division_name: 'Root', workflow_status: 'approved' }, { workflow_status: 'approved' }, ['claim']);
  entity('module', 'Acceptance test module', 'Organisation setup', 'modules/save', 'modules', { module_code: 'acceptance' },
    { organisation_id: org, module_code: 'acceptance', module_name: 'Acceptance', is_active: true }, { is_active: true }, ['claim']);
  const moduleIds = [ref('module', 'module_id')];
  const access = entity('access', 'Tester business permissions', 'Organisation setup', 'permissions/save', 'roles', { role_code: 'acceptance_tester' },
    { organisation_id: org, role_name: 'Acceptance Tester', is_admin: true, is_active: true, module_ids: moduleIds,
      master_permissions: [], transaction_permissions: [],
      role_users: [{ email: { $ref: 'connection.email' } }] }, { is_admin: true, is_active: true }, ['root', 'module'], 'permissions/list');
  access.kind = 'permissions';
  for (const [code, name] of [['CONSTRUCTION', 'Construction'], ['TRADING', 'Trading'], ['ADMIN', 'Administration']]) entity(`division-${code}`, `${name} division`, 'Organisation setup', 'divisions/save', 'divisions', { division_code: code },
    { organisation_id: org, parent_division_id: root, division_code: code, division_name: name, workflow_status: 'approved' }, { parent_division_id: root, workflow_status: 'approved' });
  entity('workflow', 'Master data workflow', 'Organisation setup', 'setup/workflows', 'workflow_paths', { path_name: 'Acceptance master data' },
    { organisation_id: org, path_name: 'Acceptance master data', initial_step_code: 'approved', is_active: true,
      steps: [{ step_code: 'approved', step_label: 'Approved', sort_order: 10 }], next: [] }, { initial_step_code: 'approved', is_active: true }, ['access'], 'setup/workflows');
  entity('year', 'Financial year', 'Organisation setup', 'fiscal/save-year', 'fiscal_years', { fiscal_year_code: parameter('yearCode') },
    { organisation_id: org, fiscal_year_code: parameter('yearCode'), start_date: parameter('startDate'), end_date: parameter('endDate'), status: 'open', create_periods: false },
    { start_date: parameter('startDate'), end_date: parameter('endDate'), status: 'open' }, ['access'], 'fiscal/list');
  entity('period', 'Test fiscal period', 'Organisation setup', 'fiscal/save-period', 'fiscal_periods', { period_code: parameter('periodCode') },
    { organisation_id: org, fiscal_year_id: ref('year','fiscal_year_id'), period_number: 1, period_code: parameter('periodCode'), start_date: parameter('startDate'), end_date: parameter('endDate'), status: 'open' },
    { fiscal_year_id: ref('year','fiscal_year_id'), start_date: parameter('startDate'), end_date: parameter('endDate'), status: 'open' }, ['year'], 'fiscal/list');
  for (const tax of seed.taxTypeSeeds) {
    const step = entity(`tax-${tax.code}`, `Tax code ${tax.code}`, 'Organisation setup', 'tax-types/save', 'tax_types', { tax_type_code: tax.code },
      { organisation_id: org, tax_type_code: tax.code, tax_type_description: tax.description, tax_direction: tax.direction, is_active: true,
        rates: tax.rates.map(r => ({ tax_rate: r.rate, valid_from: r.valid_from, valid_to: r.valid_to, is_active: true })) }, { tax_direction: tax.direction, is_active: true });
    step.kind = 'tax'; step.expectedRates = tax.rates.map(r => ({ tax_rate: r.rate, valid_from: r.valid_from, valid_to: r.valid_to }));
  }
  for (const [code, name] of seed.glAccountTypeSeeds) entity(`glclass-${code}`, `${name} GL class`, 'Classes and GLs', 'gl-account-types/save', 'gl_account_types', { type_code: code },
    { organisation_id: org, type_code: code, type_name: name, is_required: true, is_active: true }, { type_name: name, is_active: true });
  for (const [code, name, , requiresLegal] of seed.ledgerFamilies) entity(`class-${code}`, `${name} subledger class`, 'Classes and GLs', 'subledger-account-types/save', 'subledger_account_types', { type_code: code },
    { organisation_id: org, type_code: code, type_name: name, requires_legal_entity: requiresLegal, workflow_path_id: ref('workflow','workflow_path_id'), module_ids: moduleIds,
      schema_json: JSON.stringify(seed.ledgerFamilySchemas[code] || { type: 'object', properties: {} }), ui_schema_json: '{}', is_active: true },
    { requires_legal_entity: requiresLegal, is_active: true, schema_json: seed.ledgerFamilySchemas[code] || { type: 'object', properties: {} }, module_ids: moduleIds }, ['workflow']);
  for (const [code, name] of seed.accountingObjectTypeSeeds) {
    const schema = code==='utility_meter'?{type:'object',properties:{meterNumber:{type:'short_text',title:'Meter Number',maxLength:30},service:{type:'select',title:'Service',enum:['electricity','water']},propertyCode:{type:'short_text',title:'Property Code',maxLength:30}},required:['meterNumber','service','propertyCode'],additionalProperties:false}:seed.accountingObjectTypeMetadata?.[code]?.schema_json || { type: 'object', properties: {} };
    entity(`objectclass-${code}`, `${name} object class`, 'Classes and GLs', 'accounting-objects/save-type', 'types', { type_code: code },
      { organisation_id: org, type_code: code, type_name: name, workflow_path_id: ref('workflow','workflow_path_id'), module_ids: moduleIds, schema_json: schema, ui_schema_json: {}, is_active: true },
      { is_active: true, schema_json: schema, module_ids: moduleIds }, ['workflow'], 'accounting-objects/types');
  }
  for (const [code, name] of seed.accountingDimensionTypeSeeds) entity(`dimclass-${code}`, `${name} dimension class`, 'Classes and GLs', 'accounting-dimensions/save-type', 'types', { type_code: code },
    { organisation_id: org, type_code: code, type_name: name, workflow_path_id: ref('workflow','workflow_path_id'), module_ids: moduleIds, schema_json: {}, ui_schema_json: {}, is_active: true },
    { is_active: true, module_ids: moduleIds }, ['workflow'], 'accounting-dimensions/types');
  const chart = seed.chartTemplate.map(row => [...row]);
  for (const row of chart) if (['1300', '1350'].includes(row[0])) { row[3] = true; row[4] = 'asset'; }
  chart.push(['1290', 'Capital WIP', 'asset', true, 'capex_project'], ['1301', 'Building cost', 'asset', true, 'asset'], ['1302', 'Equipment cost', 'asset', true, 'asset'], ['1310', 'Land cost', 'asset', true, 'asset']);
  for (const [code, name, type, required, family] of chart) entity(`gl-${code}`, `${code} ${name}`, 'Classes and GLs', 'gl-accounts/save', 'gl_accounts', { account_code: code },
    { organisation_id: org, account_code: code, account_name: name, gl_account_type_id: ref(`glclass-${type}`,'gl_account_type_id'), requires_subledger: required,
      required_subledger_account_type_id: family ? ref(`class-${family}`,'subledger_account_type_id') : null },
    { gl_account_type_id: ref(`glclass-${type}`,'gl_account_type_id'), requires_subledger: required, required_subledger_account_type_id: family ? ref(`class-${family}`,'subledger_account_type_id') : null },
    ['access', `glclass-${type}`, ...(family ? [`class-${family}`] : [])]);
  for (const [code, name] of [['BUSINESS','Acceptance Building Supplies'],['OWNER','Owner One'],['BANK','Test Bank'],['SUPPLIER','Construction and Materials Supplier'],['CUSTOMER','Account Customer'],['MUNICIPALITY','Test Municipality'],['LENDER','Test Lender']]) entity(`party-${code}`, name, 'Business master data', 'legal-entities/save', 'legal_entities', { known_name: name },
    { organisation_id: org, entity_type: code === 'OWNER' ? 'person' : code === 'MUNICIPALITY' ? 'municipality' : 'company', legal_name: name, known_name: name, workflow_status: 'approved' }, { legal_name: name, workflow_status: 'approved' });
  const accounts = [['bank','BANK','Operating Bank','BANK'],['vendor','SUPPLIER','Materials Supplier','SUPPLIER'],['vendor','MUNICIPALITY','Municipal Account','MUNICIPALITY'],['customer','CUSTOMER','Account Customer','CUSTOMER'],['employee','EMPLOYEE','First Employee'],['loan','LOAN','Construction Loan','LENDER'],['capex_project','PROJECT','Warehouse Construction'],['asset','LAND','Land'],['asset','BUILDING','Warehouse'],['asset','EQUIPMENT','Equipment'],['cash_point','TILL','Shop Till'],['cash_point','SAFE','Management Safe'],['cash_point','PETTY','Petty Cash']];
  for (const [family, code, name, party] of accounts) entity(`account-${code}`, name, 'Business master data', 'subledger-accounts/save', 'subledger_accounts', { account_code: code },
    { organisation_id: org, owner_division_id: root, subledger_account_type_id: ref(`class-${family}`,'subledger_account_type_id'), account_code: code, account_name: name, legal_entity_id: party ? ref(`party-${party}`,'legal_entity_id') : null, additional_data: {} },
    { subledger_account_type_id: ref(`class-${family}`,'subledger_account_type_id'), legal_entity_id: party ? ref(`party-${party}`,'legal_entity_id') : null, workflow_status: 'approved' }, ['access', `class-${family}`, ...(party ? [`party-${party}`] : [])]);
  for (const [type, code, name] of [...seed.accountingObjectSeeds, ['team','BUILD-TEAM','Construction Team'],['region','LOCAL','Local Region'],['opex_project','LAUNCH','Shop Launch'],['profit_centre','SHOP','Shop Profit Centre'],['contract','BUILD-CONTRACT','Construction Contract']]) {
    const data=type==='utility_meter'?{meterNumber:code,service:code.startsWith('ELEC')?'electricity':'water',propertyCode:'DEMO-PROPERTY'}:{};
    entity(`object-${code}`, name, 'Business master data', 'accounting-objects/save', 'records', { object_code: code },
    { organisation_id: org, owner_division_id: root, accounting_object_type_id: ref(`objectclass-${type}`,'accounting_object_type_id'), object_code: code, object_name: name, additional_data: data },
    { accounting_object_type_id: ref(`objectclass-${type}`,'accounting_object_type_id'), workflow_status: 'approved',additional_data:data }, ['access', `objectclass-${type}`,...(type==='utility_meter'?['object-DEMO-PROPERTY']:[])]);
  }
  for (const [type, code, name] of seed.accountingDimensionSeeds) entity(`dimension-${code}`, name, 'Business master data', 'accounting-dimensions/save', 'records', { dimension_code: code },
    { organisation_id: org, owner_division_id: root, accounting_dimension_type_id: ref(`dimclass-${type}`,'accounting_dimension_type_id'), dimension_code: code, dimension_name: name, additional_data: {} },
    { accounting_dimension_type_id: ref(`dimclass-${type}`,'accounting_dimension_type_id') }, ['access', `dimclass-${type}`]);
  for (const [code, name] of seed.transactionGroups) entity(`group-${code}`, `${name} transaction group`, 'Transaction definitions', 'transaction-groups/save', 'transaction_groups', { group_code: code },
    { organisation_id: org, group_code: code, group_name: name, is_active: true }, { is_active: true }, ['access'], 'setup/reference');
  const definitions = new Map();
  function define(code, name, group, rows) {
    const lines = rows.map(([line_code, side, gl, family, occurrence = 'required', objects = [], dimensions = []]) => ({ line_code, debit_credit: side, gl_account_id: ref(`gl-${gl}`,'gl_account_id'), occurrence,
      amount_source: occurrence === 'generated' ? 'balancing' : 'manual', subledger_requirement: family ? 'mandatory' : 'not_used', subledger_account_type_id: family ? ref(`class-${family}`,'subledger_account_type_id') : null,
      object_requirements: objects.map(type => ({ type_id: ref(`objectclass-${type}`,'accounting_object_type_id'), requirement: 'mandatory', value_behaviour: 'captured', accounting_object_id: null })),
      dimension_requirements: dimensions.map(([type, value]) => ({ type_id: ref(`dimclass-${type}`,'accounting_dimension_type_id'), requirement: 'mandatory', value_behaviour: 'fixed', accounting_dimension_id: ref(`dimension-${value}`,'accounting_dimension_id') })) }));
    definitions.set(code, rows);
    const deps = [`group-${group}`, ...rows.map(r => `gl-${r[2]}`), ...rows.flatMap(r => (r[5] || []).map(t => `objectclass-${t}`)), ...rows.flatMap(r => (r[6] || []).map(d => `dimension-${d[1]}`))];
    const step = entity(`type-${code}`, name, 'Transaction definitions', 'transaction-types/save', 'transaction_types', { type_code: code },
      { organisation_id: org, transaction_group_id: ref(`group-${group}`,'transaction_group_id'), type_code: code, type_name: name, module_ids: moduleIds, is_financial: true, is_active: true, allow_additional_lines: false, lines },
      { is_financial: true, allow_additional_lines: false, is_active: true, module_ids: moduleIds }, [...new Set(deps)], 'setup/reference');
    step.kind = 'transaction-type'; step.expectedLines = lines;
  }
  for (const [code, group, name] of seed.transactionTypes) {
    const rows = seed.lineDefinitionSeeds.filter(r => r[0] === code).map(r => {
      let family = r[5]; if (['1300', '1350'].includes(r[3])) family = 'asset';
      return [r[8] || `line_${r[1]}`, r[2], r[3], family, r[7] || 'required'];
    });
    if (code === 'municipal_services_invoice') for (const row of rows) {
      const classification = seed.municipalLineClassificationSeeds.find(r => r[0] === row[0]);
      if (classification) { row[5] = [classification[3] && 'property', classification[4] && 'utility_meter', classification[5] && 'cost_centre'].filter(Boolean); row[6] = [['service',classification[1]],['charge_component',classification[2]]]; }
    }
    define(code, name, group, rows);
  }
  define('land_purchase', 'Land purchase on account', 'assets', [['land','debit','1310','asset'],['payable','credit','2000','vendor','generated']]);
  define('capex_materials', 'Capital project materials invoice', 'purchasing', [['wip','debit','1290','capex_project'],['payable','credit','2000','vendor','generated']]);
  define('capex_services', 'Capital project services invoice', 'purchasing', [['wip','debit','1290','capex_project'],['payable','credit','2000','vendor','generated']]);
  define('capex_settlement', 'Capital project settlement', 'assets', [['building','debit','1301','asset','repeatable'],['equipment','debit','1302','asset','repeatable'],['project','credit','1290','capex_project','generated']]);
  define('materials_purchase', 'Trading materials purchase', 'purchasing', [['materials','debit','1200',null],['payable','credit','2000','vendor','generated']]);
  define('materials_cost', 'Materials cost recognition', 'inventory', [['cost','debit','5000',null],['materials','credit','1200',null,'generated']]);
  const journals = [];
  function transact(id, title, chapter, type, entries) {
    const rows = definitions.get(type), used = [];
    const lines = entries.map(([definition, amount, account, objects = []]) => {
      const row = rows.find(r => r[0] === definition); if (!row) throw new Error(`Unknown definition ${type}.${definition}`);
      used.push(`gl-${row[2]}`); if(account) used.push(`account-${account}`);
      objects.forEach(o => used.push(`object-${o}`));
      const classifications = (row[5] || []).map((objectType, index) => ({ type_id: ref(`objectclass-${objectType}`,'accounting_object_type_id'), value_id: ref(`object-${objects[index]}`,'accounting_object_id') }));
      const dimensions = (row[6] || []).map(([dimType, code]) => ({ type_id: ref(`dimclass-${dimType}`,'accounting_dimension_type_id'), value_id: ref(`dimension-${code}`,'accounting_dimension_id') }));
      return { definition, gl_account_id: ref(`gl-${row[2]}`,'gl_account_id'), subledger_account_id: account ? ref(`account-${account}`,'subledger_account_id') : null,
        debit_amount: row[1] === 'debit' ? amount : '0.00', credit_amount: row[1] === 'credit' ? amount : '0.00', accounting_objects: classifications, accounting_dimensions: dimensions };
    });
    // Expectations below are supplied separately from the capture payload.
    const step = { id, title, chapter, kind: 'journal', dependsOn: [...new Set(['period', `type-${type}`, ...used, ...journals])], organisation: org,
      instructions: 'Capture this transaction using its configured transaction type. Use the run-specific description shown below, submit and approve, then verify.',
      body: { organisation_id: org, transaction_type_id: ref(`type-${type}`,'transaction_type_id'), fiscal_period_id: ref('period','fiscal_period_id'), source_division_id: root, journal_date: parameter('transactionDate'), currency_code: 'ZAR', exchange_rate: 1, lines },
      expectedJournal: { organisation_id: org, transaction_type_id: ref(`type-${type}`,'transaction_type_id'), fiscal_period_id: ref('period','fiscal_period_id'), source_division_id: root, currency_code: 'ZAR', journal_date: parameter('transactionDate') } };
    steps.push(step); journals.push(id); return step;
  }
  const post = (gl, debit, credit, subledger, objects = [], dimensions = []) => ({ gl, debit, credit, subledger: subledger || null, objects, dimensions });
  function event(id,title,chapter,type,entries,expected) { transact(id,title,chapter,type,entries).expectedPostings = expected; }
  event('fund','Owners fund the business','Owner funding','owner_deposit',[['line_1','1000000.00','BANK'],['line_2','1000000.00']], [post('1010','1000000.00','0','BANK'),post('3000','0','1000000.00')]);
  event('loan','Receive construction finance','Owner funding','loan_received',[['line_1','200000.00','BANK'],['line_2','200000.00','LOAN']], [post('1010','200000.00','0','BANK'),post('2500','0','200000.00','LOAN')]);
  event('land','Purchase land on account','Land and construction','land_purchase',[['land','200000.00','LAND'],['payable','200000.00','SUPPLIER']], [post('1310','200000.00','0','LAND'),post('2000','0','200000.00','SUPPLIER')]);
  event('construction-materials','Purchase construction materials','Land and construction','capex_materials',[['wip','180000.00','PROJECT'],['payable','180000.00','SUPPLIER']], [post('1290','180000.00','0','PROJECT'),post('2000','0','180000.00','SUPPLIER')]);
  event('construction-services','Purchase contractor services','Land and construction','capex_services',[['wip','120000.00','PROJECT'],['payable','120000.00','SUPPLIER']], [post('1290','120000.00','0','PROJECT'),post('2000','0','120000.00','SUPPLIER')]);
  event('pay-supplier','Partially pay construction supplier','Land and construction','supplier_payment',[['line_1','350000.00','SUPPLIER'],['line_2','350000.00','BANK']], [post('2000','350000.00','0','SUPPLIER'),post('1010','0','350000.00','BANK')]);
  event('settle-part','Partially commission warehouse assets','Asset commissioning','capex_settlement',[['building','200000.00','BUILDING'],['equipment','40000.00','EQUIPMENT'],['project','240000.00','PROJECT']], [post('1301','200000.00','0','BUILDING'),post('1302','40000.00','0','EQUIPMENT'),post('1290','0','240000.00','PROJECT')]);
  event('settle-final','Settle remaining project costs','Asset commissioning','capex_settlement',[['building','50000.00','BUILDING'],['equipment','10000.00','EQUIPMENT'],['project','60000.00','PROJECT']], [post('1301','50000.00','0','BUILDING'),post('1302','10000.00','0','EQUIPMENT'),post('1290','0','60000.00','PROJECT')]);
  event('buy-materials','Purchase trading materials at GL level','Trading','materials_purchase',[['materials','50000.00'],['payable','50000.00','SUPPLIER']], [post('1200','50000.00','0'),post('2000','0','50000.00','SUPPLIER')]);
  event('account-sale','Sell to account customer','Trading','customer_invoice',[['line_1','20000.00','CUSTOMER'],['line_2','20000.00']], [post('1100','20000.00','0','CUSTOMER'),post('4000','0','20000.00')]);
  event('cash-sale','Sell to walk-in customer','Trading','cash_sale',[['line_1','5000.00','TILL'],['line_2','5000.00']], [post('1000','5000.00','0','TILL'),post('4000','0','5000.00')]);
  event('cost','Recognise materials cost of sales','Trading','materials_cost',[['cost','12000.00'],['materials','12000.00']], [post('5000','12000.00','0'),post('1200','0','12000.00')]);
  const municipalEntries = [['property_rates','1000.00',null,['DEMO-PROPERTY','FACILITIES']],['property_rates_rebate','100.00',null,['DEMO-PROPERTY','FACILITIES']],['electricity_consumption','500.00',null,['DEMO-PROPERTY','ELEC-METER-001','FACILITIES']],['electricity_network','50.00',null,['DEMO-PROPERTY','ELEC-METER-001','FACILITIES']],['electricity_service_charge','25.00',null,['DEMO-PROPERTY','ELEC-METER-001','FACILITIES']],['water_consumption','200.00',null,['DEMO-PROPERTY','WATER-METER-001','FACILITIES']],['water_demand_levy','20.00',null,['DEMO-PROPERTY','WATER-METER-001','FACILITIES']],['sewerage','100.00',null,['DEMO-PROPERTY','FACILITIES']],['refuse_removal','80.00',null,['DEMO-PROPERTY','FACILITIES']],['pretermination_notice','30.00',null,['DEMO-PROPERTY','FACILITIES']],['input_vat','150.75'],['creditor_control','2055.75','MUNICIPALITY']];
  const municipal = transact('municipal-invoice','Receive property and metered utility invoice','Municipal services','municipal_services_invoice',municipalEntries);
  // Independent amounts/accounts; classification codes are taken from the reference specification.
  const dims = code => { const c = seed.municipalLineClassificationSeeds.find(r=>r[0]===code); return c ? [c[1],c[2]] : []; };
  municipal.expectedPostings = [post('5700','1000.00','0',null,['DEMO-PROPERTY','FACILITIES'],dims('property_rates')),post('5700','0','100.00',null,['DEMO-PROPERTY','FACILITIES'],dims('property_rates_rebate')),post('5710','500.00','0',null,['DEMO-PROPERTY','ELEC-METER-001','FACILITIES'],dims('electricity_consumption')),post('5710','50.00','0',null,['DEMO-PROPERTY','ELEC-METER-001','FACILITIES'],dims('electricity_network')),post('5710','25.00','0',null,['DEMO-PROPERTY','ELEC-METER-001','FACILITIES'],dims('electricity_service_charge')),post('5720','200.00','0',null,['DEMO-PROPERTY','WATER-METER-001','FACILITIES'],dims('water_consumption')),post('5720','20.00','0',null,['DEMO-PROPERTY','WATER-METER-001','FACILITIES'],dims('water_demand_levy')),post('5730','100.00','0',null,['DEMO-PROPERTY','FACILITIES'],dims('sewerage')),post('5740','80.00','0',null,['DEMO-PROPERTY','FACILITIES'],dims('refuse_removal')),post('5750','30.00','0',null,['DEMO-PROPERTY','FACILITIES'],dims('pretermination_notice')),post('2200','150.75','0',null,[],dims('input_vat')),post('2000','0','2055.75','MUNICIPALITY')];
  for (const [id, amount] of [['municipal-part','1000.00'],['municipal-final','1055.75']]) event(id,'Pay municipal account '+(id==='municipal-part'?'partially':'in full'),'Municipal services','supplier_payment',[['line_1',amount,'MUNICIPALITY'],['line_2',amount,'BANK']], [post('2000',amount,'0','MUNICIPALITY'),post('1010','0',amount,'BANK')]);
  // Exercise remaining seeded transaction types with independently specified posting fixtures.
  const fixtures = {
    customer_payment: ['1100','1010','CUSTOMER','BANK'], customer_cash_payment: ['1100','1000','CUSTOMER','TILL'],
    supplier_cash_payment: ['1000','2000','SAFE','SUPPLIER'], bank_charge: ['1010','5100','BANK'], bank_receipt_other: ['4100','1010',null,'BANK'],
    bank_deposit: ['1000','1010','SAFE','BANK'], bank_withdrawal: ['1010','1000','BANK','SAFE'],
    pos_cash_to_safe: ['1000','1000','TILL','SAFE'], safe_cash_to_pos: ['1000','1000','SAFE','TILL'],
    cash_deposit_to_bank: ['1000','1010','SAFE','BANK'], cash_withdrawal_from_bank: ['1010','1000','BANK','SAFE'],
    petty_cash_issue: ['1000','1000','SAFE','PETTY'], petty_cash_replenishment: ['1000','1000','SAFE','PETTY'],
    petty_cash_expense: ['1000','5600','PETTY'], till_cash_over: ['4190','1000',null,'TILL'], till_cash_short: ['1000','5190','TILL'],
    safe_cash_over: ['4190','1000',null,'SAFE'], safe_cash_short: ['1000','5190','SAFE'], tax_accrual: ['2400','5400'], tax_payment: ['1010','2400','BANK'],
    payroll_accrual: ['2300','5200','EMPLOYEE'], payroll_payment: ['1010','2300','BANK','EMPLOYEE'],
    asset_purchase_bank: ['1010','1300','BANK','EQUIPMENT'], asset_purchase_cash: ['1000','1300','SAFE','EQUIPMENT'], asset_purchase_account: ['2000','1300','SUPPLIER','EQUIPMENT'],
    capex_purchase_account: ['2000','1320','SUPPLIER','PROJECT'], capex_purchase_bank: ['1010','1320','BANK','PROJECT'], capex_purchase_cash: ['1000','1320','SAFE','PROJECT'],
    capex_credit_note: ['1320','2000','PROJECT','SUPPLIER'], capex_refund_bank: ['2000','1010','SUPPLIER','BANK'], capex_refund_cash: ['2000','1000','SUPPLIER','SAFE'],
    depreciation: ['1350','5300','EQUIPMENT'], loan_repayment_principal: ['1010','2500','BANK','LOAN'], loan_interest_payment: ['1010','5500','BANK','LOAN'], owner_withdrawal: ['1010','3200','BANK'],
    supplier_invoice: ['2000','5600','SUPPLIER'], manual_journal: ['2999','2999']
  };
  // Establish cash before expenditure and customer receipts.
  const ordered = ['cash_withdrawal_from_bank','safe_cash_to_pos','petty_cash_issue','customer_payment','customer_cash_payment',...Object.keys(fixtures).filter(k=>!['cash_withdrawal_from_bank','safe_cash_to_pos','petty_cash_issue','customer_payment','customer_cash_payment'].includes(k))];
  for (const code of ordered) {
    const [creditGl,debitGl,creditSub,debitSub] = fixtures[code], rows = definitions.get(code);
    const debitRow = rows.find(r=>r[1]==='debit'), creditRow=rows.find(r=>r[1]==='credit');
    const amount = code==='cash_withdrawal_from_bank' ? '10000.00' : '100.00';
    const title = seed.transactionTypes.find(t=>t[0]===code)[2];
    event(`exercise-${code}`,title,'Operating and cash cycles',code,[[debitRow[0],amount,debitSub],[creditRow[0],amount,creditSub]], [post(debitGl,amount,'0',debitSub),post(creditGl,'0',amount,creditSub)]);
  }
  for (const [code,settlementGl,settlementAccount,reduction] of [
    ['capex_purchase_account','2000','SUPPLIER',false], ['capex_purchase_bank','1010','BANK',false], ['capex_purchase_cash','1000','SAFE',false],
    ['capex_credit_note','2000','SUPPLIER',true],
  ]) {
    event(`exercise-${code}-vat`,`${seed.transactionTypes.find(type=>type[0]===code)[2]} with input VAT`,'Capital purchase adjustments',code,
      [['project_wip','100.00','PROJECT'],['input_vat','15.00'],['settlement','115.00',settlementAccount]],
      reduction ? [post('1320','0','100.00','PROJECT'),post('2200','0','15.00'),post(settlementGl,'115.00','0',settlementAccount)]
        : [post('1320','100.00','0','PROJECT'),post('2200','15.00','0'),post(settlementGl,'0','115.00',settlementAccount)]);
  }
  // Add reconciliation after each business chapter, with all preceding events as prerequisites.
  const finalSteps = [], previousJournals = [];let previousCheckpoint;
  for (let i=0;i<steps.length;i++) {
    const step=steps[i];if(step.kind==='journal'&&previousCheckpoint)step.dependsOn.push(previousCheckpoint);finalSteps.push(step); if(step.kind==='journal')previousJournals.push(step.id);
    if(step.kind==='journal' && steps[i+1]?.chapter!==step.chapter) {previousCheckpoint=`recon-${step.chapter.toLowerCase().replace(/\W+/g,'-')}`;finalSteps.push({ id:previousCheckpoint, title:`Reconcile ${step.chapter.toLowerCase()}`, chapter:step.chapter, kind:'checkpoint', dependsOn:[...previousJournals],
      instructions:'Compare the current financial ledger report with the independent cumulative debit, credit and balance expectations. On retry, later transactions already posted are included. Unexpected accounts are included.',
      query:{organisation_id:org,fiscal_year_id:ref('year','fiscal_year_id'),report:'ledger'} });
    }
  }
  for (const step of finalSteps) {
    if(step.endpoint===api('subledger-accounts/save'))step.lookup.query.subledger_account_type_id=step.body.subledger_account_type_id;
    if(step.endpoint===api('accounting-objects/save'))step.lookup.query.accounting_object_type_id=step.body.accounting_object_type_id;
    if(step.endpoint===api('accounting-dimensions/save'))step.lookup.query.accounting_dimension_type_id=step.body.accounting_dimension_type_id;
  }
  for(const [statementType,types]of [['income',['revenue','expense']],['balance',['asset','liability','equity']]]){
    const accounts=chart.filter(r=>types.includes(r[2]));
    const format=entity(`format-${statementType}`,`Acceptance ${statementType==='income'?'income statement':'balance sheet'}`,'Financial reporting','financial-formats/save','formats',{format_code:`acceptance_${statementType}`},
      {organisation_id:org,format_code:`acceptance_${statementType}`,format_name:`Acceptance ${statementType}`,statement_type:statementType,is_active:true,
        lines:accounts.map((r,i)=>({client_key:`GL_${r[0]}`,line_code:`GL_${r[0]}`,line_label:r[1],line_type:'account_group',sort_order:i+1,account_ids:[ref(`gl-${r[0]}`,'gl_account_id')]}))},
      {statement_type:statementType,is_active:true},accounts.map(r=>`gl-${r[0]}`),'financial-formats/list');
    format.kind='format';finalSteps.push(format);
    finalSteps.push({id:`report-${statementType}`,title:`Verify ${statementType==='income'?'income statement':'balance sheet'}`,chapter:'Financial reporting',kind:'statement',dependsOn:[format.id,...journals],
      instructions:'Compare each financial statement line against the independent accounting fixtures. The balance sheet view shows the configured asset, liability and equity accounts before any year-end earnings transfer.',
      query:{organisation_id:org,report:'financial_statement',format_id:ref(format.id,'financial_statement_format_id'),period_from_id:ref('period','fiscal_period_id'),period_to_id:ref('period','fiscal_period_id')},
      accounts:accounts.map(r=>({gl:r[0],sign:['revenue','liability','equity'].includes(r[2])?-1:1}))});
  }
  for(const [id,title,source,mutation,errorPattern]of [
    ['missing-project','Reject a capex invoice without a project','construction-materials','missing-subledger','requires a sub-ledger'],
    ['wrong-asset','Reject a customer selected as an asset','settle-part','wrong-subledger','wrong sub-ledger type'],
    ['missing-meter','Reject metered electricity without a meter','municipal-invoice','missing-meter','Utility Meter|accounting object'],
    ['unbalanced','Reject an unbalanced owner deposit','fund','unbalanced','must balance']])finalSteps.push({id:`negative-${id}`,title,chapter:'Validation controls',kind:'negative',dependsOn:[source,'account-CUSTOMER'],source,mutation,errorPattern,instructions:'Execute a deliberately invalid API capture and verify the expected rejection and absence of a created journal. Screen observations can be recorded separately as manual review.'});
  return { id:'business-inception', version:2, title:'Business inception to first close',
    description:'Manual setup and API acceptance: owner funding, land, capital project settlement, municipal meters and bills, trading at GL level, and all seeded posting types.',
    limitations:['Browser modes stop on unsupported UI contracts; negative UI probes currently require explicit API execution. API financial verification is separate from browser actions.','VAT is explicitly captured in municipal and capex scenarios; the fixture VAT amounts test postings and do not assert tax eligibility or automatic rate calculation. Tax-return automation is not asserted.','Meter-to-property relationship enforcement, invoice allocation and automatic depreciation require additional scenarios.','The test uses an administrator role; granular business permission enforcement is not asserted. One acceptance module and one test fiscal period are used; seeded module assignments and full period-close coverage are not asserted.','Financial formats verify individual account lines; year-end earnings transfer and formula-based presentation require additional scenarios.'],
    seedCoverage:{transactionTypes:seed.transactionTypes.map(t=>t[0]),subledgerClasses:seed.ledgerFamilies.map(t=>t[0]),objectClasses:seed.accountingObjectTypeSeeds.map(t=>t[0]),dimensionClasses:seed.accountingDimensionTypeSeeds.map(t=>t[0])}, steps:finalSteps };
}
module.exports = { buildPack };
