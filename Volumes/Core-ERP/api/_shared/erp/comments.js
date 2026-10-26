'use strict';
const {authTenant,clean,requireResourcePermission,requireOrganisationResourcePermission}=require('../erp');

// Identifiers are drawn only from this fixed application-owned map.
const records={
  legal_entity:{table:'erp_legal_entity',id:'legal_entity_id'},
  gl_account:{table:'erp_gl_account',id:'gl_account_id',status:'approved'},
  subledger_account:{table:'erp_subledger_account',id:'subledger_account_id',type:'subledger_account_type_id',status:'approved'},
  accounting_object:{table:'erp_accounting_object',id:'accounting_object_id',type:'accounting_object_type_id',status:'*'},
  accounting_dimension:{table:'erp_accounting_dimension',id:'accounting_dimension_id',type:'accounting_dimension_type_id',status:'*'},
};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function commentContext(ctx,input){
  const organisationId=clean(input.organisation_id),kind=clean(input.entity_kind),id=clean(input.entity_id);
  const definition=records[kind];
  if(!definition)return {status:400,body:{error:'Unsupported object class'}};
  if(!uuid.test(organisationId)||!uuid.test(id))return {status:400,body:{error:'A saved record and organisation are required'}};
  const access=await authTenant(ctx);
  if(access.status)return access;
  const result=await ctx.broker('core_erp','query',{
    text:`SELECT workflow_status${definition.type?`,owner_division_id,${definition.type}`:''} FROM ${definition.table}
          WHERE tenant_id=$1 AND organisation_id=$2 AND ${definition.id}=$3 AND workflow_status<>'deleted'`,
    values:[access.tenantId,organisationId,id]
  });
  if(!result.rowCount)return {status:404,body:{error:'Record not found'}};
  const record=result.rows[0];
  const options={organisationId,resourceKind:kind,resourceCode:'*',workflowStatus:definition.status||record.workflow_status};
  let denied;
  if(definition.type){
    options.divisionId=record.owner_division_id;
    options.resourceCode=record[definition.type];
    denied=await requireResourcePermission(ctx,access,options);
  }else denied=await requireOrganisationResourcePermission(ctx,access,options);
  return denied||{access,organisationId,kind,id};
}

async function listComments(ctx){
  const context=await commentContext(ctx,ctx.query||{});
  if(context.status)return ctx.send(context.status,context.body);
  const {access,organisationId,kind,id}=context;
  const result=await ctx.broker('core_erp','query',{
    text:`SELECT comment_id,comment_text,created_by_email,created_at FROM erp_record_comment
          WHERE tenant_id=$1 AND organisation_id=$2 AND entity_kind=$3 AND entity_id=$4
          ORDER BY created_at DESC,comment_id DESC`,
    values:[access.tenantId,organisationId,kind,id]
  });
  return {comments:result.rows};
}

async function submitComment(ctx){
  if(ctx.req.method!=='POST')return ctx.send(405,{error:'POST required'});
  const input=ctx.body||{};
  const context=await commentContext(ctx,input);
  if(context.status)return ctx.send(context.status,context.body);
  if(typeof input.comment_text!=='string'||!input.comment_text.trim()||input.comment_text.includes('\u0000'))return ctx.send(400,{error:'Enter a comment'});
  const {access,organisationId,kind,id}=context;
  const result=await ctx.broker('core_erp','query',{
    text:`INSERT INTO erp_record_comment(tenant_id,organisation_id,entity_kind,entity_id,comment_text,created_by_email)
          VALUES($1,$2,$3,$4,$5,$6) RETURNING comment_id,comment_text,created_by_email,created_at`,
    values:[access.tenantId,organisationId,kind,id,input.comment_text.trim(),access.auth.email]
  });
  return ctx.send(201,{comment:result.rows[0]});
}
module.exports={listComments,submitComment};
