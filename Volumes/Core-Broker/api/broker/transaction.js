'use strict';
const {brokerConfig,authorize,poolFor,recordProfileMetric,summarizeSql}=require('../_shared/broker');
module.exports=async ctx=>{
  if(ctx.req.method!=='POST')return ctx.send(405,{error:'POST required'});
  const config=brokerConfig();
  const {statements=[]}=ctx.body;
  if(Object.prototype.hasOwnProperty.call(ctx.body,'database'))return ctx.send(400,{error:'database parameter is not accepted; use DB broker profile'});
  const auth=authorize(ctx,config);
  if(auth.status){ctx.logger.warn('broker transaction rejected',{requestId:ctx.requestId,profile:ctx.body.brokerProfile,statusCode:auth.status,error:auth.body.error});return ctx.send(auth.status,auth.body);}
  if(!Array.isArray(statements)||!statements.length)return ctx.send(400,{error:'statements required'});
  const meta={requestId:ctx.requestId,profile:auth.profile.name,database:auth.profile.database,statementCount:statements.length,statements:statements.map((s,i)=>({index:i,sql:summarizeSql(s&&s.text),valueCount:Array.isArray(s&&s.values)?s.values.length:0}))};
  recordProfileMetric(auth.profile,'transaction','requests');
  ctx.logger.info('broker transaction requested',meta);
  let client;
  try{
    client=await poolFor(auth.profile).connect();
    await client.query('BEGIN');
    const results=[];
    for(const s of statements){
      const r=await client.query(s.text,s.values||[]);
      results.push({rows:r.rows,rowCount:r.rowCount,command:r.command});
    }
    await client.query('COMMIT');
    recordProfileMetric(auth.profile,'transaction','completed');
    ctx.logger.info('broker transaction completed',{...meta,results:results.map((r,i)=>({index:i,rowCount:r.rowCount,command:r.command}))});
    return {results};
  }catch(e){
    if(client){
      try{await client.query('ROLLBACK');}catch{}
    }
    recordProfileMetric(auth.profile,'transaction','failed');
    ctx.logger.error('broker transaction failed',{...meta,error:e.message,code:e.code});
    throw e;
  }finally{
    if(client)client.release();
  }
};
