'use strict';
const {authTenant}=require('../_shared/erp');

module.exports=async ctx=>{
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const orgId=ctx.query.organisation_id;
  if(!orgId)return ctx.send(400,{error:'organisation_id is required'});
  const r=await ctx.broker('core_erp','query',{
    text:`WITH RECURSIVE tree AS (
            SELECT d.*,0 depth,ARRAY[d.division_name] path
            FROM erp_division d
            WHERE d.tenant_id=$1 AND d.organisation_id=$2 AND d.parent_division_id IS NULL AND d.workflow_status <> 'deleted'
            UNION ALL
            SELECT child.*,tree.depth+1,tree.path||child.division_name
            FROM erp_division child JOIN tree ON child.parent_division_id=tree.division_id
            WHERE child.tenant_id=$1 AND child.organisation_id=$2 AND child.workflow_status <> 'deleted'
          )
          SELECT * FROM tree ORDER BY path`,
    values:[access.tenantId,orgId]
  });
  return {divisions:r.rows};
};
