'use strict';

module.exports=async ctx=>{
  const a=await ctx.auth();
  if(!a||a.user_type!=='administration_user')return ctx.send(403,{error:'Core administrator required'});
  const profiles=Array.isArray(ctx.config.dbBrokerProfiles)?ctx.config.dbBrokerProfiles:[];
  const primary=profiles.find(profile=>profile&&profile.name&&profile.key);
  if(!primary)return ctx.send(500,{error:'Monitor DB broker profile key is not configured'});
  return ctx.broker(primary.name,'profiles');
};

module.exports=require("../_shared/context").withContext(module.exports);
