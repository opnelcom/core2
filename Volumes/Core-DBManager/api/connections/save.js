'use strict';
const {access,ensureSchema,validate,fields,uuid,version,fail}=require('../_shared/connections');
module.exports=async ctx=>{
  const {tenantId,email}=await access(ctx);const data=validate(ctx.body);await ensureSchema(ctx);
  const id=ctx.body.connection_id;
  try{
    const result=await ctx.broker('core_dbmanager','query',id?{
      text:`UPDATE dbmanager_connection SET connection_name=$3,engine=$4,host=$5,port=$6,database_name=$7,username=$8,ssl_mode=$9,description=$10,version=version+1,updated_by_email=$11,updated_at=now()
        WHERE tenant_id=$1 AND connection_id=$2 AND version=$12 RETURNING ${fields}`,
      values:[tenantId,uuid(id),...data,email,version(ctx.body.version)]
    }:{text:`INSERT INTO dbmanager_connection (tenant_id,connection_name,engine,host,port,database_name,username,ssl_mode,description,created_by_email,updated_by_email)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10) RETURNING ${fields}`,values:[tenantId,...data,email]});
    if(!result.rows.length)throw fail(409,'Connection was changed or deleted. Reload and try again.');
    return {tenant_id:tenantId,connection:result.rows[0]};
  }catch(error){
    if(String(error.message).includes('dbmanager_connection_tenant_name'))throw fail(409,'A connection with this name already exists in this tenant');
    throw error;
  }
};
