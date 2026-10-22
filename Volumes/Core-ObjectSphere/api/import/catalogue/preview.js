'use strict';
const {authTenant,ensureSchema}=require('../../_shared/items');
const {prepare}=require('../../_shared/catalogue');
module.exports=async ctx=>{
 if(ctx.req.method!=='POST')return ctx.send(405,{error:'POST required'});
 const access=await authTenant(ctx);if(access.status)return ctx.send(access.status,access.body);
 await ensureSchema(ctx);
 try{const plan=await prepare(ctx,access);return {parent_item_id:plan.parent,destination:plan.destination.item_name,source:plan.source,objects:plan.objects.map(o=>({source_key:o.source_key,name:o.name,description:o.description,quantity:o.quantity,type:o.type_name,attributes:Object.fromEntries(o.values.map(v=>[v.attribute_name,v.value_text])),action:o.action,warning:o.warning}))};}
 catch(e){if(e.code)throw e;return ctx.send(400,{error:e.message});}
};

module.exports=require("../../_shared/context").withContext(module.exports);
