"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {hasWorkflowActionRole,validateWorkflowActionRoles}=require('../api/_shared/erp/workflow-action-roles');
const {normaliseWorkflow,workflowStatements}=require('../api/_shared/erp/workflow-configuration');
const role1='00000000-0000-4000-8000-000000000001',role2='00000000-0000-4000-8000-000000000002';
function fixture(){
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE erp_role(role_id,tenant_id,organisation_id,is_active);
  CREATE TABLE erp_user_role(role_id,tenant_id,organisation_id,email,valid_from,valid_to);
  CREATE TABLE erp_workflow_action_role(tenant_id,organisation_id,workflow_next_id,role_id);
  INSERT INTO erp_role VALUES('${role1}','tenant','org',1),('${role2}','tenant','org',1);
  INSERT INTO erp_workflow_action_role VALUES('tenant','org','action','${role1}'),('tenant','org','action','${role2}');`);
 const access={tenantId:'tenant',auth:{email:'owner@example.com'},setupAdministrator:false};
 const ctx={broker:async(_profile,_operation,{text,values})=>{const statement=db.prepare(text.replaceAll('::uuid','').replaceAll('CURRENT_DATE',"'2026-10-14'"));statement.setAllowUnknownNamedParameters(true);const rows=statement.all(Object.fromEntries(values.map((value,index)=>[String(index+1),value])));return {rows,rowCount:rows.length};}};
 return {db,ctx,access,assign:(role,from='2020-01-01',to=null,org='org',tenant='tenant')=>db.prepare('INSERT INTO erp_user_role VALUES(?,?,?,?,?,?)').run(role,tenant,org,'OWNER@example.com',from,to)};
}
test('holding any one assigned role is enough; no role and unassigned actions are denied',async()=>{
 const f=fixture();try{assert.equal(await hasWorkflowActionRole(f.ctx,f.access,'org','action'),false);f.assign(role2);assert.equal(await hasWorkflowActionRole(f.ctx,f.access,'org','action'),true);assert.equal(await hasWorkflowActionRole(f.ctx,f.access,'org','unassigned'),false);}finally{f.db.close();}
});
test('inactive, expired, future, foreign-organisation and foreign-tenant assignments cannot grant an action',async()=>{
 for(const change of [f=>{f.assign(role1);f.db.exec('UPDATE erp_role SET is_active=0');},f=>f.assign(role1,'2020-01-01','2026-10-13'),f=>f.assign(role1,'2026-10-15'),f=>f.assign(role1,'2020-01-01',null,'foreign'),f=>f.assign(role1,'2020-01-01',null,'org','foreign')]){const f=fixture();try{change(f);assert.equal(await hasWorkflowActionRole(f.ctx,f.access,'org','action'),false);}finally{f.db.close();}}
});
test('the approved setup-administrator bypass requires no action role',async()=>{assert.equal(await hasWorkflowActionRole({broker:()=>{throw new Error('Unexpected read');}},{setupAdministrator:true},'org','action'),true);});
test('workflow configuration stores unlimited deduplicated action-to-role links in the save batch',()=>{
 const definition=normaliseWorkflow({path_name:'Example',steps:[{step_code:'draft',is_initial:true,sort_order:10,actions:[{action_label:'Submit',next_step_code:'draft',sort_order:10,role_ids:[role1,role2,role1]}]}]},[{status_code:'draft'}]);
 const writes=workflowStatements('tenant','org','path',definition);const action=writes.find(s=>s.text.includes('INSERT INTO erp_workflow_next'));
 const links=writes.filter(s=>s.text.includes('INSERT INTO erp_workflow_action_role'));assert.equal(links.length,2);assert.deepEqual(links.map(s=>s.values[3]),[role1,role2]);assert.ok(links.every(s=>s.values[2]===action.values[0]));
 assert.throws(()=>normaliseWorkflow({path_name:'Bad',steps:[{step_code:'draft',is_initial:true,sort_order:10,actions:[{action_label:'Submit',next_step_code:'draft',sort_order:10,role_ids:['foreign']}]}]},[{status_code:'draft'}]),/valid role/);
});
test('save validation rejects role identifiers outside the selected organisation',async()=>{
 let query;const access={tenantId:'tenant'};const definition={actions:[{role_ids:[role1,role2]}]};
 const result=await validateWorkflowActionRoles({broker:async(_p,_op,args)=>{query=args;return {rows:[{role_id:role1}],rowCount:1};}},access,'org',definition);
 assert.equal(result.status,400);assert.deepEqual(query.values,['tenant','org',[role1,role2]]);
 assert.match(query.text,/tenant_id=\$1 AND organisation_id=\$2/);
});
