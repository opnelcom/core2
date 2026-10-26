'use strict';
const {randomUUID}=require('node:crypto');
const {authTenant,requireAdmin}=require('../_shared/erp');
const {createTransactionPlan}=require('../_shared/erp/transaction-plan');
const {dateRange,assignmentRows,fail}=require('../_shared/erp/user-assignments');
module.exports=async ctx=>{
  if(ctx.req.method!=='POST')return ctx.send(405,{error:'POST required'});
  const access=await authTenant(ctx);if(access.status)return ctx.send(access.status,access.body);
  const denied=requireAdmin(access);if(denied)return ctx.send(denied.status,denied.body);
  try {
    const body=ctx.body,org=body.organisation_id,id=body.user_id||randomUUID();
    if(!org)fail('organisation_id is required');
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))fail('Invalid user identifier');
    if(typeof body.is_enabled!=='boolean')fail('Enabled must be true or false');
    const email=String(body.email||'').trim().toLowerCase();
    if(email.length>254||!/^\S+@[^\s@]+\.[^\s@]+$/.test(email))fail('Enter a valid email address');
    const dates=dateRange(body),roles=assignmentRows(body.roles,'role_id'),divisions=assignmentRows(body.divisions,'division_id');
    const plan=createTransactionPlan(ctx,['erp_organisation_user','erp_user_role','erp_user_division','erp_role','erp_division']);
    const client=plan.client;
    const organisation=await client.query('SELECT organisation_id FROM erp_organisation WHERE tenant_id=$1 AND organisation_id=$2 AND workflow_status<>\'deleted\'',[access.tenantId,org]);
    if(!organisation.rows.length)fail('Organisation not found',404);
    const previous=await client.query('SELECT * FROM erp_organisation_user WHERE tenant_id=$1 AND organisation_id=$2 AND user_id=$3',[access.tenantId,org,id]);
    if(body.user_id&&!previous.rows.length)fail('User not found',404);
    const duplicate=await client.query('SELECT user_id FROM erp_organisation_user WHERE tenant_id=$1 AND organisation_id=$2 AND email=$3 AND user_id<>$4',[access.tenantId,org,email,id]);
    if(duplicate.rows.length)fail('This email already exists in this organisation',409);
    const roleDefinitions=await client.query('SELECT role_id,is_active FROM erp_role WHERE tenant_id=$1 AND organisation_id=$2',[access.tenantId,org]);
    const existingRoles=previous.rows.length?await client.query('SELECT * FROM erp_user_role WHERE tenant_id=$1 AND organisation_id=$2 AND lower(email)=$3',[access.tenantId,org,previous.rows[0].email]):{rows:[]};
    if(roles.some(row=>!roleDefinitions.rows.some(role=>role.role_id===row.role_id&&(role.is_active||existingRoles.rows.some(old=>old.role_id===row.role_id)))))fail('Choose roles from this organisation; new assignments require active roles');
    const divisionDefinitions=await client.query('SELECT division_id FROM erp_division WHERE tenant_id=$1 AND organisation_id=$2 AND workflow_status<>\'deleted\'',[access.tenantId,org]);
    if(divisions.some(row=>!divisionDefinitions.rows.some(division=>division.division_id===row.division_id)))fail('Choose divisions from this organisation');
    const strings=['known_name','full_name','title','description'].map(key=>String(body[key]||'').trim());
    plan.write({text:`INSERT INTO erp_organisation_user(user_id,tenant_id,organisation_id,email,known_name,full_name,title,description,is_enabled,valid_from,valid_to)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      ON CONFLICT(user_id) DO UPDATE SET email=excluded.email,known_name=excluded.known_name,full_name=excluded.full_name,
        title=excluded.title,description=excluded.description,is_enabled=excluded.is_enabled,valid_from=excluded.valid_from,valid_to=excluded.valid_to,updated_at=now()`,
      values:[id,access.tenantId,org,email,...strings,body.is_enabled===true,dates.valid_from,dates.valid_to]});
    if(previous.rows.length)plan.write({text:'DELETE FROM erp_user_role WHERE tenant_id=$1 AND organisation_id=$2 AND lower(email)=$3',values:[access.tenantId,org,previous.rows[0].email]});
    plan.write({text:'DELETE FROM erp_user_division WHERE tenant_id=$1 AND organisation_id=$2 AND user_id=$3',values:[access.tenantId,org,id]});
    for(const role of roles)plan.write({text:'INSERT INTO erp_user_role(tenant_id,organisation_id,role_id,email,valid_from,valid_to) VALUES($1,$2,$3,$4,COALESCE($5::date,CURRENT_DATE),$6::date)',values:[access.tenantId,org,role.role_id,email,role.valid_from,role.valid_to]});
    for(const division of divisions)plan.write({text:'INSERT INTO erp_user_division(tenant_id,organisation_id,user_id,division_id,valid_from,valid_to) VALUES($1,$2,$3,$4,$5,$6)',values:[access.tenantId,org,id,division.division_id,division.valid_from,division.valid_to]});
    await plan.commit();return {ok:true,user_id:id};
  }catch(error){if(error.status)return ctx.send(error.status,{error:error.message});throw error;}
};
module.exports=require('../_shared/context').withContext(module.exports);
