'use strict';
const { validateGrid, validateGridDefinition, referenceClasses } = require('./schema-grids');
const visibility = require('../../../public/schema-visibility');

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
  if (!data || typeof data !== 'object' || Array.isArray(data)) return ['Additional data must be an object'];
  const props=schema?.properties||{};
  (Array.isArray(schema?.required)?schema.required:[]).forEach(key=>{
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
    if(field.type==='grid') {
      errors.push(...validateGrid(field,value,validateSchema).map(error=>`${field.title||key}: ${error}`));
      return;
    }
    const type=['text','short_text','long_text','textarea','date','date_time','email','url','select','reference'].includes(field.type)?'string':field.type;
    if(type==='array'&&!Array.isArray(value))errors.push(`${key} must be an array`);
    if(type==='object'&&(typeof value!=='object'||Array.isArray(value)))errors.push(`${key} must be an object`);
    if(type==='string'&&typeof value!=='string')errors.push(`${key} must be a string`);
    if(type==='number'&&(typeof value!=='number'||!Number.isFinite(value)))errors.push(`${key} must be a finite number`);
    if(type==='integer'&&!Number.isSafeInteger(value))errors.push(`${key} must be a whole number`);
    if(type==='currency'||type==='decimal'){
      const scale=field.scale??2;
      const precision=field.precision??14;
      const text=String(value);
      const match=/^-?(\d+)(?:\.(\d+))?$/.exec(text);
      if(!['string','number'].includes(typeof value)||!match)errors.push(`${key} must be a decimal amount`);
      else {
        const digits=match[1].replace(/^0+(?=\d)/,'').length;
        if(digits>precision-scale)errors.push(`${key} allows at most ${precision-scale} digits before the decimal`);
        if((match[2]||'').length>scale)errors.push(`${key} allows at most ${scale} decimal places`);
      }
    }
    if(['number','integer','currency','decimal'].includes(type)){
      if(field.minimum!==undefined&&Number(value)<field.minimum)errors.push(`${key} must be at least ${field.minimum}`);
      if(field.maximum!==undefined&&Number(value)>field.maximum)errors.push(`${key} must be at most ${field.maximum}`);
    }
    if(typeof value==='string'){
      if(field.maxLength!==undefined&&value.length>field.maxLength)errors.push(`${key} must be at most ${field.maxLength} characters`);
      if(field.minLength!==undefined&&value.length<field.minLength)errors.push(`${key} must be at least ${field.minLength} characters`);
      if(field.pattern){
        try { if(!new RegExp(`^(?:${field.pattern})$`).test(value))errors.push(`${key} does not match the required format`); }
        catch { errors.push(`${key} has an invalid schema pattern`); }
      }
      if((field.type==='email'||field.format==='email')&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))errors.push(`${key} must be an email address`);
      if(field.type==='url'||field.format==='uri'){
        try { const url=new URL(value); if(!['http:','https:'].includes(url.protocol))throw new Error(); }
        catch { errors.push(`${key} must be an HTTP or HTTPS URL`); }
      }
      if(field.type==='date'||field.format==='date'){
        const date=new Date(`${value}T00:00:00Z`);
        if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==value)errors.push(`${key} must be a valid date`);
      }
      if((field.type==='date_time'||field.format==='date-time')&&(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)||!Number.isFinite(Date.parse(value))))errors.push(`${key} must be a valid date and time`);
    }
    if(type==='boolean'&&typeof value!=='boolean')errors.push(`${key} must be true or false`);
    if(Array.isArray(field.options)){
      const codes=field.options.map(option=>typeof option==='object'?option.code??option.value:option).filter(option=>option!==undefined&&option!==null);
      if(codes.length&&!codes.includes(value))errors.push(`${key} must be one of ${codes.join(', ')}`);
    }
    if(Array.isArray(field.enum)&&!field.enum.includes(value))errors.push(`${key} must be one of ${field.enum.join(', ')}`);
  });
  return errors;
}

