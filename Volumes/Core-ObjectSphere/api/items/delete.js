'use strict';
const {ensureSchema,authTenant,clean}=require('../_shared/items');

module.exports=async ctx=>{
  if(ctx.req.method!=='POST'&&ctx.req.method!=='DELETE')return ctx.send(405,{error:'POST or DELETE required'});
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  await ensureSchema(ctx);
  const id=clean(ctx.body.item_id||ctx.query.item_id);
  if(!id)return ctx.send(400,{error:'Item id is required'});
  const r=await ctx.broker('core_objectsphere','query',{
    text:`WITH RECURSIVE subtree AS (
            SELECT item_id FROM objectsphere_item WHERE tenant_id=$1 AND item_id=$2 AND status='active'
            UNION ALL
            SELECT child.item_id
            FROM objectsphere_item child
            JOIN subtree parent ON parent.item_id=child.parent_item_id
            WHERE child.tenant_id=$1 AND child.status='active'
          )
          UPDATE objectsphere_item i
          SET status='deleted',deleted_at=now(),updated_by_email=$3,updated_at=now()
          FROM subtree
          WHERE i.item_id=subtree.item_id
          RETURNING i.item_id`,
    values:[access.tenantId,id,access.auth.email]
  });
  if(!r.rowCount)return ctx.send(404,{error:'Item not found'});
  return {deleted:r.rowCount};
};
