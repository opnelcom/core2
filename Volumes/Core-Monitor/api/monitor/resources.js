'use strict';
const os=require('os');

function cpuSnapshot(){
  const cpus=os.cpus();
  const totals=cpus.map(cpu=>{
    const times=cpu.times;
    const idle=times.idle;
    const total=Object.values(times).reduce((sum,value)=>sum+value,0);
    return {idle,total};
  });
  const idle=totals.reduce((sum,cpu)=>sum+cpu.idle,0);
  const total=totals.reduce((sum,cpu)=>sum+cpu.total,0);
  return {idle,total};
}

function cpuUsageBetween(start,end){
  const idle=end.idle-start.idle;
  const total=end.total-start.total;
  if(total<=0)return 0;
  return Math.max(0,Math.min(100,(1-idle/total)*100));
}

function bytes(value){
  return Number.isFinite(value)?value:0;
}

module.exports=async ctx=>{
  const a=ctx.auth();
  if(!a||a.user_type!=='administration_user')return ctx.send(403,{error:'Core administrator required'});

  const cpuStart=cpuSnapshot();
  const processCpuStart=process.cpuUsage();
  const started=process.hrtime.bigint();
  await new Promise(resolve=>setTimeout(resolve,250));
  const cpuEnd=cpuSnapshot();
  const processCpuEnd=process.cpuUsage(processCpuStart);
  const elapsedMicros=Number(process.hrtime.bigint()-started)/1000;
  const processCpuMicros=processCpuEnd.user+processCpuEnd.system;
  const cores=os.cpus().length||1;
  const processCpuPercent=Math.max(0,Math.min(100,(processCpuMicros/(elapsedMicros*cores))*100));

  const totalMemory=bytes(os.totalmem());
  const freeMemory=bytes(os.freemem());
  const usedMemory=Math.max(0,totalMemory-freeMemory);
  const processMemory=process.memoryUsage();

  return {
    checked_at:new Date().toISOString(),
    host:{
      hostname:os.hostname(),
      platform:os.platform(),
      release:os.release(),
      uptime_seconds:Math.round(os.uptime()),
      cpu:{
        model:os.cpus()[0]?.model||'unknown',
        cores,
        utilization_percent:Number(cpuUsageBetween(cpuStart,cpuEnd).toFixed(2)),
        load_average:os.loadavg()
      },
      memory:{
        total_bytes:totalMemory,
        free_bytes:freeMemory,
        used_bytes:usedMemory,
        utilization_percent:totalMemory?Number((usedMemory/totalMemory*100).toFixed(2)):0
      }
    },
    process:{
      pid:process.pid,
      uptime_seconds:Number(process.uptime().toFixed(2)),
      cpu:{
        utilization_percent:Number(processCpuPercent.toFixed(2)),
        user_microseconds:processCpuEnd.user,
        system_microseconds:processCpuEnd.system
      },
      memory:{
        rss_bytes:processMemory.rss,
        heap_total_bytes:processMemory.heapTotal,
        heap_used_bytes:processMemory.heapUsed,
        external_bytes:processMemory.external,
        array_buffers_bytes:processMemory.arrayBuffers
      }
    }
  };
};
