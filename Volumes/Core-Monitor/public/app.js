(()=>{
const $=id=>document.getElementById(id);
let latestStatus=null;
let latestResources=null;
let latestBrokerProfiles=null;
let currentView='containers';
let refreshTimer=null;

function panelTransparencyValue(value){
  const number=Number(value);
  if(!Number.isFinite(number))return 0;
  return Math.max(0,Math.min(100,Math.round(number)));
}

function setPanelGlass(enabled,transparency=enabled?60:0){
  const amount=enabled?panelTransparencyValue(transparency):0;
  document.body.classList.toggle('panels-glass',amount>0);
  document.body.style.setProperty('--panel-glass-alpha',String(1-(amount/100)));
}

const panelGlassParams=new URLSearchParams(location.search);
setPanelGlass(panelGlassParams.get('panel_glass')==='1',panelGlassParams.get('panel_transparency')||60);
window.addEventListener('message',event=>{
  if(event.origin!==location.origin)return;
  if(event.data&&event.data.type==='core-saas-panel-glass'){
    setPanelGlass(event.data.enabled,event.data.transparency);
  }
});

const views={
  containers:{title:'Docker containers',eyebrow:'Runtime'},
  resources:{title:'OS resources',eyebrow:'Host utilisation'},
  databases:{title:'Database connections',eyebrow:'Data'}
};

function setAlert(message){
  const alert=$('alert');
  alert.hidden=!message;
  alert.textContent=message||'';
}

function formatTime(value){
  if(!value)return '-';
  const d=new Date(value);
  if(Number.isNaN(d.getTime()))return String(value);
  return d.toLocaleString();
}

function formatBytes(bytes){
  const value=Number(bytes)||0;
  const units=['B','KB','MB','GB','TB'];
  let size=value;
  let unit=0;
  while(size>=1024&&unit<units.length-1){
    size/=1024;
    unit++;
  }
  return `${size.toFixed(unit?1:0)} ${units[unit]}`;
}

function formatPercent(value){
  const number=Number(value);
  return Number.isFinite(number)?`${number.toFixed(number>=10?1:2)}%`:'-';
}

function containerStats(status,container){
  return (status.stats||{})[container.id]||{};
}

function statValue(stats,path){
  return path.reduce((value,key)=>value&&value[key],stats)||0;
}

function maxMetric(containers,status,path){
  return containers.reduce((max,container)=>{
    const stats=containerStats(status,container);
    return Math.max(max,Number(statValue(stats,path))||0);
  },0);
}

function appendTextCell(row,value,className=''){
  const td=document.createElement('td');
  if(className)td.className=className;
  td.textContent=value;
  row.append(td);
  return td;
}

function appendHtmlCell(row,html,className=''){
  const td=document.createElement('td');
  if(className)td.className=className;
  td.innerHTML=html;
  row.append(td);
  return td;
}

function appendMetricCell(row,{value,max,format,kind,error}){
  const td=document.createElement('td');
  td.className=`metric-table-cell ${kind||''}`.trim();
  const valueEl=document.createElement('span');
  valueEl.className='metric-value';
  valueEl.textContent=error?error:format(value);
  const track=document.createElement('span');
  track.className='horizon-track';
  const fill=document.createElement('span');
  fill.className='horizon-fill';
  const width=max>0&&!error?Math.max(2,Math.min(100,(Number(value)||0)/max*100)):0;
  fill.style.width=`${width}%`;
  track.append(fill);
  td.append(valueEl,track);
  row.append(td);
  return td;
}

function serviceLabel(name){
  return name.replace(/^core-/,'Core ').replaceAll('-',' ');
}

function setHeader(){
  const view=views[currentView];
  $('view-title').textContent=view.title;
  $('view-eyebrow').textContent=view.eyebrow;
  document.querySelectorAll('.nav-button').forEach(button=>{
    button.classList.toggle('active',button.dataset.view===currentView);
  });
}

function setSummary(labelOne,valueOne,labelTwo,valueTwo,checkedAt){
  $('summary-one-label').textContent=labelOne;
  $('summary-one').textContent=valueOne;
  $('summary-two-label').textContent=labelTwo;
  $('summary-two').textContent=valueTwo;
  $('checked-at').textContent=formatTime(checkedAt);
}

function statusCard(title,detail,ok){
  const card=document.createElement('article');
  card.className='status-card';

  const dot=document.createElement('span');
  dot.className='status-dot';
  dot.classList.toggle('ok',ok===true);

  const copy=document.createElement('span');
  copy.className='status-copy';
  const name=document.createElement('strong');
  name.textContent=title;
  const small=document.createElement('small');
  small.textContent=detail;
  copy.append(name,small);
  card.append(dot,copy);
  return card;
}

function metricCard(label,value,detail){
  const card=document.createElement('article');
  card.className='metric-card';
  const labelEl=document.createElement('span');
  labelEl.textContent=label;
  const valueEl=document.createElement('strong');
  valueEl.textContent=value;
  const detailEl=document.createElement('small');
  detailEl.textContent=detail;
  card.append(labelEl,valueEl,detailEl);
  return card;
}

function renderContainers(status){
  const containers=(Array.isArray(status.containers)?status.containers:[])
    .slice()
    .sort((a,b)=>String(a?.name||'').localeCompare(String(b?.name||''),undefined,{numeric:true,sensitivity:'base'}));
  const ok=containers.filter(container=>container&&container.ok).length;
  const totalMemory=Object.values(status.stats||{}).reduce((sum,stats)=>sum+(stats.memory?.usage_bytes||0),0);
  const totalCpu=Object.values(status.stats||{}).reduce((sum,stats)=>sum+(stats.cpu?.utilization_percent||0),0);
  setSummary('Containers',`${ok}/${containers.length} online`,'Docker usage',`${formatPercent(totalCpu)} / ${formatBytes(totalMemory)}`,status.checked_at);

  const root=$('view-root');
  root.innerHTML=`<div class="view-stack">
    <section class="panel">
      <div class="panel-heading"><div><p class="eyebrow">Services</p><h2>Core services</h2></div></div>
      <div id="service-grid" class="service-grid"></div>
    </section>
    <section class="panel">
      <div class="panel-heading"><div><p class="eyebrow">Runtime</p><h2>Docker containers</h2></div></div>
      <div id="container-table-wrap" class="table-wrap"></div>
    </section>
  </div>`;
  const serviceGrid=$('service-grid');
  const services=Object.entries(status.services||{}).filter(([name])=>name!=='databases');
  if(!services.length){
    const empty=document.createElement('p');
    empty.className='empty-state';
    empty.textContent='No service health checks returned.';
    serviceGrid.append(empty);
  }else{
    services.forEach(([name,value])=>{
      serviceGrid.append(statusCard(
        serviceLabel(name),
        value?.ok?`HTTP ${value.status||200}`:value?.error||'Unavailable',
        value&&value.ok
      ));
    });
  }
  const wrap=$('container-table-wrap');
  if(!status.docker?.ok){
    const empty=document.createElement('p');
    empty.className='empty-state';
    empty.textContent=status.docker?.error||'Docker socket is not available.';
    wrap.append(empty);
    return;
  }
  if(!containers.length){
    const empty=document.createElement('p');
    empty.className='empty-state';
    empty.textContent='No Docker containers returned from this Docker host.';
    wrap.append(empty);
    return;
  }
  const table=document.createElement('table');
  table.className='container-table';
  table.innerHTML='<thead><tr><th>Name</th><th>Service</th><th>CPU</th><th>Memory</th><th>Net in</th><th>Net out</th><th>Disk read</th><th>Disk write</th><th>State</th><th>Health</th><th>Status</th><th>Container ID</th></tr></thead>';
  const body=document.createElement('tbody');
  const maxima={
    cpu:maxMetric(containers,status,['cpu','utilization_percent']),
    memory:maxMetric(containers,status,['memory','usage_bytes']),
    netIn:maxMetric(containers,status,['network','rx_bytes']),
    netOut:maxMetric(containers,status,['network','tx_bytes']),
    diskRead:maxMetric(containers,status,['block_io','read_bytes']),
    diskWrite:maxMetric(containers,status,['block_io','write_bytes'])
  };
  containers.forEach(container=>{
    const tr=document.createElement('tr');
    const stateClass=container.ok?'ok':'bad';
    const stats=containerStats(status,container);
    const error=stats.error?'stats unavailable':'';
    appendTextCell(tr,container.name||'-','container-name-cell');
    appendTextCell(tr,container.service||'-');
    appendMetricCell(tr,{value:statValue(stats,['cpu','utilization_percent']),max:maxima.cpu,format:formatPercent,kind:'cpu',error});
    appendMetricCell(tr,{value:statValue(stats,['memory','usage_bytes']),max:maxima.memory,format:formatBytes,kind:'memory',error});
    appendMetricCell(tr,{value:statValue(stats,['network','rx_bytes']),max:maxima.netIn,format:formatBytes,kind:'network',error});
    appendMetricCell(tr,{value:statValue(stats,['network','tx_bytes']),max:maxima.netOut,format:formatBytes,kind:'network',error});
    appendMetricCell(tr,{value:statValue(stats,['block_io','read_bytes']),max:maxima.diskRead,format:formatBytes,kind:'disk',error});
    appendMetricCell(tr,{value:statValue(stats,['block_io','write_bytes']),max:maxima.diskWrite,format:formatBytes,kind:'disk',error});
    appendHtmlCell(tr,`<span class="state-pill ${stateClass}">${container.state||'-'}</span>`);
    appendTextCell(tr,container.health&&container.health!=='none'?container.health:'-');
    appendTextCell(tr,container.status||'-','container-status-cell');
    appendTextCell(tr,container.id||'-','container-id-cell');
    body.append(tr);
  });
  table.append(body);
  wrap.append(table);
}

function renderDatabases(status,brokerProfiles){
  const dbs=status.services?.databases?.databases||{};
  const values=Object.values(dbs);
  const ok=values.filter(value=>value&&value.ok).length;
  const profiles=brokerProfiles?.profiles||[];
  const waiting=profiles.reduce((sum,profile)=>sum+(profile.pool?.waiting_count||0),0);
  setSummary('Connections',`${ok}/${values.length} online`,'Pool waiting',String(waiting),brokerProfiles?.checked_at||status.checked_at);

  const root=$('view-root');
  root.innerHTML=`<div class="view-stack">
    <section class="panel">
      <div class="panel-heading"><div><p class="eyebrow">Broker</p><h2>DB broker profiles</h2></div></div>
      <div id="profile-grid" class="profile-grid"></div>
    </section>
    <section class="panel">
      <div class="panel-heading"><div><p class="eyebrow">Data</p><h2>Database connections</h2></div></div>
      <div id="database-grid" class="database-grid"></div>
    </section>
  </div>`;

  const profileGrid=$('profile-grid');
  if(!profiles.length){
    const empty=document.createElement('p');
    empty.className='empty-state';
    empty.textContent='No broker profile stats returned.';
    profileGrid.append(empty);
  }else{
    profiles.forEach(profile=>{
      const pool=profile.pool||{};
      const stats=profile.stats||{};
      const detail=`pool ${pool.total_count||0}/${pool.max||0} - idle ${pool.idle_count||0} - waiting ${pool.waiting_count||0}`;
      const card=statusCard(profile.name||'Unnamed profile',detail,profile.configured===true);
      const meta=document.createElement('span');
      meta.className='profile-stats';
      meta.textContent=`queries ${stats.query_completed||0}/${stats.query_requests||0} - tx ${stats.transaction_completed||0}/${stats.transaction_requests||0}`;
      card.querySelector('.status-copy').append(meta);
      profileGrid.append(card);
    });
  }

  const grid=$('database-grid');
  if(!Object.keys(dbs).length){
    const empty=document.createElement('p');
    empty.className='empty-state';
    empty.textContent=status.services?.databases?.error||'No database status returned.';
    grid.append(empty);
  }else{
    Object.entries(dbs).forEach(([name,value])=>{
      const detail=value&&value.ok
        ? `${value.database} - ${value.latency_ms} ms`
        : value?.error||'Unavailable';
      grid.append(statusCard(name,detail,value&&value.ok));
    });
  }
}

function renderResources(resources){
  const cpu=resources.host?.cpu||{};
  const memory=resources.host?.memory||{};
  const proc=resources.process||{};
  setSummary('CPU',`${cpu.utilization_percent??0}%`,'Memory',`${memory.utilization_percent??0}%`,resources.checked_at);

  const root=$('view-root');
  root.innerHTML=`<section class="panel">
    <div class="panel-heading"><div><p class="eyebrow">Host</p><h2>OS resources</h2></div></div>
    <div class="metric-grid" id="resource-grid"></div>
  </section>`;
  const grid=$('resource-grid');
  grid.append(
    metricCard('Host CPU',`${cpu.utilization_percent??0}%`,`${cpu.cores||0} cores - load ${(cpu.load_average||[]).map(x=>Number(x).toFixed(2)).join(', ')}`),
    metricCard('Host memory',`${memory.utilization_percent??0}%`,`${formatBytes(memory.used_bytes)} used of ${formatBytes(memory.total_bytes)}`),
    metricCard('Monitor CPU',`${proc.cpu?.utilization_percent??0}%`,`PID ${proc.pid||'-'} - uptime ${proc.uptime_seconds||0}s`),
    metricCard('Monitor memory',formatBytes(proc.memory?.rss_bytes),`Heap ${formatBytes(proc.memory?.heap_used_bytes)} of ${formatBytes(proc.memory?.heap_total_bytes)}`),
    metricCard('Host uptime',`${resources.host?.uptime_seconds||0}s`,`${resources.host?.platform||'-'} ${resources.host?.release||''}`)
  );
}

async function fetchJson(path){
  const r=await fetch(path);
  const j=await r.json();
  if(!r.ok)throw new Error(j.error||'Monitor request failed');
  return j;
}

async function ensureStatus(){
  latestStatus=await fetchJson('/monitor/api/monitor/status');
  return latestStatus;
}

async function ensureResources(){
  latestResources=await fetchJson('/monitor/api/monitor/resources');
  return latestResources;
}

async function ensureBrokerProfiles(){
  latestBrokerProfiles=await fetchJson('/monitor/api/monitor/brokerprofiles');
  return latestBrokerProfiles;
}

async function load(){
  setHeader();
  setAlert('');
  try{
    if(currentView==='resources'){
      renderResources(await ensureResources());
    }else if(currentView==='databases'){
      const [status,brokerProfiles]=await Promise.all([ensureStatus(),ensureBrokerProfiles()]);
      renderDatabases(status,brokerProfiles);
    }else{
      renderContainers(await ensureStatus());
    }
  }catch(e){
    setAlert(e.message);
    setSummary('Status','-','Attention','-','-');
  }
}

function setAutoRefresh(){
  if(refreshTimer)clearInterval(refreshTimer);
  refreshTimer=null;
  if($('auto-refresh').checked)refreshTimer=setInterval(load,30000);
}

document.querySelectorAll('.nav-button').forEach(button=>{
  button.addEventListener('click',()=>{
    currentView=button.dataset.view;
    load();
  });
});
$('refresh-button').addEventListener('click',load);
$('auto-refresh').addEventListener('change',setAutoRefresh);
setAutoRefresh();
load();
})();
