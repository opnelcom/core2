"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {statusGroups, render} = require("../public/object-grid-views");

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
    this.classList={add(){},remove(){}};this.style={setProperty(){}};
  }
  append(...children){this.children.push(...children);}
  prepend(child){this.children.unshift(child);}
  replaceChildren(...children){this.children=children;}
  setAttribute(key,value){this.attributes[key]=value;}
  addEventListener(type,callback){this.listeners[type]=callback;}
}
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
    const select=toolbar.children[0].children[1];
    assert.deepEqual(select.children.map(o=>o.value),["Columnar","Status"]);
    select.value="Status";select.listeners.change();
    const tile=target.children[0].children[0].children[1];
    assert.equal(tile.children[1],action);
    assert.equal(tile.children[0].textContent,"<code> - Contract");
    tile.children[0].listeners.click();assert.equal(opened,row);
    render({...config,rows:[]});assert.equal(target.children[0].className,"empty");
    render({...config,enabled:false});assert.equal(toolbar.children[0].hidden,true);
    select.value="Columnar";render(config);assert.equal(calls,3);assert.equal(closed,1);
    assert.equal(toolbar.children.length,1);
    const typed = {...config,contextKey:"org:type-a",defaultView:"status"};
    render(typed);assert.equal(select.value,"Status");
    select.value="Columnar";select.listeners.change();
    render({...typed,rows:config.rows});assert.equal(select.value,"Columnar");
    render({...typed,contextKey:"org:type-b",defaultView:"columnar"});assert.equal(select.value,"Columnar");
    render(typed);assert.equal(select.value,"Status");
    render({...typed,defaultView:"columnar"});assert.equal(select.value,"Columnar");
  } finally {global.document=original;}
});