function validateSchemaDefinition(schema,rootSchema=schema){
  if(!schema||typeof schema!=='object'||Array.isArray(schema))return ['Schema must be a JSON object'];
  if(schema.properties!==undefined&&(!schema.properties||typeof schema.properties!=='object'||Array.isArray(schema.properties)))return ['Schema properties must be an object'];
  const errors=[];
  const scope = schema === rootSchema ? 'object' : 'row';
  for (const [index, tab] of (Array.isArray(schema.tabs) ? schema.tabs : []).entries()) errors.push(...visibility.validate(tab?.showif,schema,rootSchema,scope,`tabs[${index}].showif`));
  if(schema.required!==undefined&&(!Array.isArray(schema.required)||schema.required.some(key=>typeof key!=='string'||!schema.properties?.[key])))errors.push('required must name existing properties');
  for(const [name,field] of Object.entries(schema.properties||{})){
    if(!field||typeof field!=='object'||Array.isArray(field)){errors.push(`${name} must define a field object`);continue;}
    errors.push(...visibility.validate(field.showif,schema,rootSchema,scope,`${name}.showif`));
    if(field.type==='grid')errors.push(...validateGridDefinition(field,row=>validateSchemaDefinition(row,rootSchema)).map(error=>`${name}: ${error}`));
    if(field.type==='reference'){
      const targets=Array.isArray(field.target?.anyOf)?field.target.anyOf:[field.target];
      if(!targets.length||field.target?.anyOf!==undefined&&(!Array.isArray(field.target.anyOf)||field.target.class))errors.push(`${name}.target must use class or non-empty anyOf, not both`);
      targets.forEach(target=>{
        if(!referenceClasses.includes(target?.class))errors.push(`${name}.target.class must identify a supported ERP class`);
        if(target?.types!==undefined&&(!Array.isArray(target.types)||target.types.some(code=>typeof code!=='string'||!code)))errors.push(`${name}.target.types must be an array of type codes`);
      });
      if(field.referenceSource!==undefined){
        const source=field.referenceSource;
        if(!source||typeof source!=='object'||['field','grid','column'].some(key=>typeof source[key]!=='string'||!source[key]))errors.push(`${name}.referenceSource requires field, grid and column names`);
        else if(rootSchema.properties?.[source.field]?.type!=='reference'||!['accounting_object','accounting_dimension','subledger_account'].includes(rootSchema.properties[source.field].target?.class))errors.push(`${name}.referenceSource.field must name a root reference to a single versioned ERP class`);
      }
    }
    for(const attr of ['maxLength','minLength','rows'])if(field[attr]!==undefined&&(!Number.isInteger(field[attr])||field[attr]<(attr==='rows'?1:0)))errors.push(`${name}.${attr} must be a ${attr==='rows'?'positive':'non-negative'} integer`);
    if(field.maxLength!==undefined&&field.minLength>field.maxLength)errors.push(`${name}.minLength cannot exceed maxLength`);
    if(field.sortOrder!==undefined&&(!Number.isInteger(field.sortOrder)||field.sortOrder<0))errors.push(`${name}.sortOrder must be a non-negative integer`);
    if(field.uiWidth!==undefined&&!['short','medium','wide','full'].includes(field.uiWidth))errors.push(`${name}.uiWidth must be short, medium, wide or full`);
    for(const attr of ['minimum','maximum'])if(field[attr]!==undefined&&(typeof field[attr]!=='number'||!Number.isFinite(field[attr])))errors.push(`${name}.${attr} must be a finite number`);
    if(field.minimum!==undefined&&field.maximum!==undefined&&field.minimum>field.maximum)errors.push(`${name}.minimum cannot exceed maximum`);
    if(['currency','decimal'].includes(field.type)){
      const precision=field.precision??14,scale=field.scale??2;
      if(!Number.isInteger(precision)||precision<1||precision>38||!Number.isInteger(scale)||scale<0||scale>=precision)errors.push(`${name} requires precision 1–38 and scale from 0 to precision minus 1`);
    }
    if(field.pattern!==undefined){try{new RegExp(field.pattern);}catch{errors.push(`${name}.pattern must be a valid regular expression`);}}
  }
  return errors;
}

module.exports={clean,nullable,bool,money,parseJson,topLevelSearch,validateSchema,validateSchemaDefinition};
