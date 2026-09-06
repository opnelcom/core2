'use strict';

const fs=require('fs');
const path=require('path');

let schemaPromise=null;

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

async function ensureSchema(ctx,options={}){
  if(options.force)return runSchemaSql(ctx);
  if(!schemaPromise){
    schemaPromise=runSchemaSql(ctx).catch(error=>{
      schemaPromise=null;
      throw error;
    });
  }
  return schemaPromise;
}

module.exports={ensureSchema,runSchemaSql,schemaPath};
