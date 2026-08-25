'use strict';
const {requireAdmin,clean,rowStatuses}=require('../_shared/admin');

module.exports=async ctx=>{
  const admin=requireAdmin(ctx);
  if(admin.status)return ctx.send(admin.status,admin.body);
  if(ctx.req.method==='GET'){
    const r=await ctx.broker('core_saas','query',{text:`SELECT theme_id,theme_name,css_file,status,created_at,updated_at FROM core_theme ORDER BY theme_name`});
    return {themes:r.rows};
  }
  if(ctx.req.method!=='POST'&&ctx.req.method!=='PATCH')return ctx.send(405,{error:'GET, POST or PATCH required'});
  const id=ctx.body.theme_id||null;
  const name=clean(ctx.body.theme_name);
  const cssFile=clean(ctx.body.css_file);
  const status=ctx.body.status||'active';
  if(!name||!cssFile)return ctx.send(400,{error:'Theme name and CSS file are required'});
  if(!rowStatuses.includes(status))return ctx.send(400,{error:'Invalid status'});
  const r=await ctx.broker('core_saas','query',{
    text:`INSERT INTO core_theme(theme_id,theme_name,css_file,status)
          VALUES(COALESCE($1::uuid,gen_random_uuid()),$2,$3,$4)
          ON CONFLICT(theme_id) DO UPDATE
          SET theme_name=excluded.theme_name,css_file=excluded.css_file,status=excluded.status,updated_at=now()
          RETURNING theme_id,theme_name,css_file,status,created_at,updated_at`,
    values:[id,name,cssFile,status]
  });
  return {theme:r.rows[0]};
};
