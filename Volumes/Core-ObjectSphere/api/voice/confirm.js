'use strict';
const {ensureSchema,authTenant,clean,quantity}=require('../_shared/items');

function cleanActionId(value){
  return clean(value)||'';
}

function actionSelected(action,selectedIds){
  return !selectedIds||selectedIds.has(cleanActionId(action.action_id));
}

async function itemExists(ctx,tenantId,itemId){
  const r=await ctx.broker('core_objectsphere','query',{
    text:`SELECT item_id,item_name,item_description,quantity
          FROM objectsphere_item
          WHERE tenant_id=$1 AND item_id=$2 AND status='active'`,
    values:[tenantId,itemId]
  });
  return r.rows[0]||null;
}

async function wouldCreateCycle(ctx,tenantId,itemId,parentId){
  if(!parentId)return false;
  const r=await ctx.broker('core_objectsphere','query',{
    text:`WITH RECURSIVE ancestors AS (
            SELECT item_id,parent_item_id
            FROM objectsphere_item
            WHERE tenant_id=$1 AND item_id=$2 AND status='active'
            UNION ALL
            SELECT parent.item_id,parent.parent_item_id
            FROM objectsphere_item parent
            JOIN ancestors child ON child.parent_item_id=parent.item_id
            WHERE parent.tenant_id=$1 AND parent.status='active'
          )
          SELECT 1 FROM ancestors WHERE item_id=$3 LIMIT 1`,
    values:[tenantId,parentId,itemId]
  });
  return r.rowCount>0;
}

