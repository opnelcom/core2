"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {statusGroups, render, setStatusFilter} = require("../public/object-grid-views");

const statuses = [
  {status_code:"draft", status_label:"Draft", colour:"#2563eb"},
  {status_code:"active", status_label:"Active", colour:"#067647"},
  {status_code:"blocked", status_label:"Blocked", colour:"#b42318"},
];
const steps = [
  {workflow_path_id:"a", step_code:"draft", sort_order:10},
  {workflow_path_id:"a", step_code:"active", sort_order:30},
  {workflow_path_id:"b", step_code:"active", sort_order:5},
  {workflow_path_id:"unrelated", step_code:"draft", sort_order:-10},
];
const options = {statuses, steps, workflowPath:row=>row.path};

test("mixed workflows group by status code and use the lowest applicable workflow sort", () => {
  const rows = [{workflow_status:"active",path:"a"},
    {workflow_status:"draft",path:"a"},{workflow_status:"active",path:"b"}];
  const groups = statusGroups(rows, options);
  assert.deepEqual(groups.map(g=>[g.code,g.sort,g.rows.length]), [["active",5,2],["draft",10,1]]);
  assert.equal(groups[0].colour, "#067647");
  assert.deepEqual(groups[0].rows, [rows[0],rows[2]]);
});
test("filtered records produce populated columns only and preserve catalogue labels", () => {
  const groups = statusGroups([{workflow_status:"active",path:"a",workflow_step_label:"Old label"}], options);
  assert.deepEqual(groups.map(g=>g.label), ["Active"]);
  assert.equal(groups[0].sort,30);
  assert.deepEqual(statusGroups([],options), []);
});
test("equal sort numbers break ties by label and missing workflow metadata keeps records visible", () => {
  const groups = statusGroups([{workflow_status:"draft",path:"a"},
    {workflow_status:"active",path:"a"},{workflow_status:"custom",workflow_step_label:"Custom"},{}],
    {...options,steps:steps.map(s=>({...s,sort_order:10}))});
  assert.deepEqual(groups.map(g=>g.label),["Active","Draft","Custom","No status"]);
});

class Element {
  constructor(tag) {
    this.tag=tag;this.children=[];this.value="";this.listeners={};this.attributes={};
    this.classList={add(){},remove(){},contains(){return false;}};this.style={setProperty(){}};
  }
  append(...children){this.children.push(...children);}
  prepend(child){this.children.unshift(child);}
  replaceChildren(...children){this.children=children;}
  setAttribute(key,value){this.attributes[key]=value;}
  addEventListener(type,callback){this.listeners[type]=callback;}
  before(child){(this.beforeChildren ||= []).push(child);}
  remove(){this.removed=true;}
  closest(){return null;}
}

test('dashboard status filter is removable, reveals an explicitly selected hidden status and resets between contexts',()=>{
  const original=global.document, visibility=global.erpWorkflowGridVisibility;
  global.document={createElement:tag=>new Element(tag),createTextNode:text=>({textContent:text})};
  global.erpWorkflowGridVisibility=require('../public/workflow-grid-visibility');
  try{
    const target=new Element('div'),toolbar=new Element('div');
    const rows=[{workflow_status:'hidden'},{workflow_status:'active'}];let shown;
    const config={target,toolbar,enabled:false,rows,contextKey:'org:type',columns:[],statuses:[{status_code:'hidden',displayed:false}],table:(t,c,r)=>{shown=r;}};
    render(config);assert.deepEqual(shown,[rows[1]]);
    setStatusFilter(target,{contextKey:'org:type',status_code:'hidden',status_label:'Retirement pending'});
    render(config);assert.deepEqual(shown,[rows[0]]);
    const label=target.beforeChildren.find(el=>el.className==='dashboard-status-filter');
    assert.equal(label.children[0].textContent,'Workflow status: Retirement pending');
    label.children[1].listeners.click();assert.deepEqual(shown,[rows[1]]);assert.equal(label.removed,true);
    setStatusFilter(target,{contextKey:'org:type',status_code:'hidden',status_label:'Retirement pending'});
    render({...config,contextKey:'org:other-type'});assert.deepEqual(shown,[rows[1]]);
  }finally{global.document=original;global.erpWorkflowGridVisibility=visibility;}
});
test("view switching retains table inputs, opens the original record and retains workflow actions", () => {
  const original=global.document;
  global.document={createElement:tag=>new Element(tag),createTextNode:text=>({textContent:text})};
  try {
    const target=new Element("div"),toolbar=new Element("div");
    const row={workflow_status:"active",path:"a",code:"<code>",name:"Contract"};
    const action=new Element("workflow-action");
    let calls=0,opened,closed=0;
    const config={target,toolbar,columns:["original"],rows:[row],...options,
      code:r=>r.code,name:r=>r.name,onOpen:r=>{opened=r;},
      workflowButton:r=>{assert.equal(r,row);return action;},
      beforeChange:()=>{closed++;},
      table:(t,c,r)=>{calls++;assert.equal(t,target);assert.equal(c,config.columns);assert.equal(r,config.rows);}};
    render(config);
    assert.equal(calls,1);
    const [columnar,status]=toolbar.children[0].children;
    assert.deepEqual([columnar,status].map(b=>b.attributes['aria-label']),["Columnar","Status"]);
    const selected=()=>status.attributes['aria-pressed']==='true'?'Status':'Columnar';
    assert.equal(selected(),"Columnar");
    assert.equal(columnar.attributes['aria-pressed'],'true');
    status.listeners.click();
    assert.equal(selected(),"Status");
    assert.equal(columnar.attributes['aria-pressed'],'false');
    status.listeners.click();assert.equal(closed,1);
    const tile=target.children[0].children[0].children[1];
    assert.equal(tile.children[1],action);
    assert.equal(tile.children[0].textContent,"<code> - Contract");
    tile.children[0].listeners.click();assert.equal(opened,row);
    render({...config,tileValue:()=>"Value (ZAR): -123.45"});
    const valuedTile=target.children[0].children[0].children[1];
    assert.equal(valuedTile.children[1].textContent,"Value (ZAR): -123.45");
    assert.equal(valuedTile.children[2],action);
    render({...config,tileDescription:()=>"First line\n<script>plain text</script>",tileValue:()=>"Value (ZAR): 123.45"});
    const describedTile=target.children[0].children[0].children[1];
    assert.equal(describedTile.children[1].className,"object-status-description");
    assert.equal(describedTile.children[1].textContent,"First line\n<script>plain text</script>");
    assert.equal(describedTile.children[2].textContent,"Value (ZAR): 123.45");
    assert.equal(describedTile.children[3],action);
    render({...config,tileDescription:()=>""});
    assert.equal(target.children[0].children[0].children[1].children.length,2);
    render({...config,rows:[]});assert.equal(target.children[0].className,"empty");
    render({...config,enabled:false});assert.equal(toolbar.children[0].hidden,true);
    render(config);assert.equal(calls,3);assert.equal(closed,1);
    assert.equal(toolbar.children.length,1);
    const typed = {...config,contextKey:"org:type-a",defaultView:"status"};
    render(typed);assert.equal(selected(),"Status");
    columnar.listeners.click();
    render({...typed,rows:config.rows});assert.equal(selected(),"Columnar");
    render({...typed,contextKey:"org:type-b",defaultView:"columnar"});assert.equal(selected(),"Columnar");
    render(typed);assert.equal(selected(),"Status");
    render({...typed,defaultView:"columnar"});assert.equal(selected(),"Columnar");
  } finally {global.document=original;}
});
