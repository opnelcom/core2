'use strict';
const {hash}=require('../_shared/password');

module.exports=async ctx=>{
  if(ctx.req.method!=='POST')return ctx.send(405,{error:'POST required'});
  const token=String(ctx.body.token||'');
  const password=String(ctx.body.password||'');
  if(!token||password.length<8)return ctx.send(400,{error:'Valid reset token and password of at least 8 characters required'});
  const passwordHash=await hash(password);
  const r=await ctx.broker('core_saas','query',{text:`UPDATE core_user SET password_hash=$1,reset_token=NULL,reset_expires_at=NULL,updated_at=now() WHERE reset_token=$2 AND reset_expires_at>now() AND status='active' RETURNING user_id,email,known_name,full_name,user_type,status`,values:[passwordHash,token]});
  if(!r.rowCount)return ctx.send(400,{error:'Invalid or expired reset token'});
  return {message:'Password reset complete',user:r.rows[0]};
};
