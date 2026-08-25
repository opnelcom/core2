'use strict';
module.exports=async ctx=>{
  if(ctx.req.method!=='POST')return ctx.send(405,{error:'POST required'});
  const email=String(ctx.body.email||'').trim().toLowerCase();
  if(!email.includes('@'))return ctx.send(400,{error:'Valid email required'});
  const token=ctx.crypto.randomBytes(24).toString('hex');
  const user=await ctx.broker('core_saas','query',{text:`SELECT user_id,email,status FROM core_user WHERE lower(email)=lower($1) AND status='active'`,values:[email]});
  if(user.rowCount){
    const reset=await ctx.broker('core_saas','query',{text:`UPDATE core_user SET reset_token=$1,reset_expires_at=now()+interval '1 hour',updated_at=now() WHERE user_id=$2 RETURNING email`,values:[token,user.rows[0].user_id]});
    if(!reset.rowCount){
      ctx.logger.error('password reset token update failed',{requestId:ctx.requestId,email,userId:user.rows[0].user_id});
      throw Object.assign(new Error('Password reset token update failed'),{status:500});
    }
    const base=ctx.config.publicBaseUrl||'http://localhost';
    const to=reset.rows[0].email;
    ctx.logger.info('password reset email dispatch requested',{requestId:ctx.requestId,email:to,profile:ctx.config.smtpProfile});
    const mail=await ctx.smtp('send',{profile:ctx.config.smtpProfile,to,subject:'Reset your Core password',text:`Open ${base}/resetpassword.html?token=${token}`});
    ctx.logger.info('password reset email dispatch completed',{requestId:ctx.requestId,email:to,profile:ctx.config.smtpProfile,accepted:mail.accepted,rejected:mail.rejected,development:mail.development===true});
  }else{
    ctx.logger.warn('password reset email dispatch skipped',{requestId:ctx.requestId,email,reason:'active_account_not_found'});
  }
  const body={message:'If the account exists, a password reset message has been sent.'};
  if(user.rowCount&&ctx.config.nodeEnv!=='production')body.reset_token=token;
  return body;
};
