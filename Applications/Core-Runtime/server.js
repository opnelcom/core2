'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const root = process.env.CONTENT_ROOT || '/app/content';
const logRoot = process.env.LOG_ROOT || '/app/logs';
const config = readJson(path.join(root,'config','config.json'), {});
const port = Number(process.env.PORT || config.port || 3000);
const apiRoot = path.join(root,'api');
const publicRoot = path.join(root,'public');
const maxBodyBytes = Number(process.env.MAX_BODY_BYTES || config.maxBodyBytes || 1024*1024);

function readJson(file, fallback){ try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return fallback;} }
function dailyLogFile(appName){
 const safeName=String(appName||'core-app').replace(/[^A-Za-z0-9._-]/g,'-');
 const day=new Date().toISOString().slice(0,10);
 return `${safeName}-${day}.log`;
}
function log(level,msg,meta={}){
 const entry={ts:new Date().toISOString(),level,app:config.name||'core-app',msg,...meta};
 const line=JSON.stringify(entry);
 console.log(line);
 try{
  const logToFile=config.logToFile===true;
  const fileLogMode=String(config.fileLogMode||'all').toLowerCase();
  const shouldWriteFile=logToFile&&(fileLogMode==='all'||(fileLogMode==='failures'&&(level==='warn'||level==='error')));
  if(shouldWriteFile){
   fs.mkdirSync(logRoot,{recursive:true});
   fs.appendFileSync(path.join(logRoot,dailyLogFile(config.name)),line+'\n');
  }
 }catch{}
}
function cookies(header=''){ return Object.fromEntries(header.split(';').map(v=>v.trim()).filter(Boolean).map(v=>{const i=v.indexOf('=');return [decodeURIComponent(v.slice(0,i)),decodeURIComponent(v.slice(i+1))]})); }
function send(res,status,body,headers={}){ const data=Buffer.from(typeof body==='string'?body:JSON.stringify(body)); res.writeHead(status,{'content-type':typeof body==='string'?'text/plain; charset=utf-8':'application/json; charset=utf-8','content-length':data.length,...headers}); res.end(data); }
async function body(req){ const parts=[]; let size=0; for await(const c of req){size+=c.length;if(size>maxBodyBytes)throw Object.assign(new Error('Body too large'),{status:413});parts.push(c);} const raw=Buffer.concat(parts).toString('utf8'); if(!raw)return {}; const ct=req.headers['content-type']||''; if(ct.includes('application/json')) return JSON.parse(raw); if(ct.includes('application/x-www-form-urlencoded')) return Object.fromEntries(new URLSearchParams(raw)); return {raw}; }
function safeJoin(base,p){const f=path.normalize(path.join(base,p));return f.startsWith(base)?f:null;}
function contentType(file){return ({'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'})[path.extname(file)]||'application/octet-stream';}
async function broker(profile,action,payload={}){ const brokerUrl=config.dbBrokerURL||'http://core-broker:3000'; const brokerProfile=profile||payload.brokerProfile||config.dbBrokerProfile; if(!brokerProfile) throw Object.assign(new Error('DB broker profile required'),{status:500}); const profileEntry=Array.isArray(config.dbBrokerProfiles)?config.dbBrokerProfiles.find(x=>x&&x.name===brokerProfile):null; const brokerKey=payload.brokerKey||(profileEntry&&profileEntry.key)||config.dbBrokerKey; if(!brokerKey) throw Object.assign(new Error('DB broker key required'),{status:500}); const {brokerKey:_,brokerProfile:__,...brokerPayload}=payload; const r=await fetch(brokerUrl+'/api/broker/'+action,{method:'POST',headers:{'content-type':'application/json','x-core-key':brokerKey},body:JSON.stringify({brokerProfile,...brokerPayload})}); const j=await r.json(); if(!r.ok) throw Object.assign(new Error(j.error||'Broker error'),{status:r.status,details:j}); return j; }
async function smtp(action,payload={}){ if(!payload.profile) throw Object.assign(new Error('SMTP profile required'),{status:500}); const profileKey=payload.profileKey||config.smtpProfileKey; if(!profileKey) throw Object.assign(new Error('SMTP profile key required'),{status:500}); const {profileKey:_,...mailPayload}=payload; const r=await fetch((config.smtpUrl||'http://core-smtp:3000')+'/api/mail/'+action,{method:'POST',headers:{'content-type':'application/json','x-core-key':profileKey},body:JSON.stringify(mailPayload)}); const j=await r.json(); if(!r.ok) throw Object.assign(new Error(j.error||'SMTP error'),{status:r.status}); return j; }
function setCookie(res,name,value,opts={}){let s=`${encodeURIComponent(name)}=${encodeURIComponent(value)}`;s+=`; Path=${opts.path||'/'}`;if(opts.httpOnly!==false)s+='; HttpOnly';s+=`; SameSite=${opts.sameSite||'Lax'}`;if(opts.maxAge!==undefined)s+=`; Max-Age=${opts.maxAge}`;if(opts.secure)s+='; Secure';const old=res.getHeader('Set-Cookie');res.setHeader('Set-Cookie',old?[].concat(old,s):s);}
function clearCookie(res,name){setCookie(res,name,'',{maxAge:0});}
function auth(ctx){const token=ctx.cookies.core_session;if(!token)return null;try{const [p,s]=token.split('.');const sig=crypto.createHmac('sha256',config.sessionSecret||'change-me').update(p).digest('base64url');if(!crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(s)))return null;const data=JSON.parse(Buffer.from(p,'base64url').toString());if(data.exp<Date.now())return null;return data;}catch{return null;}}
function sessionMaxAgeSeconds(opts={}){
  const seconds=Number(opts.maxAgeSeconds||config.sessionMaxAgeSeconds||60*60*24*30);
  return Number.isFinite(seconds)&&seconds>0?Math.trunc(seconds):60*60*24*30;
}
function signSession(data,opts={}){const maxAge=sessionMaxAgeSeconds(opts);const p=Buffer.from(JSON.stringify({...data,exp:Date.now()+maxAge*1000})).toString('base64url');const s=crypto.createHmac('sha256',config.sessionSecret||'change-me').update(p).digest('base64url');return `${p}.${s}`;}

