'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const root = '/app/content';
const logRoot = '/app/content/logs';
const {readConfig} = require('./config');
const config = readConfig();
const port = config.port;
const apiRoot = path.join(root,'api');
const publicRoot = path.join(root,'public');
const maxBodyBytes = config.maxBodyBytes ?? 1024*1024;

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
function cookies(header=''){ return Object.fromEntries(header.split(';').map(v=>v.trim()).filter(Boolean).map(v=>{const i=v.indexOf('=');return i<0?[decodeURIComponent(v),'']:[decodeURIComponent(v.slice(0,i)),decodeURIComponent(v.slice(i+1))]})); }
function send(res,status,body,headers={}){ const data=Buffer.from(typeof body==='string'?body:JSON.stringify(body)); res.writeHead(status,{'content-type':typeof body==='string'?'text/plain; charset=utf-8':'application/json; charset=utf-8','content-length':data.length,...headers}); res.end(data); }
async function body(req){ const parts=[]; let size=0; for await(const c of req){size+=c.length;if(size>maxBodyBytes)throw Object.assign(new Error('Body too large'),{status:413});parts.push(c);} const raw=Buffer.concat(parts).toString('utf8'); if(!raw)return {}; const ct=req.headers['content-type']||''; if(ct.includes('application/json')) return JSON.parse(raw); if(ct.includes('application/x-www-form-urlencoded')) return Object.fromEntries(new URLSearchParams(raw)); return {raw}; }
function safeJoin(base,p){const f=path.resolve(base,'.'+path.sep+p);const rel=path.relative(base,f);return rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel)?null:f;}
function contentType(file){return ({'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.ico':'image/x-icon','.woff':'font/woff','.woff2':'font/woff2'})[path.extname(file).toLowerCase()]||'application/octet-stream';}
function staticCacheControl(file){
 const ext=path.extname(file).toLowerCase();
 if(['.png','.jpg','.jpeg','.webp','.gif','.svg','.ico','.woff','.woff2'].includes(ext))return 'public, max-age=86400, stale-while-revalidate=604800';
 if(ext==='.css')return 'public, max-age=300, stale-while-revalidate=3600';
 return 'no-cache';
}
function clearContentApiCache(){
 if(String(config.nodeEnv||process.env.NODE_ENV||'').toLowerCase()!=='development')return;
 const apiPrefix=apiRoot+path.sep;
 Object.keys(require.cache).forEach(id=>{
  if(id===apiRoot||id.startsWith(apiPrefix))delete require.cache[id];
 });
}
function setCookie(res,name,value,opts={}){let s=`${encodeURIComponent(name)}=${encodeURIComponent(value)}`;s+=`; Path=${opts.path||'/'}`;if(opts.httpOnly!==false)s+='; HttpOnly';s+=`; SameSite=${opts.sameSite||'Lax'}`;if(opts.maxAge!==undefined)s+=`; Max-Age=${opts.maxAge}`;if(opts.secure)s+='; Secure';const old=res.getHeader('Set-Cookie');res.setHeader('Set-Cookie',old?[].concat(old,s):s);}
function clearCookie(res,name){setCookie(res,name,'',{maxAge:0});}
const server=http.createServer(async(req,res)=>{
 const requestId=req.headers['x-request-id']||crypto.randomUUID(); res.setHeader('x-request-id',requestId);
 res.setHeader('x-content-type-options','nosniff');res.setHeader('x-frame-options','SAMEORIGIN');res.setHeader('referrer-policy','same-origin');
 const u=new URL(req.url,'http://localhost');
 try{
  if(u.pathname==='/health')return send(res,200,{status:'ok',application:config.name||'core-app'});
  if(u.pathname.startsWith('/api/')){
    const rel=u.pathname.slice(5).replace(/\/+$/,'')||'index';
    const file=safeJoin(apiRoot,rel+'.js'); if(!file||!fs.existsSync(file))return send(res,404,{error:'API endpoint not found'});
    if(rel.split('/').some(part=>part.startsWith('_')))return send(res,404,{error:'API endpoint not found'});
    clearContentApiCache(); const handler=require(file);
    if(typeof handler!=='function')return send(res,404,{error:'API endpoint not found'});
    const ctx={req,res,url:u,query:Object.fromEntries(u.searchParams),cookies:cookies(req.headers.cookie),body:await body(req),config,logger:{info:(m,x)=>log('info',m,x),warn:(m,x)=>log('warn',m,x),error:(m,x)=>log('error',m,x)},send:(s,b,h)=>send(res,s,b,h),setCookie:(n,v,o)=>setCookie(res,n,v,o),clearCookie:n=>clearCookie(res,n),crypto,requestId};
    const result=await handler(ctx); if(!res.writableEnded&&result!==undefined)send(res,200,result);
    return;
  }
  let rel=decodeURIComponent(u.pathname); if(rel==='/'||rel.endsWith('/'))rel+='index.html'; let file=safeJoin(publicRoot,rel); if(!file||!fs.existsSync(file)||fs.statSync(file).isDirectory()){file=path.join(publicRoot,'index.html');}
  if(!fs.existsSync(file))return send(res,404,'Not found');
  const stat=fs.statSync(file);
  const etag=`W/"${stat.size.toString(16)}-${Math.trunc(stat.mtimeMs).toString(16)}"`;
  const staticHeaders={'cache-control':staticCacheControl(file),'etag':etag,'last-modified':stat.mtime.toUTCString()};
  if(req.headers['if-none-match']===etag){res.writeHead(304,staticHeaders);return res.end();}
  res.writeHead(200,{'content-type':contentType(file),'content-length':stat.size,...staticHeaders});
  if(req.method==='HEAD')return res.end();
  fs.createReadStream(file).pipe(res);
 }catch(e){log('error',e.message,{requestId,stack:e.stack});if(!res.writableEnded)send(res,e.status||500,{error:e.message,details:e.details});}
});
server.listen(port,'0.0.0.0',()=>log('info',`Listening on ${port}`));
