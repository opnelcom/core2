const http=require('http');

function dockerRequest(path){
  return new Promise((resolve,reject)=>{
    const req=http.request({
      socketPath:'/var/run/docker.sock',
      path,
      method:'GET',
      timeout:3000
    },res=>{
      const chunks=[];
      res.on('data',chunk=>chunks.push(chunk));
      res.on('end',()=>{
        const raw=Buffer.concat(chunks).toString('utf8');
        let body=null;
        try{body=raw?JSON.parse(raw):null;}catch{body=raw;}
        if(res.statusCode<200||res.statusCode>=300){
          const message=body&&body.message?body.message:`Docker API returned HTTP ${res.statusCode}`;
          reject(Object.assign(new Error(message),{status:res.statusCode,details:body}));
          return;
        }
        resolve(body);
      });
    });
    req.on('timeout',()=>req.destroy(new Error('Docker API request timed out')));
    req.on('error',reject);
    req.end();
  });
}

function dockerErrorMessage(error){
  if(error&&error.code==='ENOENT'){
    return 'Docker socket is not mounted inside core-monitor. Recreate core-monitor so /var/run/docker.sock is mounted.';
  }
  if(error&&error.code==='EACCES'){
    return 'core-monitor cannot access /var/run/docker.sock. Check Docker socket permissions on the host.';
  }
  return error&&error.message?error.message:'Docker API request failed';
}

function dockerHealth(status){
  const match=String(status||'').match(/\(([^)]+)\)/);
  return match?match[1]:'none';
}

function containerName(container){
  const names=Array.isArray(container.Names)?container.Names:[];
  return (names[0]||'').replace(/^\/+/,'')||container.Id?.slice(0,12)||'unknown';
}

function containerRecord(container){
  const labels=container.Labels||{};
  const service=labels['com.docker.compose.service']||containerName(container);
  const health=dockerHealth(container.Status);
  const state=container.State||'unknown';
  return {
    id:String(container.Id||'').slice(0,12),
    full_id:String(container.Id||''),
    name:containerName(container),
    service,
    project:labels['com.docker.compose.project']||null,
    image:container.Image,
    state,
    health,
    status:container.Status||state,
    created_at:container.Created?new Date(container.Created*1000).toISOString():null,
    ok:state==='running'&&health!=='unhealthy'
  };
}

async function dockerContainers(){
  const containers=await dockerRequest('/containers/json?all=true');
  return (Array.isArray(containers)?containers:[]).map(containerRecord);
}

function round(value,digits=2){
  const factor=10**digits;
  return Math.round((Number(value)||0)*factor)/factor;
}

function memoryStats(stats){
  const memory=stats.memory_stats||{};
  const rawUsage=Number(memory.usage)||0;
  const limit=Number(memory.limit)||0;
  const dockerCache=Number(memory.stats?.cache)||0;
  const inactiveFile=Number(memory.stats?.inactive_file)||0;
  const cache=inactiveFile||dockerCache;
  const usage=Math.max(0,rawUsage-cache);
  return {
    usage_bytes:usage,
    raw_usage_bytes:rawUsage,
    limit_bytes:limit,
    utilization_percent:limit>0?round((usage/limit)*100):0
  };
}

function cpuStats(stats){
  const cpu=stats.cpu_stats||{};
  const precpu=stats.precpu_stats||{};
  const cpuDelta=(Number(cpu.cpu_usage?.total_usage)||0)-(Number(precpu.cpu_usage?.total_usage)||0);
  const systemDelta=(Number(cpu.system_cpu_usage)||0)-(Number(precpu.system_cpu_usage)||0);
  const onlineCpus=Number(cpu.online_cpus)||(Array.isArray(cpu.cpu_usage?.percpu_usage)?cpu.cpu_usage.percpu_usage.length:0)||1;
  const percent=cpuDelta>0&&systemDelta>0?(cpuDelta/systemDelta)*onlineCpus*100:0;
  return {
    utilization_percent:round(percent),
    online_cpus:onlineCpus
  };
}

function networkStats(stats){
  const networks=stats.networks||{};
  return Object.values(networks).reduce((total,network)=>({
    rx_bytes:total.rx_bytes+(Number(network.rx_bytes)||0),
    tx_bytes:total.tx_bytes+(Number(network.tx_bytes)||0)
  }),{rx_bytes:0,tx_bytes:0});
}

function blockIoStats(stats){
  const entries=stats.blkio_stats?.io_service_bytes_recursive||[];
  return (Array.isArray(entries)?entries:[]).reduce((total,entry)=>{
    const op=String(entry.op||'').toLowerCase();
    const value=Number(entry.value)||0;
    if(op==='read')total.read_bytes+=value;
    if(op==='write')total.write_bytes+=value;
    return total;
  },{read_bytes:0,write_bytes:0});
}

function dockerStatsRecord(stats){
  return {
    read_at:new Date().toISOString(),
    cpu:cpuStats(stats),
    memory:memoryStats(stats),
    network:networkStats(stats),
    block_io:blockIoStats(stats),
    pids_current:Number(stats.pids_stats?.current)||0
  };
}

async function dockerContainerStats(containers){
  const running=containers.filter(container=>container.state==='running');
  const results=await Promise.all(running.map(async container=>{
    try{
      const stats=await dockerRequest(`/containers/${container.full_id||container.id}/stats?stream=false`);
      return [container.id,dockerStatsRecord(stats)];
    }catch(e){
      return [container.id,{error:dockerErrorMessage(e)}];
    }
  }));
  return Object.fromEntries(results);
}

async function serviceHealth(){
  const services=['core-saas','core-admin','core-monitor','core-erp','core-objectsphere','core-broker','core-smtp','core-gateway'];
  const results={};
  for(const s of services){
    try{
      const r=await fetch(`http://${s}:3000/health`);
      results[s]={ok:r.ok,status:r.status,body:await r.json()};
    }catch(e){
      results[s]={ok:false,error:e.message};
    }
  }
  return results;
}

module.exports=async ctx=>{
  const a=ctx.auth();
  if(!a||a.user_type!=='administration_user')return ctx.send(403,{error:'Core administrator required'});

  const results=await serviceHealth();
  let containers=[];
  let stats={};
  let docker=null;
  try{
    containers=await dockerContainers();
    stats=await dockerContainerStats(containers);
    docker={ok:true,socket:'/var/run/docker.sock',scope:'host'};
  }catch(e){
    docker={ok:false,error:dockerErrorMessage(e),socket:'/var/run/docker.sock',scope:'host'};
  }

  try{
    const profiles=['core_saas','core_erp','core_objectsphere'];
    const dbs={};
    for(const p of profiles)dbs[p]=await ctx.broker(p,'status');
    results.databases=dbs;
  }catch(e){
    results.databases={ok:false,error:e.message};
  }

  return {
    checked_at:new Date().toISOString(),
    docker,
    containers,
    stats,
    services:results
  };
};
