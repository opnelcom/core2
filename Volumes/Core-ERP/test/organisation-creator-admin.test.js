'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function handler(access){const scope={module:{exports:{}},require(name){if(name==='../_shared/erp')return{authTenant:async()=>access,requireAdmin:a=>a.setupAdministrator?null:{status:403,body:{error:'Administrator access required'}},clean:(v,d='')=>String(v??d).trim(),nullable:v=>v||null,bool:v=>!!v};return{sanitizeOrganisationIconSvg:v=>v};}};vm.runInNewContext(fs.readFileSync(require.resolve('../api/organisations/save'),'utf8'),scope);return scope.module.exports;}
test('unauthorised user cannot create an organisation or obtain administrator access',async()=>{
  let calls=0;const result=await handler({setupAdministrator:false})({body:{organisation_code:'TEST',organisation_name:'Test'},send:(status,body)=>({status,body}),broker:async()=>{calls++;}});assert.equal(result.status,403);assert.equal(calls,0);
});
test('new organisation, root and creator assignment use one atomic SQL statement; updates do not assign roles',async()=>{
  const queries=[],access={setupAdministrator:true,tenantId:'tenant',auth:{email:'Creator@Example.com'}};
  const ctx={body:{organisation_code:'TEST',organisation_name:'Test'},broker:async(db,op,q)=>{queries.push(q);return{rowCount:1,rows:[{organisation_id:'new-org'}]};}};
  await handler(access)(ctx);assert.equal(queries.length,1);assert.match(queries[0].text,/WITH created AS/);assert.match(queries[0].text,/INSERT INTO erp_user_role/);assert.match(queries[0].text,/lower\(\$7\)/);assert.match(queries[0].text,/FROM administrator/);assert.equal(queries[0].values[6],'Creator@Example.com');
  queries.length=0;ctx.body.organisation_id='existing';await handler(access)(ctx);assert.equal(queries.length,1);assert.doesNotMatch(queries[0].text,/erp_user_role|erp_role/);
});

test('icon colour validates before writes and supports explicit clearing and omitted updates',async()=>{
  const access={setupAdministrator:true,tenantId:'tenant',auth:{email:'admin@example.com'}};
  const queries=[];
  const ctx={body:{organisation_id:'org',organisation_code:'TEST',organisation_name:'Test',organisation_icon_colour:'red'},send:(status,body)=>({status,body}),broker:async(db,op,q)=>{queries.push(q);return{rowCount:1,rows:[{}]};}};
  assert.equal((await handler(access)(ctx)).status,400);
  assert.equal(queries.length,0);
  ctx.body.organisation_icon_colour='#a1b2c3';await handler(access)(ctx);
  assert.equal(queries.at(-1).values[9],true);
  assert.equal(queries.at(-1).values[10],'#A1B2C3');
  ctx.body.organisation_icon_colour=null;await handler(access)(ctx);
  assert.equal(queries.at(-1).values[9],true);
  assert.equal(queries.at(-1).values[10],null);
  delete ctx.body.organisation_icon_colour;await handler(access)(ctx);
  assert.equal(queries.at(-1).values[9],false);
  assert.match(queries.at(-1).text,/CASE WHEN \$10 THEN \$11 ELSE organisation_icon_colour END/);
  delete ctx.body.organisation_id;ctx.body.organisation_icon_colour='#287d94';await handler(access)(ctx);
  assert.equal(queries.at(-1).values[7],'#287D94');
});
