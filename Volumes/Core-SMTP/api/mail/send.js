'use strict';
const nodemailer=require('nodemailer');

module.exports=async ctx=>{
  const requestMeta={requestId:ctx.requestId,method:ctx.req.method};
  ctx.logger.info('mail send request received',requestMeta);

  if(ctx.req.method!=='POST'){
    ctx.logger.warn('mail send rejected',{...requestMeta,statusCode:405,reason:'method_not_allowed'});
    return ctx.send(405,{error:'POST required'});
  }

  const {profile,to,subject,text,html}=ctx.body;
  const mailMeta={
    ...requestMeta,
    profile,
    to,
    subject,
    hasText:Boolean(text),
    hasHtml:Boolean(html)
  };

  if(!profile){
    ctx.logger.warn('mail send rejected',{...mailMeta,statusCode:400,reason:'missing_profile'});
    return ctx.send(400,{error:'smtp profile required'});
  }

  if(!to||!subject){
    ctx.logger.warn('mail send rejected',{...mailMeta,statusCode:400,reason:'missing_to_or_subject'});
    return ctx.send(400,{error:'to and subject required'});
  }

  const profiles=Array.isArray(ctx.config.smtpProfiles)?ctx.config.smtpProfiles:[];
  const smtp=profiles.find(x=>x&&x.name===profile);
  if(!smtp){
    ctx.logger.warn('mail send rejected',{...mailMeta,statusCode:400,reason:'unknown_profile'});
    return ctx.send(400,{error:'unknown smtp profile'});
  }

  if(!smtp.profileKey){
    ctx.logger.error('mail send profile misconfigured',{...mailMeta,statusCode:500,reason:'missing_profile_key'});
    return ctx.send(500,{error:'smtp profile key is not configured'});
  }

  if(ctx.req.headers['x-core-key']!==smtp.profileKey){
    ctx.logger.warn('mail send rejected',{...mailMeta,statusCode:403,reason:'forbidden'});
    return ctx.send(403,{error:'Forbidden'});
  }

  if(!smtp.host){
    ctx.logger.info('mail send accepted for development log',{...mailMeta,development:true});
    return {accepted:[to],development:true};
  }

  const transportMeta={
    ...mailMeta,
    host:smtp.host,
    port:Number(smtp.port||587),
    secure:smtp.secure===true,
    tlsRejectUnauthorized:smtp.tlsRejectUnauthorized!==false,
    authConfigured:Boolean(smtp.user),
    from:smtp.from||'core@example.local'
  };

  try{
    ctx.logger.info('mail send attempt',transportMeta);
    const t=nodemailer.createTransport({
      host:smtp.host,
      port:Number(smtp.port||587),
      secure:smtp.secure===true,
      tls:{rejectUnauthorized:smtp.tlsRejectUnauthorized!==false},
      auth:smtp.user?{user:smtp.user,pass:smtp.password}:undefined
    });
    const r=await t.sendMail({from:smtp.from||'core@example.local',to,subject,text,html});
    ctx.logger.info('mail send completed',{
      ...transportMeta,
      messageId:r.messageId,
      accepted:r.accepted,
      rejected:r.rejected,
      pending:r.pending,
      response:r.response
    });
    return {messageId:r.messageId,accepted:r.accepted,rejected:r.rejected};
  }catch(e){
    ctx.logger.error('mail send failed',{
      ...transportMeta,
      error:e.message,
      code:e.code,
      command:e.command,
      responseCode:e.responseCode,
      response:e.response
    });
    throw e;
  }
};
