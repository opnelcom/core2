'use strict';
const fs = require('node:fs'), path = require('node:path');
const {requireAccess,postgres} = require('./migration');
const fail = (status,message) => Object.assign(new Error(message),{status});
const fields = 'connection_id,tenant_id,connection_name,engine,host,port,database_name,username,ssl_mode,description,version,created_by_email,updated_by_email,created_at,updated_at';
function uuid(value) {if(typeof value!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))throw fail(400,'Valid connection ID required');return value;}
async function access(ctx,methods=['POST']) {
  const session=await requireAccess(ctx,{methods,applicationCode:'core-database-management',applicationLabel:'Core Database Management',requireTenant:true});
  if(ctx.req.method!=='GET' && ctx.body.tenant_id !== session.current_tenant)throw fail(409,'Tenant context changed. Reload the connection list.');
  return {tenantId:session.current_tenant,email:session.user.email};
}
async function ensureSchema(ctx) {
  // Idempotent bootstrap also supports an existing empty database; no business rules in SQL.
  const file=process.env.DBMANAGER_SCHEMA || path.resolve(__dirname,'../../../Databases/Core-DBManager/Init/001-schema.sql');
  await ctx.broker('core_dbmanager','query',{text:fs.readFileSync(file,'utf8')});
}
function validate(body) {
  if(Object.hasOwn(body,'password'))throw fail(400,'Passwords cannot be saved');
  const name=typeof body.connection_name==='string'?body.connection_name.trim():'';
  if(!name||name.length>120||/[\x00-\x1f]/.test(name))throw fail(400,'Connection name is required (up to 120 characters)');
  if(body.engine!=='postgresql')throw fail(400,'Only PostgreSQL connections are supported');
  if(!Number.isInteger(body.port)||!['verify-full','disable'].includes(body.ssl_mode))throw fail(400,'Valid port and TLS mode required');
  postgres.connectionOptions({host:body.host,database:body.database_name,username:body.username,port:body.port,sslMode:body.ssl_mode,password:''});
  if(typeof body.description!=='string'||body.description.length>4000||body.description.includes('\0'))throw fail(400,'Description must be at most 4000 characters');
  return [name,body.engine,body.host.trim(),Number(body.port),body.database_name.trim(),body.username.trim(),body.ssl_mode,body.description];
}
function version(value) {if(!Number.isInteger(value)||value<1)throw fail(400,'Connection version required');return value;}
async function savedConnection(ctx,tenantId,id) {
  const result=await ctx.broker('core_dbmanager','query',{text:`SELECT ${fields} FROM dbmanager_connection WHERE tenant_id=$1 AND connection_id=$2`,values:[tenantId,uuid(id)]});
  if(!result.rows.length)throw fail(404,'Connection not found in this tenant');
  return result.rows[0];
}
async function resolveSource(ctx,tenantId) {
  const input=ctx.body.connection;
  if(!input || typeof input.password!=='string')throw fail(400,'Enter a password to use the connection');
  const row=await savedConnection(ctx,tenantId,input.connection_id);
  if(version(input.version)!==row.version)throw fail(409,'Connection settings changed. Reload connections and reconnect.');
  return {host:row.host,port:row.port,database:row.database_name,username:row.username,sslMode:row.ssl_mode,password:input.password};
}
module.exports={access,ensureSchema,validate,fields,uuid,version,savedConnection,resolveSource,fail};
