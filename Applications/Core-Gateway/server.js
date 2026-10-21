'use strict';
const http=require('http'),https=require('https'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const root='/app/content';
const logRoot='/app/content/logs';
function config(){
  const file=path.join(root,'config','gateway.json');
  let c;
  try{c=JSON.parse(fs.readFileSync(file,'utf8'));}
  catch(e){throw new Error('Unable to read Gateway configuration '+file+': '+e.message);}
  if(!c||typeof c!=='object'||Array.isArray(c))throw new Error('Gateway configuration must be an object');
  const validPort=p=>Number.isInteger(p)&&p>=1&&p<=65535;
  if(!validPort(c.port))throw new Error('Gateway port must be an integer from 1 to 65535');
  if(!c.tls||typeof c.tls.enabled!=='boolean')throw new Error('Gateway tls.enabled must be a boolean');
  if(c.tls.enabled){
    if(!validPort(c.tls.port))throw new Error('Gateway tls.port must be an integer from 1 to 65535');
    if(c.tls.port===c.port)throw new Error('Gateway HTTP and HTTPS ports must differ');
  }
  if(!Array.isArray(c.routes))throw new Error('Gateway routes must be an array');
  for(const route of c.routes){
    if(!route||typeof route.prefix!=='string'||!route.prefix.startsWith('/'))throw new Error('Gateway route prefix must start with /');
    let target;
    try{target=new URL(route.target);}catch{throw new Error('Gateway route target must be a valid URL');}
    if(target.protocol!=='http:')throw new Error('Gateway route target must use http:');
    if(route.stripPrefix!==undefined&&typeof route.stripPrefix!=='boolean')throw new Error('Gateway route stripPrefix must be a boolean');
  }
  return c;
}
function dailyLogFile(appName){const safeName=String(appName||'core-gateway').replace(/[^A-Za-z0-9._-]/g,'-');const day=new Date().toISOString().slice(0,10);return `${safeName}-${day}.log`;}
function writeLog(level,msg,meta={}){const entry={ts:new Date().toISOString(),level,app:'core-gateway',msg,...meta};const line=JSON.stringify(entry);console.log(line);try{fs.mkdirSync(logRoot,{recursive:true});fs.appendFileSync(path.join(logRoot,dailyLogFile('core-gateway')),line+'\n');}catch{}}
function writeVisitorLog(meta={}){const entry={ts:new Date().toISOString(),app:'core-gateway',event:'visitor-issued',...meta};const line=JSON.stringify(entry);try{fs.mkdirSync(logRoot,{recursive:true});fs.appendFileSync(path.join(logRoot,'core-gateway-visitors.log'),line+'\n');}catch{}}
let httpsActive=false;

function contentPath(value){
  if(!value)return null;
  return path.isAbsolute(value)?value:path.join(root,value);
}

function loadTls(c){
  const tls=c.tls||c.ssl||{};
  if(tls.enabled===false)return null;
  const certFile=contentPath(tls.certFile||tls.cert_file||'certs/fullchain.pem');
  const keyFile=contentPath(tls.keyFile||tls.key_file||'certs/privkey.pem');
  if(!certFile||!keyFile||!fs.existsSync(certFile)||!fs.existsSync(keyFile)){
    throw new Error('TLS enabled but certificate or key file is missing: '+certFile+', '+keyFile);
  }
  const options={cert:fs.readFileSync(certFile),key:fs.readFileSync(keyFile)};
  const caFile=contentPath(tls.caFile||tls.ca_file);
  if(caFile&&fs.existsSync(caFile))options.ca=fs.readFileSync(caFile);
  return options;
}

function redirectTarget(req,c){
  const host=String(req.headers['x-forwarded-host']||req.headers.host||c.hostname||'localhost').replace(/:\d+$/,'');
  return `https://${host}${req.url}`;
}

function cookies(header=''){
  return Object.fromEntries(header.split(';').map(v=>v.trim()).filter(Boolean).map(v=>{
    const i=v.indexOf('=');
    if(i<0)return [decodeURIComponent(v),''];
    return [decodeURIComponent(v.slice(0,i)),decodeURIComponent(v.slice(i+1))];
  }));
}

function appendCookie(res,value){
  const old=res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie',old?[].concat(old,value):value);
}

function clientIp(req){
  return String(req.headers['cf-connecting-ip']||req.headers['x-real-ip']||req.socket.remoteAddress||'');
}

function forwardedFor(req,ip){
  const existing=String(req.headers['x-forwarded-for']||'').trim();
  return existing?`${existing}, ${ip}`:ip;
}

function isValidVisitorId(value){
  return /^[A-Za-z0-9_-]{22,128}$/.test(String(value||''));
}

function visitorCookie(isTls,c){
  const maxAge=Number(c.visitorCookieMaxAgeSeconds||60*60*24*365);
  const secure=isTls||c.visitorCookieSecure===true||c.tls?.enabled===true;
  return [
    `core_visitor=${crypto.randomBytes(32).toString('base64url')}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Number.isFinite(maxAge)&&maxAge>0?Math.trunc(maxAge):60*60*24*365}`,
    secure?'Secure':null
  ].filter(Boolean).join('; ');
}

function ensureVisitor(req,res,isTls,c,incoming,requestId){
  const parsed=cookies(req.headers.cookie);
  let visitorId=parsed.core_visitor;
  const ip=clientIp(req);
  const details={
    requestId,
    clientIp:ip,
    xForwardedFor:String(req.headers['x-forwarded-for']||''),
    userAgent:String(req.headers['user-agent']||''),
    acceptLanguage:String(req.headers['accept-language']||''),
    referer:String(req.headers.referer||req.headers.referrer||''),
    host:String(req.headers.host||''),
    path:incoming.pathname,
    proto:isTls?'https':'http'
  };
  if(isValidVisitorId(visitorId))return {visitorId,isNew:false,details};
  const cookie=visitorCookie(isTls,c);
  visitorId=cookie.match(/^core_visitor=([^;]+)/)?.[1]||crypto.randomUUID();
  appendCookie(res,cookie);
  writeVisitorLog({visitorId,...details});
  return {visitorId,isNew:true,details};
}

function serveAcmeChallenge(req,res,c,incoming){
  if(!incoming.pathname.startsWith('/.well-known/acme-challenge/'))return false;
  const token=incoming.pathname.slice('/.well-known/acme-challenge/'.length);
  if(!/^[A-Za-z0-9_-]+$/.test(token)){
    res.writeHead(404);
    res.end('Not found');
    return true;
  }
  const challengeRoot=contentPath(c.acme?.challengeRoot||'acme/.well-known/acme-challenge');
  const file=path.join(challengeRoot,token);
  if(!file.startsWith(challengeRoot)||!fs.existsSync(file)){
    res.writeHead(404);
    res.end('Not found');
    return true;
  }
  const data=fs.readFileSync(file);
  res.writeHead(200,{'content-type':'text/plain; charset=utf-8','content-length':data.length});
  res.end(data);
  return true;
}

function requestHandler(isTls=false){
  return (req,res)=>{
    const started=Date.now();
    const requestId=req.headers['x-request-id']||crypto.randomUUID();
    let c;
    try{c=config();}catch(e){
      writeLog('error','Invalid Gateway configuration',{error:e.message});
      res.writeHead(503,{'content-type':'application/json'});
      return res.end(JSON.stringify({error:'Gateway configuration unavailable'}));
    }
    const incoming=new URL(req.url,'http://localhost');
    if(incoming.pathname==='/health'){
      res.writeHead(200,{'content-type':'application/json'});
      return res.end(JSON.stringify({status:'ok',application:'core-gateway',https:httpsActive}));
    }
    if(serveAcmeChallenge(req,res,c,incoming))return;
    if(!isTls&&httpsActive&&c.tls&&c.tls.redirectHttpToHttps===true){
      res.writeHead(308,{location:redirectTarget(req,c)});
      return res.end();
    }
    if(isTls&&c.tls&&c.tls.hsts===true){
      res.setHeader('strict-transport-security',c.tls.hstsHeader||'max-age=31536000; includeSubDomains');
    }
    const visitor=ensureVisitor(req,res,isTls,c,incoming,requestId);
    res.on('finish',()=>writeLog('info','request',{requestId,visitorId:visitor.visitorId,visitorNew:visitor.isNew,clientIp:visitor.details.clientIp,xForwardedFor:visitor.details.xForwardedFor,userAgent:visitor.details.userAgent,acceptLanguage:visitor.details.acceptLanguage,referer:visitor.details.referer,host:visitor.details.host,method:req.method,url:req.url,statusCode:res.statusCode,durationMs:Date.now()-started,proto:isTls?'https':'http'}));
    const route=[...c.routes].sort((a,b)=>b.prefix.length-a.prefix.length).find(r=>incoming.pathname===r.prefix||incoming.pathname.startsWith(r.prefix.endsWith('/')?r.prefix:r.prefix+'/')||r.prefix==='/');
    if(!route){
      writeLog('warn','no route',{requestId,method:req.method,url:req.url});
      res.writeHead(404);
      return res.end('No route');
    }
    const target=new URL(route.target);
    let outPath=incoming.pathname+incoming.search;
    if(route.stripPrefix&&route.prefix!=='/'){
      const stripped=incoming.pathname.slice(route.prefix.length)||'/';
      outPath=(stripped.startsWith('/')?stripped:'/'+stripped)+incoming.search;
    }
    const headers={...req.headers,host:target.host,'x-forwarded-host':req.headers.host,'x-forwarded-proto':isTls?'https':'http','x-forwarded-for':forwardedFor(req,visitor.details.clientIp),'x-request-id':requestId,'x-core-visitor-id':visitor.visitorId};
    const p=http.request({hostname:target.hostname,port:target.port||80,path:outPath,method:req.method,headers},pr=>{
      res.writeHead(pr.statusCode,pr.headers);
      pr.pipe(res);
    });
    p.on('error',e=>{
      writeLog('error','target unavailable',{requestId,target:route.target,error:e.message});
      if(!res.headersSent)res.writeHead(502,{'content-type':'application/json'});
      res.end(JSON.stringify({error:'Gateway target unavailable',detail:e.message}));
    });
    req.pipe(p);
  };
}

const c=config();
const tlsOptions=loadTls(c);
const server=http.createServer(requestHandler(false));
server.listen(c.port,'0.0.0.0',()=>writeLog('info','Core Gateway HTTP listening',{port:c.port}));

if(tlsOptions){
  const httpsPort=c.tls.port;
  https.createServer(tlsOptions,requestHandler(true)).listen(httpsPort,'0.0.0.0',()=>{
    httpsActive=true;
    writeLog('info','Core Gateway HTTPS listening',{port:httpsPort});
  });
}
