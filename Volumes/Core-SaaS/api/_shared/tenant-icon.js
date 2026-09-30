'use strict';

const maxTenantIconBytes=32768;
const defaultTenantIconPreset='organisation';
const tenantIconPresets=new Set(['personal','family','organisation','team','partnership','department','ideas','design','testing']);
const tagNames=new Map([
  ['svg','svg'],['g','g'],['path','path'],['rect','rect'],['circle','circle'],['ellipse','ellipse'],
  ['line','line'],['polyline','polyline'],['polygon','polygon'],['title','title'],['desc','desc'],
  ['defs','defs'],['lineargradient','linearGradient'],['radialgradient','radialGradient'],['stop','stop'],
  ['clippath','clipPath'],['mask','mask']
]);
const globalAttributes=new Set(['id','transform','fill','stroke','stroke-width','stroke-linecap','stroke-linejoin','stroke-miterlimit','fill-rule','clip-rule','opacity','clip-path','mask','vector-effect']);
const tagAttributes={
  svg:new Set(['xmlns','viewBox','width','height','role','aria-label','focusable','preserveAspectRatio']),
  path:new Set(['d','pathLength']),
  rect:new Set(['x','y','width','height','rx','ry']),
  circle:new Set(['cx','cy','r']),
  ellipse:new Set(['cx','cy','rx','ry']),
  line:new Set(['x1','y1','x2','y2']),
  polyline:new Set(['points']),
  polygon:new Set(['points']),
  linearGradient:new Set(['x1','y1','x2','y2','gradientUnits','gradientTransform']),
  radialGradient:new Set(['cx','cy','r','fx','fy','gradientUnits','gradientTransform']),
  stop:new Set(['offset','stop-color','stop-opacity']),
  clipPath:new Set(['clipPathUnits']),
  mask:new Set(['x','y','width','height','maskUnits','maskContentUnits'])
};
function invalid(message){
  const error=new Error(message);
  error.status=400;
  throw error;
}

function sanitizeTenantIconPreset(value){
  if(value===undefined)return undefined;
  if(value===null||String(value).trim()==='')return null;
  const preset=String(value).trim().toLowerCase();
  if(!tenantIconPresets.has(preset))invalid('Invalid tenant icon preset');
  return preset;
}

function escapeText(value){
  return value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function escapeAttribute(value){
  return escapeText(value).replace(/"/g,'&quot;');
}

function parseAttributes(source,tag){
  const attributes=[];
  const seen=new Set();
  let offset=0;
  while(offset<source.length){
    while(offset<source.length&&/\s/.test(source[offset]))offset+=1;
    if(offset>=source.length)break;
    const attribute=/([A-Za-z_:][A-Za-z0-9_.:-]*)\s*=\s*("([^"]*)"|'([^']*)')/y;
    attribute.lastIndex=offset;
    const match=attribute.exec(source);
    if(!match)invalid('Tenant icon SVG contains an invalid attribute');
    offset=attribute.lastIndex;
    const rawName=match[1];
    const name=rawName.toLowerCase()==='viewbox'?'viewBox':rawName;
    const attributeValue=match[3]===undefined?match[4]:match[3];
    if(seen.has(name))invalid('Tenant icon SVG contains duplicate attributes');
    seen.add(name);
    if(/^on/i.test(name)||/^(?:href|xlink:href|style|class)$/i.test(name))invalid('Tenant icon SVG contains unsupported or unsafe attributes');
    const allowed=globalAttributes.has(name)||(tagAttributes[tag]&&tagAttributes[tag].has(name));
    if(!allowed)invalid(`Tenant icon SVG attribute ${name} is not supported`);
    if(/[<>&`]/.test(attributeValue))invalid('Tenant icon SVG attributes may not contain markup or entities');
    if(/url\s*\(/i.test(attributeValue)&&!/^url\(#[A-Za-z_][A-Za-z0-9_.:-]*\)$/.test(attributeValue))invalid('Tenant icon SVG may only use local fragment references');
    attributes.push(`${name}="${escapeAttribute(attributeValue)}"`);
  }
  return attributes.length?' '+attributes.join(' '):'';
}

function sanitizeTenantIconSvg(value){
  if(value===undefined)return undefined;
  if(value===null||String(value).trim()==='')return null;
  const source=String(value).trim().replace(/^<\?xml[\s\S]*?\?>\s*/i,'').replace(/<!--[\s\S]*?-->/g,'').trim();
  if(Buffer.byteLength(source,'utf8')>maxTenantIconBytes)invalid('Tenant icon SVG must be 32 KB or smaller');
  if(/<!|<\?|&[A-Za-z#]/.test(source))invalid('Tenant icon SVG declarations and entities are not supported');

  const tokens=source.match(/<[^>]+>|[^<]+/g)||[];
  if(tokens.join('')!==source)invalid('Tenant icon SVG is malformed');
  const stack=[];
  const output=[];
  let rootCount=0;
  for(const token of tokens){
    if(!token.startsWith('<')){
      if(token.trim()&&![...stack].reverse().some(tag=>tag==='title'||tag==='desc'))invalid('Tenant icon SVG contains unsupported text');
      if(token.trim())output.push(escapeText(token.trim()));
      continue;
    }
    const closing=token.match(/^<\/\s*([A-Za-z][A-Za-z0-9]*)\s*>$/);
    if(closing){
      const canonical=tagNames.get(closing[1].toLowerCase());
      if(!canonical||stack.pop()!==canonical)invalid('Tenant icon SVG tags are not balanced');
      output.push(`</${canonical}>`);
      continue;
    }
    const opening=token.match(/^<\s*([A-Za-z][A-Za-z0-9]*)([\s\S]*?)(\/?)>$/);
    if(!opening)invalid('Tenant icon SVG contains malformed markup');
    const canonical=tagNames.get(opening[1].toLowerCase());
    if(!canonical)invalid(`Tenant icon SVG element ${opening[1]} is not supported`);
    const selfClosing=opening[3]==='/';
    if(canonical==='svg'){
      rootCount+=1;
      if(rootCount!==1||stack.length)invalid('Tenant icon must contain one SVG root element');
    }else if(!stack.length)invalid('Tenant icon content must be inside the SVG root');
    const attributes=parseAttributes(opening[2],canonical);
    output.push(`<${canonical}${attributes}${selfClosing?'/>':'>'}`);
    if(!selfClosing)stack.push(canonical);
  }
  if(stack.length||rootCount!==1||output[0]?.slice(0,4)!=='<svg'||output.at(-1)!=='</svg>')invalid('Tenant icon must contain one balanced SVG root element');
  return output.join('');
}

module.exports={defaultTenantIconPreset,maxTenantIconBytes,sanitizeTenantIconPreset,sanitizeTenantIconSvg,tenantIconPresets};
