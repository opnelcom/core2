'use strict';
const {Pool}=require('pg');
const fs=require('fs');
const path=require('path');

const pools=new Map();
const metrics=new Map();

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

function authorizeAnyProfileKey(ctx,config){
  const profiles=Array.isArray(config.dbProfiles)?config.dbProfiles:[];
  if(!profiles.length)return {status:500,body:{error:'No DB broker profiles are configured'}};
  const key=ctx.req.headers['x-core-key'];
  if(!key)return {status:403,body:{error:'Forbidden'}};
  const profile=profiles.find(x=>x&&x.profileKey&&x.profileKey===key);
  if(!profile)return {status:403,body:{error:'Forbidden'}};
  return {profile};
}

function poolNumber(value,defaultValue,min,max){
  const n=Number(value);
  if(!Number.isFinite(n))return defaultValue;
  return Math.max(min,Math.min(max,Math.trunc(n)));
}

function poolFor(profile){
  const key=JSON.stringify({
    name:profile.name,
    host:profile.host,
    port:profile.port,
    database:profile.database,
    user:profile.user,
    password:profile.password
  });
  if(!pools.has(key)){
    pools.set(key,new Pool({
      host:profile.host,
      port:profile.port,
      database:profile.database,
      user:profile.user,
      password:profile.password,
      max:poolNumber(profile.poolMax,4,1,50),
      idleTimeoutMillis:poolNumber(profile.poolIdleTimeoutMillis,10000,1000,300000),
      connectionTimeoutMillis:poolNumber(profile.connectionTimeoutMillis,5000,500,60000)
    }));
  }
  return pools.get(key);
}

function poolKey(profile){
  return JSON.stringify({
    name:profile.name,
    host:profile.host,
    port:profile.port,
    database:profile.database,
    user:profile.user,
    password:profile.password
  });
}

function poolStats(profile){
  const pool=pools.get(poolKey(profile));
  return {
    created:!!pool,
    max:poolNumber(profile.poolMax,4,1,50),
    total_count:pool?pool.totalCount:0,
    idle_count:pool?pool.idleCount:0,
    waiting_count:pool?pool.waitingCount:0
  };
}

function profileMetrics(profile){
  const name=profile.name||'unknown';
  if(!metrics.has(name)){
    metrics.set(name,{
      query_requests:0,
      query_completed:0,
      query_failed:0,
      transaction_requests:0,
      transaction_completed:0,
      transaction_failed:0,
      last_request_at:null,
      last_success_at:null,
      last_failure_at:null
    });
  }
  return metrics.get(name);
}

function recordProfileMetric(profile,operation,outcome){
  const m=profileMetrics(profile);
  const key=`${operation}_${outcome}`;
  if(Object.prototype.hasOwnProperty.call(m,key))m[key]+=1;
  const now=new Date().toISOString();
  if(outcome==='requests')m.last_request_at=now;
  if(outcome==='completed')m.last_success_at=now;
  if(outcome==='failed')m.last_failure_at=now;
}

function publicProfile(profile){
  return {
    name:profile.name||null,
    configured:!!(profile.name&&profile.profileKey&&profile.host&&profile.database&&profile.user),
    has_profile_key:!!profile.profileKey,
    has_connection_config:!!(profile.host&&profile.database&&profile.user),
    pool:poolStats(profile),
    stats:profileMetrics(profile)
  };
}

function summarizeSql(text){
  const s=String(text||'').replace(/\s+/g,' ').trim();
  return s.length>180?s.slice(0,177)+'...':s;
}

module.exports={brokerConfig,authorize,authorizeAnyProfileKey,poolFor,poolStats,publicProfile,recordProfileMetric,summarizeSql};
