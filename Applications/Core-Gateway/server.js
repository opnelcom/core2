'use strict';
const http=require('http'),https=require('https'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=process.env.CONTENT_ROOT||'/app/content';
const logRoot=process.env.LOG_ROOT||'/app/logs';
function config(){try{return JSON.parse(fs.readFileSync(path.join(root,'config','gateway.json'),'utf8'));}catch{return {routes:[{prefix:'/',target:'http://core-saas:3000'}]};}}
function dailyLogFile(appName){const safeName=String(appName||'core-gateway').replace(/[^A-Za-z0-9._-]/g,'-');const day=new Date().toISOString().slice(0,10);return `${safeName}-${day}.log`;}
function writeLog(level,msg,meta={}){const entry={ts:new Date().toISOString(),level,app:'core-gateway',msg,...meta};const line=JSON.stringify(entry);console.log(line);try{fs.mkdirSync(logRoot,{recursive:true});fs.appendFileSync(path.join(logRoot,dailyLogFile('core-gateway')),line+'\n');}catch{}}
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
    writeLog('warn','TLS certificate files not found',{certFile,keyFile});
    return null;
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
    res.on('finish',()=>writeLog('info','request',{requestId,method:req.method,url:req.url,statusCode:res.statusCode,durationMs:Date.now()-started,proto:isTls?'https':'http'}));
    const c=config();
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
    const headers={...req.headers,host:target.host,'x-forwarded-host':req.headers.host,'x-forwarded-proto':isTls?'https':'http','x-request-id':requestId};
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
const server=http.createServer(requestHandler(false));
server.listen(Number(process.env.PORT||c.port||3000),'0.0.0.0',()=>writeLog('info','Core Gateway HTTP listening',{port:Number(process.env.PORT||c.port||3000)}));

const tlsOptions=loadTls(c);
if(tlsOptions){
  const httpsPort=Number(process.env.HTTPS_PORT||c.tls?.port||3443);
  https.createServer(tlsOptions,requestHandler(true)).listen(httpsPort,'0.0.0.0',()=>{
    httpsActive=true;
    writeLog('info','Core Gateway HTTPS listening',{port:httpsPort});
  });
}
