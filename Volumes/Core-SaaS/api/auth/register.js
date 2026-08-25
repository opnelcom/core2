'use strict';
const crypto=require('crypto');
const {hash}=require('../_shared/password');

module.exports=async ctx=>{
  if(ctx.req.method!=='POST')return ctx.send(405,{error:'POST required'});

  const email=String(ctx.body.email||'').trim().toLowerCase();
  const password=String(ctx.body.password||'');
  if(!email.includes('@')||password.length<8)return ctx.send(400,{error:'Valid email and password of at least 8 characters required'});

  const token=crypto.randomBytes(24).toString('hex');
  const base=ctx.config.publicBaseUrl||'http://localhost';

  try{
    await ctx.broker('core_saas','query',{
      text:`INSERT INTO core_user(email,password_hash,known_name,full_name,activation_token,activation_expires_at) VALUES($1,$2,$3,$4,$5,now()+interval '24 hours') RETURNING user_id,email,status`,
      values:[email,await hash(password),ctx.body.known_name||null,ctx.body.full_name||null,token]
    });

    ctx.logger.info('activation email dispatch requested',{requestId:ctx.requestId,email,profile:ctx.config.smtpProfile});
    const mail=await ctx.smtp('send',{
      profile:ctx.config.smtpProfile,
      to:email,
      subject:'Activate your Core account',
      text:`Open ${base}/activate.html?token=${token}`
    });
    ctx.logger.info('activation email dispatch completed',{requestId:ctx.requestId,email,profile:ctx.config.smtpProfile,accepted:mail.accepted,rejected:mail.rejected,development:mail.development===true});

    return ctx.send(201,{message:'Registration created. Check your email to activate the account.'});
  }catch(e){
    if(String(e.message).includes('duplicate')){
      ctx.logger.warn('activation email dispatch skipped',{requestId:ctx.requestId,email,reason:'duplicate_registration'});
      return ctx.send(409,{error:'Email already registered'});
    }
    ctx.logger.error('registration failed',{requestId:ctx.requestId,email,error:e.message,status:e.status});
    throw e;
  }
};
