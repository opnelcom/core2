'use strict';
const {authTenant,clean,nullable,parseJson,validateSchema,requireModuleAccess}=require('../_shared/erp');

module.exports=async ctx=>{
  if(ctx.req.method!=='POST')return ctx.send(405,{error:'POST required'});
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const id=nullable(ctx.body.accounting_object_id);
  const orgId=ctx.body.organisation_id;
  const typeId=ctx.body.accounting_object_type_id;
  const divisionId=ctx.body.owner_division_id;
  const parentId=nullable(ctx.body.parent_accounting_object_id);
  const code=clean(ctx.body.object_code);
  const name=clean(ctx.body.object_name);
  if(!orgId||!typeId||!divisionId||!code||!name)return ctx.send(400,{error:'Organisation, type, division, code and name are required'});
  const moduleDenied=await requireModuleAccess(ctx,access,{organisationId:orgId,resourceKind:'accounting_object_type',resourceCode:typeId});
  if(moduleDenied)return ctx.send(moduleDenied.status,moduleDenied.body);
  const type=await ctx.broker('core_erp','query',{text:`SELECT * FROM erp_accounting_object_type WHERE tenant_id=$1 AND organisation_id=$2 AND accounting_object_type_id=$3`,values:[access.tenantId,orgId,typeId]});
  if(!type.rowCount)return ctx.send(404,{error:'Accounting object type not found'});
  if(parentId){
    if(id&&parentId===id)return ctx.send(400,{error:'Accounting object cannot be its own parent'});
    const parent=await ctx.broker('core_erp','query',{
      text:`SELECT accounting_object_id
            FROM erp_accounting_object
            WHERE tenant_id=$1 AND organisation_id=$2 AND accounting_object_id=$3 AND workflow_status <> 'deleted'`,
      values:[access.tenantId,orgId,parentId]
    });
    if(!parent.rowCount)return ctx.send(400,{error:'Parent accounting object must exist in the same organisation'});
    if(id){
      const cycle=await ctx.broker('core_erp','query',{
        text:`WITH RECURSIVE parent_chain AS (
                SELECT accounting_object_id,parent_accounting_object_id
                FROM erp_accounting_object
                WHERE tenant_id=$1 AND organisation_id=$2 AND accounting_object_id=$3
                UNION ALL
                SELECT parent.accounting_object_id,parent.parent_accounting_object_id
                FROM erp_accounting_object parent
                JOIN parent_chain child ON child.parent_accounting_object_id=parent.accounting_object_id
                WHERE parent.tenant_id=$1 AND parent.organisation_id=$2
              )
              SELECT 1 FROM parent_chain WHERE accounting_object_id=$4 LIMIT 1`,
        values:[access.tenantId,orgId,parentId,id]
      });
      if(cycle.rowCount)return ctx.send(400,{error:'Parent accounting object cannot create a hierarchy cycle'});
    }
  }
  let data;
  try{data=parseJson(ctx.body.additional_data,{});}catch{return ctx.send(400,{error:'Additional data must be valid JSON'});}
  const errors=validateSchema(type.rows[0].schema_json,data);
  if(errors.length)return ctx.send(400,{error:'Additional data is invalid',errors});
  const values=[access.tenantId,orgId,divisionId,typeId,parentId,code,name,nullable(ctx.body.valid_from),nullable(ctx.body.valid_to),JSON.stringify(data),access.auth.email];
  const text=id
    ? `UPDATE erp_accounting_object
       SET owner_division_id=$3,accounting_object_type_id=$4,parent_accounting_object_id=$5,object_code=$6,object_name=$7,valid_from=COALESCE($8::date,CURRENT_DATE),valid_to=$9::date,additional_data=$10::jsonb,updated_by_email=$11,updated_at=now()
       WHERE tenant_id=$1 AND organisation_id=$2 AND accounting_object_id=$12
       RETURNING *`
    : `INSERT INTO erp_accounting_object(tenant_id,organisation_id,owner_division_id,accounting_object_type_id,parent_accounting_object_id,object_code,object_name,workflow_status,valid_from,valid_to,additional_data,created_by_email,updated_by_email)
       VALUES($1,$2,$3,$4,$5,$6,$7,'draft',COALESCE($8::date,CURRENT_DATE),$9::date,$10::jsonb,$11,$11) RETURNING *`;
  const r=await ctx.broker('core_erp','query',{text,values:id?[...values,id]:values});
  if(!r.rowCount)return ctx.send(404,{error:'Accounting object not found'});
  return {record:r.rows[0]};
};
