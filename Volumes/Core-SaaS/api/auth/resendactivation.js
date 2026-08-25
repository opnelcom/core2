'use strict';
module.exports=async ctx=>{
  if(ctx.req.method!=='POST')return ctx.send(405,{error:'POST required'});
  const email=String(ctx.body.email||'').trim().toLowerCase();
  if(!email.includes('@'))return ctx.send(400,{error:'Valid email required'});
  const token=ctx.crypto.randomBytes(24).toString('hex');
  const r=await ctx.broker('core_saas','query',{text:`UPDATE core_user SET activation_token=$1,activation_expires_at=now()+interval '24 hours',updated_at=now() WHERE lower(email)=lower($2) AND status='pending' RETURNING email`,values:[token,email]});
  if(r.rowCount){
    const base=ctx.config.publicBaseUrl||'http://localhost';
    ctx.logger.info('activation email redispatch requested',{requestId:ctx.requestId,email,profile:ctx.config.smtpProfile});
    const mail=await ctx.smtp('send',{profile:ctx.config.smtpProfile,to:email,subject:'Activate your Core account',text:`Open ${base}/activate.html?token=${token}`});
    ctx.logger.info('activation email redispatch completed',{requestId:ctx.requestId,email,profile:ctx.config.smtpProfile,accepted:mail.accepted,rejected:mail.rejected,development:mail.development===true});
  }else{
    ctx.logger.warn('activation email redispatch skipped',{requestId:ctx.requestId,email,reason:'pending_account_not_found'});
  }
  return {message:'If the account is pending, an activation message has been sent.'};
};
