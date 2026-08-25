'use strict';
const {brokerConfig,authorizeAnyProfileKey,publicProfile}=require('../_shared/broker');

module.exports=async ctx=>{
  if(ctx.req.method!=='GET'&&ctx.req.method!=='POST')return ctx.send(405,{error:'GET or POST required'});
  const config=brokerConfig();
  const auth=authorizeAnyProfileKey(ctx,config);
  if(auth.status){
    ctx.logger.warn('broker profiles rejected',{requestId:ctx.requestId,statusCode:auth.status,error:auth.body.error});
    return ctx.send(auth.status,auth.body);
  }
  const profiles=(Array.isArray(config.dbProfiles)?config.dbProfiles:[]).map(publicProfile);
  ctx.logger.info('broker profiles listed',{requestId:ctx.requestId,profileCount:profiles.length});
  return {
    checked_at:new Date().toISOString(),
    profile_count:profiles.length,
    profiles
  };
};
