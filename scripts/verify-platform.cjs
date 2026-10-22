'use strict';
const fs=require('node:fs'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const {createRequire}=require('node:module');
const {createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..');
const components=require('../deployment/components.json');
const {readConfig}=require('../Applications/Core-Runtime/config');
let failures=0;
function check(label,fn){try{fn();console.log('PASS '+label);}catch(e){failures++;console.error('FAIL '+label+': '+e.message);}}
for(const c of components){
  const dir=path.join(root,'Volumes',c.folder);
  check(c.folder+' configuration',()=>{
    const cfg=readConfig(path.join(dir,'config','config.json'));
    if(c.identity){
      if(!['http:','https:'].includes(new URL(cfg.identity?.url).protocol))throw Error('identity.url must be configured');
      if('sessionSecret' in cfg)throw Error('Signing secret must belong only to SaaS');
    }
    if(c.folder==='Core-SaaS'){
      if(!cfg.sessionSecret||cfg.sessionSecret==='change-me')throw Error('Configure a secure SaaS session secret');
    }
    for(const key of ['dbBrokerURL','smtpUrl'])if(cfg[key]&&!['http:','https:'].includes(new URL(cfg[key]).protocol))throw Error('Invalid '+key);
  });
  check(c.folder+' dependencies',()=>{
    const requireApp=createRequire(path.join(dir,'package.json'));
    for(const dep of c.dependencies)requireApp.resolve(dep);
    if(c.dependencies.length&&!fs.existsSync(path.join(dir,'package-lock.json')))throw Error('Missing lockfile');
    if(c.dependencies.length){
      const lock=JSON.parse(fs.readFileSync(path.join(dir,'package-lock.json'),'utf8'));
      for(const entry of Object.values(lock.packages))if(entry.resolved?.startsWith('file:')){
        const archive=fs.readFileSync(path.join(dir,entry.resolved.slice(5)));
        if(entry.integrity!=='sha512-'+createHash('sha512').update(archive).digest('base64'))throw Error('Release archive does not match lockfile');
      }
    }
    if(!fs.statSync(path.join(dir,'logs')).isDirectory())throw Error('Missing logs mount point');
  });
  if(process.argv.includes('--live'))check(c.service+' live health and anonymous access',()=>{
    const code=`(async()=>{
      const fs=require('fs');const cfg=JSON.parse(fs.readFileSync('/app/content/config/config.json','utf8'));
      const base='http://127.0.0.1:'+cfg.port;
      const health=await fetch(base+'/health',{signal:AbortSignal.timeout(10000)});
      if(health.status!==200)throw Error('Health returned '+health.status);
      for(const dep of ${JSON.stringify(c.dependencies)})require.resolve(dep,{paths:['/app/content']});
      fs.accessSync('/app/content/logs',fs.constants.W_OK);
      ${c.probe?`const denied=await fetch(base+${JSON.stringify(c.probe)},{headers:{cookie:'core_session=invalid; current_tenant=00000000-0000-0000-0000-000000000000'},signal:AbortSignal.timeout(15000)});
      if(denied.status!==${c.denied})throw Error('Anonymous access returned '+denied.status+'; expected ${c.denied}');`:''}
    })().catch(e=>{console.error(e.message);process.exitCode=1});`;
    const result=spawnSync('docker',['compose','exec','-T',c.service,'node','-e',code],{cwd:root,encoding:'utf8',timeout:45000});
    if(result.error)throw result.error;
    if(result.status!==0)throw Error((result.stderr||result.stdout||'Container check failed').trim());
  });
}
if(failures)process.exitCode=1;
console.log(failures?'Verification failed: '+failures+' checks':'Verification passed'+(process.argv.includes('--live')?' (including container checks)':' (local checks only; use --live after deployment)'));
