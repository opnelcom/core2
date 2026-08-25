'use strict';
const {Client}=require('pg');
const fs=require('fs'),path=require('path');

function publicDefinition(id,d){
  return {profile:id,host:d.host,port:d.port,database:d.database,user:d.user};
}

async function checkDatabase(id,d){
  const client=new Client({
    host:d.host,
    port:d.port,
    database:d.database,
    user:d.user,
    password:d.password,
    connectionTimeoutMillis:d.connectionTimeoutMillis||2000
  });
  const started=Date.now();
  try{
    await client.connect();
    await client.query('SELECT 1');
    return {...publicDefinition(id,d),ok:true,latency_ms:Date.now()-started};
  }catch(e){
    return {...publicDefinition(id,d),ok:false,latency_ms:Date.now()-started,error:e.message};
  }finally{
    try{await client.end();}catch{}
  }
}

function brokerConfig(){
  return JSON.parse(fs.readFileSync(path.join(process.env.CONTENT_ROOT||'/app/content','config','config.json'),'utf8'));
}

function authorize(ctx,config){
  const {brokerProfile}=ctx.body;
  if(!brokerProfile)return {status:400,body:{error:'DB broker profile required'}};
  const profile=(Array.isArray(config.dbProfiles)?config.dbProfiles:[]).find(x=>x&&x.name===brokerProfile);
  if(!profile)return {status:400,body:{error:'Unknown DB broker profile'}};
  if(!profile.profileKey)return {status:500,body:{error:'DB broker profile key is not configured'}};
  if(ctx.req.headers['x-core-key']!==profile.profileKey)return {status:403,body:{error:'Forbidden'}};
  if(!profile.host||!profile.database||!profile.user)return {status:500,body:{error:'DB broker profile connection is not configured'}};
  return {profile};
}

module.exports=async ctx=>{
  if(ctx.req.method!=='POST')return ctx.send(405,{error:'POST required'});
  const config=brokerConfig();
  if(Object.prototype.hasOwnProperty.call(ctx.body,'database'))return ctx.send(400,{error:'database parameter is not accepted; use DB broker profile'});
  const auth=authorize(ctx,config);
  if(auth.status){ctx.logger.warn('broker status rejected',{requestId:ctx.requestId,profile:ctx.body.brokerProfile,statusCode:auth.status,error:auth.body.error});return ctx.send(auth.status,auth.body);}
  ctx.logger.info('broker status requested',{requestId:ctx.requestId,profile:auth.profile.name,database:auth.profile.database});
  const results={};
  results[auth.profile.name]=await checkDatabase(auth.profile.name,auth.profile);
  ctx.logger.info('broker status completed',{requestId:ctx.requestId,profile:auth.profile.name,database:auth.profile.database,ok:results[auth.profile.name].ok,latency_ms:results[auth.profile.name].latency_ms});
  const total=Object.keys(results).length;
  const running=Object.values(results).filter(r=>r.ok).length;
  return {checked_at:new Date().toISOString(),summary:{total,running,not_running:total-running},databases:results};
};
