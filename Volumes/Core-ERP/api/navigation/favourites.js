'use strict';
const {authTenant}=require('../_shared/erp');

function validItemKey(key){
  if(typeof key!=='string'||key.length>300)return false;
  try{
    const parts=JSON.parse(key);
    if(!Array.isArray(parts)||!['view','ledgerFamily','accountingMaster','transactionType','resourceRole','reportView','menuAction'].includes(parts[0]))return false;
    if(parts.length!==(parts[0]==='accountingMaster'?3:2))return false;
    return parts.every(part=>typeof part==='string'&&part.length>0&&!/[\u0000-\u001f]/.test(part))&&JSON.stringify(parts)===key;
  }catch{return false;}
}

module.exports=async ctx=>{
  if(!['GET','POST'].includes(ctx.req.method))return ctx.send(405,{error:'GET or POST required'});
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const orgId=access.organisationId;
  if(!orgId)return ctx.send(400,{error:'organisation_id is required'});
  const org=await ctx.broker('core_erp','query',{
    text:`SELECT 1 FROM erp_organisation WHERE tenant_id=$1 AND organisation_id=$2 AND workflow_status<>'deleted'`,
    values:[access.tenantId,orgId]
  });
  if(!org.rowCount)return ctx.send(404,{error:'Organisation is not available'});
  const values=[access.tenantId,access.auth.user_id,orgId];
  const installed=await ctx.broker('core_erp','query',{text:`SELECT to_regclass('erp_user_menu_favourite') AS favourite_table`});
  if(!installed.rows[0]?.favourite_table){
    if(ctx.req.method==='GET')return {favourites:[]};
    return ctx.send(409,{error:'Initialise Schema to install the favourites table, then try again'});
  }
  if(ctx.req.method==='POST'){
    const key=ctx.body?.item_key;
    if(!validItemKey(key)||typeof ctx.body?.is_favourite!=='boolean')
      return ctx.send(400,{error:'A valid item_key and boolean is_favourite are required'});
    values.push(key);
    await ctx.broker('core_erp','query',ctx.body.is_favourite?{
      text:`INSERT INTO erp_user_menu_favourite(tenant_id,user_id,organisation_id,item_key) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`,values
    }:{
      text:`DELETE FROM erp_user_menu_favourite WHERE tenant_id=$1 AND user_id=$2 AND organisation_id=$3 AND item_key=$4`,values
    });
    return {ok:true};
  }
  const result=await ctx.broker('core_erp','query',{
    text:`SELECT item_key FROM erp_user_menu_favourite WHERE tenant_id=$1 AND user_id=$2 AND organisation_id=$3 ORDER BY item_key`,values
  });
  return {favourites:result.rows.map(row=>row.item_key)};
};

module.exports=require("../_shared/context").withContext(module.exports);