const server=http.createServer(async(req,res)=>{
 const requestId=req.headers['x-request-id']||crypto.randomUUID(); res.setHeader('x-request-id',requestId);
 res.setHeader('x-content-type-options','nosniff');res.setHeader('x-frame-options','SAMEORIGIN');res.setHeader('referrer-policy','same-origin');
 const u=new URL(req.url,'http://localhost');
 try{
  if(u.pathname==='/health')return send(res,200,{status:'ok',application:config.name||'core-app'});
  if(u.pathname.startsWith('/api/')){
    const rel=u.pathname.slice(5).replace(/\/+$/,'')||'index';
    const file=safeJoin(apiRoot,rel+'.js'); if(!file||!fs.existsSync(file))return send(res,404,{error:'API endpoint not found'});
    delete require.cache[require.resolve(file)]; const handler=require(file);
    const ctx={req,res,url:u,query:Object.fromEntries(u.searchParams),cookies:cookies(req.headers.cookie),body:await body(req),config,logger:{info:(m,x)=>log('info',m,x),warn:(m,x)=>log('warn',m,x),error:(m,x)=>log('error',m,x)},broker,smtp,send:(s,b,h)=>send(res,s,b,h),setCookie:(n,v,o)=>setCookie(res,n,v,o),clearCookie:n=>clearCookie(res,n),auth:()=>auth(ctx),signSession,crypto,requestId};
    const result=await handler(ctx); if(!res.writableEnded&&result!==undefined)send(res,200,result);
    return;
  }
  let rel=decodeURIComponent(u.pathname); if(rel==='/'||rel.endsWith('/'))rel+='index.html'; let file=safeJoin(publicRoot,rel); if(!file||!fs.existsSync(file)||fs.statSync(file).isDirectory()){file=path.join(publicRoot,'index.html');}
  if(!fs.existsSync(file))return send(res,404,'Not found'); const stat=fs.statSync(file);res.writeHead(200,{'content-type':contentType(file),'content-length':stat.size});fs.createReadStream(file).pipe(res);
 }catch(e){log('error',e.message,{requestId,stack:e.stack});if(!res.writableEnded)send(res,e.status||500,{error:e.message,details:e.details});}
});
server.listen(port,'0.0.0.0',()=>log('info',`Listening on ${port}`));
