'use strict';
module.exports=async ctx=>{
  const a=ctx.auth();
  if(!a)return ctx.send(401,{error:'Authentication required'});
  await ctx.broker('core_saas','query',{text:`ALTER TABLE core_user ADD COLUMN IF NOT EXISTS profile_photo_data_url text`});
  if(ctx.req.method==='GET'){
    const r=await ctx.broker('core_saas','query',{text:`SELECT user_id,email,known_name,full_name,profile_photo_data_url,user_type,status,created_at,activated_at,updated_at FROM core_user WHERE user_id=$1`,values:[a.user_id]});
    return {user:r.rows[0]};
  }
  if(!['POST','PATCH'].includes(ctx.req.method))return ctx.send(405,{error:'GET, POST or PATCH required'});
  const knownName=ctx.body.known_name===undefined?null:String(ctx.body.known_name||'').trim();
  const fullName=ctx.body.full_name===undefined?null:String(ctx.body.full_name||'').trim();
  let profilePhotoDataUrl=ctx.body.profile_photo_data_url;
  if(profilePhotoDataUrl!==undefined&&profilePhotoDataUrl!==null){
    profilePhotoDataUrl=String(profilePhotoDataUrl||'').trim();
    if(profilePhotoDataUrl&&!/^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/.test(profilePhotoDataUrl))return ctx.send(400,{error:'Profile photo must be a PNG, JPEG, or WebP data URL'});
    if(profilePhotoDataUrl.length>600000)return ctx.send(400,{error:'Profile photo is too large'});
  }
  const updatePhoto=profilePhotoDataUrl!==undefined;
  const r=await ctx.broker('core_saas','query',{text:`UPDATE core_user SET known_name=COALESCE($2,known_name),full_name=COALESCE($3,full_name),profile_photo_data_url=CASE WHEN $4::boolean THEN NULLIF($5,'') ELSE profile_photo_data_url END,updated_at=now() WHERE user_id=$1 RETURNING user_id,email,known_name,full_name,profile_photo_data_url,user_type,status,created_at,activated_at,updated_at`,values:[a.user_id,knownName||null,fullName||null,updatePhoto,profilePhotoDataUrl||'']});
  return {user:r.rows[0]};
};
