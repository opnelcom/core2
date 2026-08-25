'use strict';
const {hash,verify}=require('../_shared/password');

module.exports=async ctx=>{
  if(ctx.req.method!=='POST')return ctx.send(405,{error:'POST required'});
  const a=ctx.auth();
  if(!a)return ctx.send(401,{error:'Authentication required'});
  const currentPassword=String(ctx.body.current_password||'');
  const newPassword=String(ctx.body.new_password||'');
  if(newPassword.length<8)return ctx.send(400,{error:'New password must be at least 8 characters'});
  const r=await ctx.broker('core_saas','query',{text:`SELECT password_hash FROM core_user WHERE user_id=$1 AND status='active'`,values:[a.user_id]});
  if(!r.rowCount||!await verify(currentPassword,r.rows[0].password_hash))return ctx.send(401,{error:'Current password is incorrect'});
  await ctx.broker('core_saas','query',{text:`UPDATE core_user SET password_hash=$2,reset_token=NULL,reset_expires_at=NULL,updated_at=now() WHERE user_id=$1`,values:[a.user_id,await hash(newPassword)]});
  return {message:'Password changed'};
};
