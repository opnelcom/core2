'use strict';
const {ensureSchema,authTenant}=require('../../_shared/items');

module.exports=async ctx=>{
  if(ctx.req.method!=='POST')return ctx.send(405,{error:'POST required'});
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  await ensureSchema(ctx);
  const r=await ctx.broker('core_objectsphere','query',{
    text:`WITH ref_types AS (
            SELECT reference_object_type_id,type_name,type_description,sort_order
            FROM objectsphere_reference_object_type
            WHERE status='active'
          ),
          inserted_types AS (
            INSERT INTO objectsphere_object_type(tenant_id,type_name,type_description,sort_order,status,deleted)
            SELECT $1,rt.type_name,rt.type_description,rt.sort_order,'active',false
            FROM ref_types rt
            WHERE NOT EXISTS (
              SELECT 1 FROM objectsphere_object_type existing
              WHERE existing.tenant_id=$1
              AND lower(existing.type_name)=lower(rt.type_name)
              AND existing.deleted=false
            )
            RETURNING object_type_id,type_name
          ),
          target_types AS (
            SELECT object_type_id,type_name FROM inserted_types
            UNION
            SELECT existing.object_type_id,existing.type_name
            FROM objectsphere_object_type existing
            JOIN ref_types rt ON lower(rt.type_name)=lower(existing.type_name)
            WHERE existing.tenant_id=$1 AND existing.deleted=false
          ),
          inserted_attrs AS (
            INSERT INTO objectsphere_attribute(tenant_id,object_type_id,attribute_name,attribute_type,sort_order,status,deleted)
            SELECT $1,tt.object_type_id,ra.attribute_name,ra.attribute_type,ra.sort_order,'active',false
            FROM objectsphere_reference_attribute ra
            JOIN ref_types rt ON rt.reference_object_type_id=ra.reference_object_type_id
            JOIN target_types tt ON lower(tt.type_name)=lower(rt.type_name)
            WHERE ra.status='active'
            AND NOT EXISTS (
              SELECT 1 FROM objectsphere_attribute existing
              WHERE existing.object_type_id=tt.object_type_id
              AND lower(existing.attribute_name)=lower(ra.attribute_name)
              AND existing.deleted=false
            )
            RETURNING attribute_id
          ),
          inserted_event_types AS (
            INSERT INTO objectsphere_event_type(tenant_id,type_name,type_description,sort_order,default_severity,status,deleted)
            SELECT $1,ret.type_name,ret.type_description,ret.sort_order,ret.default_severity,'active',false
            FROM objectsphere_reference_event_type ret
            WHERE ret.status='active'
            AND NOT EXISTS (
              SELECT 1 FROM objectsphere_event_type existing
              WHERE existing.tenant_id=$1
              AND lower(existing.type_name)=lower(ret.type_name)
              AND existing.deleted=false
            )
            RETURNING event_type_id
          )
          SELECT
            (SELECT COUNT(*)::int FROM inserted_types) AS object_types_created,
            (SELECT COUNT(*)::int FROM inserted_attrs) AS attributes_created,
            (SELECT COUNT(*)::int FROM inserted_event_types) AS event_types_created`,
    values:[access.tenantId]
  });
  return r.rows[0];
};