module.exports=async ctx=>{
  if(ctx.req.method!=='POST')return ctx.send(405,{error:'POST required'});
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  await ensureSchema(ctx);

  const actions=Array.isArray(ctx.body.actions)?ctx.body.actions:[];
  const selectedIds=Array.isArray(ctx.body.selected_action_ids)
    ? new Set(ctx.body.selected_action_ids.map(cleanActionId).filter(Boolean))
    : null;
  const selected=actions.filter(action=>actionSelected(action,selectedIds));
  if(!selected.length)return ctx.send(400,{error:'Select at least one voice action to apply'});

  const applied=[];
  for(const action of selected){
    const type=clean(action.action_type);
    if(type==='create_child'){
      const parentId=clean(action.parent_item_id);
      const childName=clean(action.child_item_name);
      if(!parentId||!childName)throw new Error('Create child action is missing a parent or child name');
      const parent=await itemExists(ctx,access.tenantId,parentId);
      if(!parent)throw new Error(`Parent item not found for "${childName}"`);
      const created=await ctx.broker('core_objectsphere','query',{
        text:`WITH next_order AS (
                SELECT COALESCE(MAX(sort_order),0)+1 sort_order
                FROM objectsphere_item
                WHERE tenant_id=$1 AND parent_item_id=$2 AND status='active'
              )
              INSERT INTO objectsphere_item(tenant_id,parent_item_id,item_name,item_description,quantity,sort_order,created_by_email,updated_by_email)
              SELECT $1,$2,$3,'',1,sort_order,$4,$4 FROM next_order
              RETURNING item_id,item_name,parent_item_id`,
        values:[access.tenantId,parentId,childName,access.auth.email]
      });
      const objectTypeId=clean(action.object_type_id);
      if(objectTypeId){
        const typeCheck=await ctx.broker('core_objectsphere','query',{
          text:`SELECT object_type_id,type_name
                FROM objectsphere_object_type
                WHERE tenant_id=$1 AND object_type_id=$2 AND status='active' AND deleted=false`,
          values:[access.tenantId,objectTypeId]
        });
        if(typeCheck.rowCount){
          await ctx.broker('core_objectsphere','query',{
            text:`INSERT INTO objectsphere_item_type(tenant_id,item_id,object_type_id,status)
                  VALUES($1,$2,$3,'active')
                  ON CONFLICT(item_id,object_type_id) DO UPDATE
                  SET status='active',updated_at=now()`,
            values:[access.tenantId,created.rows[0].item_id,objectTypeId]
          });
        }
      }
      for(const value of (Array.isArray(action.attribute_values)?action.attribute_values:[])){
        const attributeId=clean(value.attribute_id);
        const valueText=String(value.value_text||'').slice(0,4000);
        if(!attributeId||!valueText)continue;
        const attr=await ctx.broker('core_objectsphere','query',{
          text:`SELECT a.attribute_id,a.object_type_id,a.attribute_name,t.type_name
                FROM objectsphere_attribute a
                JOIN objectsphere_object_type t ON t.object_type_id=a.object_type_id
                WHERE a.tenant_id=$1
                AND a.attribute_id=$2
                AND a.status='active'
                AND a.deleted=false
                AND t.status='active'
                AND t.deleted=false`,
          values:[access.tenantId,attributeId]
        });
        if(!attr.rowCount)continue;
        const meta=attr.rows[0];
        await ctx.broker('core_objectsphere','query',{
          text:`INSERT INTO objectsphere_item_type(tenant_id,item_id,object_type_id,status)
                VALUES($1,$2,$3,'active')
                ON CONFLICT(item_id,object_type_id) DO UPDATE
                SET status='active',updated_at=now()`,
          values:[access.tenantId,created.rows[0].item_id,meta.object_type_id]
        });
        await ctx.broker('core_objectsphere','query',{
          text:`WITH saved AS (
                  INSERT INTO objectsphere_attribute_value(tenant_id,item_id,attribute_id,value_text)
                  VALUES($1,$2,$3,$4)
                  ON CONFLICT(item_id,attribute_id) DO UPDATE
                  SET value_text=excluded.value_text,updated_at=now()
                  RETURNING value_id
                )
                INSERT INTO objectsphere_attribute_value_history(
                  tenant_id,item_id,attribute_id,object_type_id,item_name,object_type_name,attribute_name,old_value_text,new_value_text,changed_by_email
                )
                VALUES($1,$2,$3,$5,$6,$7,$8,null,$4,$9)`,
          values:[
            access.tenantId,
            created.rows[0].item_id,
            attributeId,
            valueText,
            meta.object_type_id,
            created.rows[0].item_name||'',
            meta.type_name||'',
            meta.attribute_name||'',
            access.auth.email
          ]
        });
      }
      applied.push({action_type:type,item_id:created.rows[0].item_id,item_name:created.rows[0].item_name});
    }else if(type==='set_attribute'){
      const itemId=clean(action.item_id);
      const attributeId=clean(action.attribute_id);
      const valueText=String(action.value_text||'').slice(0,4000);
      if(!itemId||!attributeId)throw new Error('Set attribute action is missing an item or attribute');
      const ownership=await ctx.broker('core_objectsphere','query',{
        text:`SELECT a.attribute_id,a.object_type_id,a.attribute_name,t.type_name,i.item_name
              FROM objectsphere_attribute a
              JOIN objectsphere_object_type t ON t.object_type_id=a.object_type_id
              JOIN objectsphere_item i ON i.tenant_id=a.tenant_id
              WHERE a.tenant_id=$1
              AND i.item_id=$2
              AND a.attribute_id=$3
              AND i.status='active'
              AND a.status='active'
              AND a.deleted=false
              AND t.status='active'
              AND t.deleted=false`,
        values:[access.tenantId,itemId,attributeId]
      });
      if(!ownership.rowCount)throw new Error('Attribute or item not found');
      const meta=ownership.rows[0];
      await ctx.broker('core_objectsphere','query',{
        text:`INSERT INTO objectsphere_item_type(tenant_id,item_id,object_type_id,status)
              VALUES($1,$2,$3,'active')
              ON CONFLICT(item_id,object_type_id) DO UPDATE
              SET status='active',updated_at=now()`,
        values:[access.tenantId,itemId,meta.object_type_id]
      });
      const saved=await ctx.broker('core_objectsphere','query',{
        text:`WITH previous AS (
                SELECT value_text
                FROM objectsphere_attribute_value
                WHERE tenant_id=$1 AND item_id=$2 AND attribute_id=$3
              ),
              saved AS (
                INSERT INTO objectsphere_attribute_value(tenant_id,item_id,attribute_id,value_text)
                VALUES($1,$2,$3,$4)
                ON CONFLICT(item_id,attribute_id) DO UPDATE
                SET value_text=excluded.value_text,updated_at=now()
                RETURNING value_id,attribute_id,value_text,updated_at
              ),
              history AS (
                INSERT INTO objectsphere_attribute_value_history(
                  tenant_id,item_id,attribute_id,object_type_id,item_name,object_type_name,attribute_name,old_value_text,new_value_text,changed_by_email
                )
                SELECT $1,$2,$3,$5,$6,$7,$8,(SELECT value_text FROM previous),$4,$9
                WHERE (SELECT value_text FROM previous) IS DISTINCT FROM $4
                RETURNING history_id
              )
              SELECT saved.value_id,saved.attribute_id,saved.value_text,saved.updated_at
              FROM saved`,
        values:[access.tenantId,itemId,attributeId,valueText,meta.object_type_id,meta.item_name||'',meta.type_name||'',meta.attribute_name||'',access.auth.email]
      });
      applied.push({action_type:type,item_id:itemId,attribute_id:attributeId,value_text:saved.rows[0].value_text});
    }else if(type==='rename_item'){
      const itemId=clean(action.item_id);
      const newName=clean(action.new_item_name);
      if(!itemId||!newName)throw new Error('Rename action is missing an item or new name');
      const current=await itemExists(ctx,access.tenantId,itemId);
      if(!current)throw new Error('Item to rename was not found');
      const itemQuantity=quantity(current.quantity)||1;
      const r=await ctx.broker('core_objectsphere','query',{
        text:`UPDATE objectsphere_item
              SET item_name=$3,updated_by_email=$4,updated_at=now()
              WHERE tenant_id=$1 AND item_id=$2 AND status='active'
              RETURNING item_id,item_name`,
        values:[access.tenantId,itemId,newName,access.auth.email]
      });
      applied.push({action_type:type,item_id:r.rows[0].item_id,item_name:r.rows[0].item_name,quantity:itemQuantity});
    }else if(type==='move_item'){
      const itemId=clean(action.item_id);
      const parentId=clean(action.target_parent_item_id);
      if(!itemId)throw new Error('Move action is missing an item');
      const item=await itemExists(ctx,access.tenantId,itemId);
      if(!item)throw new Error('Item to move was not found');
      if(parentId){
        const parent=await itemExists(ctx,access.tenantId,parentId);
        if(!parent)throw new Error('Move target parent was not found');
        if(parentId===itemId||await wouldCreateCycle(ctx,access.tenantId,itemId,parentId))throw new Error('Cannot move an item under itself or its child');
      }
      const r=await ctx.broker('core_objectsphere','query',{
        text:`WITH next_order AS (
                SELECT COALESCE(MAX(sort_order),0)+1 sort_order
                FROM objectsphere_item
                WHERE tenant_id=$1 AND parent_item_id IS NOT DISTINCT FROM $3::uuid AND status='active'
              )
              UPDATE objectsphere_item
              SET parent_item_id=$3::uuid,sort_order=next_order.sort_order,updated_by_email=$4,updated_at=now()
              FROM next_order
              WHERE tenant_id=$1 AND item_id=$2 AND status='active'
              RETURNING item_id,item_name,parent_item_id`,
        values:[access.tenantId,itemId,parentId,access.auth.email]
      });
      applied.push({action_type:type,item_id:r.rows[0].item_id,item_name:r.rows[0].item_name,parent_item_id:r.rows[0].parent_item_id});
    }else{
      throw new Error(`Unsupported voice action: ${type||'unknown'}`);
    }
  }

  return {applied};
};
