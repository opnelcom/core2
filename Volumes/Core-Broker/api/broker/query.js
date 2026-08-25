'use strict';
const {brokerConfig,authorize,poolFor,recordProfileMetric,summarizeSql}=require('../_shared/broker');
module.exports=async ctx=>{
  if(ctx.req.method!=='POST')return ctx.send(405,{error:'POST required'});
  const config=brokerConfig();
  const {text,values=[]}=ctx.body;
  if(Object.prototype.hasOwnProperty.call(ctx.body,'database'))return ctx.send(400,{error:'database parameter is not accepted; use DB broker profile'});
  const auth=authorize(ctx,config);
  if(auth.status){ctx.logger.warn('broker query rejected',{requestId:ctx.requestId,profile:ctx.body.brokerProfile,statusCode:auth.status,error:auth.body.error});return ctx.send(auth.status,auth.body);}
  if(typeof text!=='string'||!text.trim())return ctx.send(400,{error:'SQL text required'});
  const meta={requestId:ctx.requestId,profile:auth.profile.name,database:auth.profile.database,sql:summarizeSql(text),valueCount:Array.isArray(values)?values.length:0};
  recordProfileMetric(auth.profile,'query','requests');
  ctx.logger.info('broker query requested',meta);
  try{
    const r=await poolFor(auth.profile).query(text,values);
    recordProfileMetric(auth.profile,'query','completed');
    ctx.logger.info('broker query completed',{...meta,rowCount:r.rowCount,command:r.command});
    return {rows:r.rows,rowCount:r.rowCount,command:r.command};
  }catch(e){
    recordProfileMetric(auth.profile,'query','failed');
    ctx.logger.error('broker query failed',{...meta,error:e.message,code:e.code});
    throw e;
  }
};
