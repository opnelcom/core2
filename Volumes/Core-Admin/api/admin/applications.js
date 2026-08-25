'use strict';
const {requireAdmin,clean,cleanSvg,ensureApplicationColumns,applicationTypes,rowStatuses}=require('../_shared/admin');

module.exports=async ctx=>{
  const admin=requireAdmin(ctx);
  if(admin.status)return ctx.send(admin.status,admin.body);
  await ensureApplicationColumns(ctx);
  if(ctx.req.method==='GET'){
    const r=await ctx.broker('core_saas','query',{text:`SELECT application_id,application_code,application_name,application_description,application_icon_svg,application_type,route_prefix,status,created_at,updated_at FROM core_application ORDER BY application_name`});
    return {applications:r.rows};
  }
  if(ctx.req.method!=='POST'&&ctx.req.method!=='PATCH')return ctx.send(405,{error:'GET, POST or PATCH required'});
  const id=ctx.body.application_id||null;
  const code=clean(ctx.body.application_code);
  const name=clean(ctx.body.application_name);
  const description=clean(ctx.body.application_description);
  let icon=null;
  try{
    icon=cleanSvg(ctx.body.application_icon_svg);
  }catch(e){
    return ctx.send(400,{error:e.message});
  }
  const type=ctx.body.application_type||'public_application';
  const route=clean(ctx.body.route_prefix);
  const status=ctx.body.status||'active';
  if(!code||!name||!route)return ctx.send(400,{error:'Application code, name and route prefix are required'});
  if(!applicationTypes.includes(type))return ctx.send(400,{error:'Invalid application type'});
  if(!rowStatuses.includes(status))return ctx.send(400,{error:'Invalid status'});
  const r=await ctx.broker('core_saas','query',{
    text:`INSERT INTO core_application(application_id,application_code,application_name,application_description,application_icon_svg,application_type,route_prefix,status)
          VALUES(COALESCE($1::uuid,gen_random_uuid()),$2,$3,$4,$5,$6,$7,$8)
          ON CONFLICT(application_id) DO UPDATE
          SET application_code=excluded.application_code,application_name=excluded.application_name,application_description=excluded.application_description,application_icon_svg=excluded.application_icon_svg,application_type=excluded.application_type,route_prefix=excluded.route_prefix,status=excluded.status,updated_at=now()
          RETURNING application_id,application_code,application_name,application_description,application_icon_svg,application_type,route_prefix,status,created_at,updated_at`,
    values:[id,code,name,description||null,icon,type,route,status]
  });
  return {application:r.rows[0]};
};
