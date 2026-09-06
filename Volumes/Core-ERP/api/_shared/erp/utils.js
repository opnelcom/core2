'use strict';

function clean(value,fallback=''){
  const text=String(value??'').trim();
  return text||fallback;
}

function nullable(value){
  const text=clean(value);
  return text||null;
}

function bool(value){
  return value===true||value==='true'||value===1||value==='1';
}

function money(value){
  const n=Number(value);
  return Number.isFinite(n)?Math.round(n*100)/100:0;
}

function parseJson(value,fallback={}){
  if(value&&typeof value==='object')return value;
  const text=clean(value);
  if(!text)return fallback;
  return JSON.parse(text);
}

function topLevelSearch(schema,data){
  const props=schema?.properties||{};
  const result={};
  Object.keys(props).forEach(key=>{
    const field=props[key]||{};
    if(field['x-searchable']||field['x-reportable']||field['x-listView']){
      const value=data?.[key];
      if(value===undefined||value===null||typeof value==='object')return;
      result[key]=String(value);
    }
  });
  return result;
}

function validateSchema(schema,data){
  const errors=[];
  const props=schema?.properties||{};
  (schema?.required||[]).forEach(key=>{
    if(data?.[key]===undefined||data?.[key]===null||data?.[key]==='')errors.push(`${key} is required`);
  });
  if(schema?.additionalProperties===false){
    Object.keys(data||{}).forEach(key=>{
      if(!props[key])errors.push(`${key} is not allowed by the active schema`);
    });
  }
  Object.entries(props).forEach(([key,field])=>{
    const value=data?.[key];
    if(value===undefined||value===null||value==='')return;
    if(field.type==='array'&&!Array.isArray(value))errors.push(`${key} must be an array`);
    if(field.type==='object'&&(typeof value!=='object'||Array.isArray(value)))errors.push(`${key} must be an object`);
    if(field.type==='string'&&typeof value!=='string')errors.push(`${key} must be a string`);
    if(field.type==='number'&&typeof value!=='number')errors.push(`${key} must be a number`);
    if(field.type==='boolean'&&typeof value!=='boolean')errors.push(`${key} must be true or false`);
    if(Array.isArray(field.enum)&&!field.enum.includes(value))errors.push(`${key} must be one of ${field.enum.join(', ')}`);
  });
  return errors;
}

module.exports={clean,nullable,bool,money,parseJson,topLevelSearch,validateSchema};
