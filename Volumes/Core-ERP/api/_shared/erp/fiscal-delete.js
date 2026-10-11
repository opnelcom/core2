'use strict';
const {authTenant,requireAdmin}=require('../erp');
const {createTransactionPlan}=require('./transaction-plan');
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail=(status,message)=>Object.assign(new Error(message),{status});

// ERP prepares the deletion; Broker receives only a guarded SQL batch.
async function executeFiscalDelete(client,options,plan=null){
  const {kind,tenantId,organisationId,id}=options||{};
  if(!['year','period'].includes(kind)||![tenantId,organisationId,id].every(value=>typeof value==='string'&&uuid.test(value)))
    throw fail(400,'Valid fiscal deletion identifiers are required');
  const table=kind==='year'?'erp_fiscal_year':'erp_fiscal_period';
  const key=kind==='year'?'fiscal_year_id':'fiscal_period_id';
  const values=[tenantId,organisationId,id];
  const selected=await client.query(`SELECT ${key} FROM ${table} WHERE tenant_id=$1 AND organisation_id=$2 AND ${key}=$3 FOR UPDATE`,values);
  if(!selected.rows.length)throw fail(404,`Fiscal ${kind} not found`);
  if(kind==='year')await client.query('SELECT fiscal_period_id FROM erp_fiscal_period WHERE fiscal_year_id=$1 ORDER BY fiscal_period_id FOR UPDATE',[id]);
  // Include every journal status, including drafts and reversed transactions.
  const dependency=await client.query(`SELECT count(*)::int AS journal_count FROM erp_journal j JOIN erp_fiscal_period p ON p.fiscal_period_id=j.fiscal_period_id WHERE p.${key}=$1`,[id]);
  const count=dependency.rows[0].journal_count;
  if(count)throw fail(409,`Cannot delete fiscal ${kind}: ${count} transaction record${count===1?'':'s'} reference${count===1?'s':''} ${kind==='year'?'its periods':'this period'}. Close or lock used periods instead.`);
  const statement={text:`DELETE FROM ${table} WHERE tenant_id=$1 AND organisation_id=$2 AND ${key}=$3 RETURNING ${key}`,values,expectedRowCount:1};
  const deleted=plan?plan.write(statement):await client.query(statement.text,values);
  return [{rows:deleted.rows,rowCount:deleted.rowCount??deleted.affectedRows,command:'DELETE'}];
}

function deleteFiscalRecord(kind){
  return async ctx=>{
    if(ctx.req.method!=='POST')return ctx.send(405,{error:'POST required'});
    const access=await authTenant(ctx);
    if(access.status)return ctx.send(access.status,access.body);
    const denied=requireAdmin(access);
    if(denied)return ctx.send(denied.status,denied.body);
    const organisationId=ctx.body.organisation_id,id=ctx.body[`fiscal_${kind}_id`];
    if(![organisationId,id].every(value=>typeof value==='string'&&uuid.test(value)))return ctx.send(400,{error:`Valid organisation_id and fiscal_${kind}_id are required`});
    const plan=createTransactionPlan(ctx,['erp_fiscal_year','erp_fiscal_period','erp_journal']);
    await executeFiscalDelete(plan.client,{kind,tenantId:access.tenantId,organisationId,id},plan);
    await plan.commit();
    return {ok:true};
  };
}
module.exports={executeFiscalDelete,deleteFiscalRecord};
