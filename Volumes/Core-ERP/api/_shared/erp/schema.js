'use strict';

const fs=require('fs');
const path=require('path');

function contentRoot(){
  return process.env.CONTENT_ROOT||path.resolve(__dirname,'..','..','..');
}

function schemaPath(){
  return path.join(contentRoot(),'schema','erp-schema.sql');
}

function readSchemaSql(){
  return fs.readFileSync(schemaPath(),'utf8');
}

async function runSchemaSql(ctx){
  await ctx.broker('core_erp','query',{text:readSchemaSql()});
  return {ok:true};
}

module.exports={runSchemaSql,schemaPath};
