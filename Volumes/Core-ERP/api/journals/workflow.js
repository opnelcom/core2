'use strict';
const {authTenant,validateJournal,checkPeriodOpen,requireResourcePermission,requireModuleAccess}=require('../_shared/erp');

module.exports=async ctx=>{
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const id=ctx.body.journal_id;
  const action=ctx.body.action;
  if(!id||!action)return ctx.send(400,{error:'Journal and action are required'});
  const current=await ctx.broker('core_erp','query',{text:`SELECT * FROM erp_journal WHERE tenant_id=$1 AND journal_id=$2`,values:[access.tenantId,id]});
  if(!current.rowCount)return ctx.send(404,{error:'Journal not found'});
  const journal=current.rows[0];
  const moduleDenied=await requireModuleAccess(ctx,access,{organisationId:journal.organisation_id,resourceKind:'transaction_type',resourceCode:journal.transaction_type_id});
  if(moduleDenied)return ctx.send(moduleDenied.status,moduleDenied.body);
  const permissionStatus={
    submit:'submitted',
    approve:'approved',
    reject:'rejected',
    block:'blocked',
    delete:'draft',
    reverse:'approved'
  }[action];
  const denied=permissionStatus?await requireResourcePermission(ctx,access,{
    organisationId:journal.organisation_id,
    divisionId:journal.source_division_id,
    resourceKind:'transaction',
    resourceCode:journal.transaction_type_id,
    workflowStatus:permissionStatus
  }):null;
  if(denied)return ctx.send(denied.status,denied.body);
  if(action==='submit'){
    if(!['draft','rejected'].includes(journal.workflow_status))return ctx.send(400,{error:'Only draft or rejected journals can be submitted'});
    await validateJournal(ctx,access.tenantId,id);
    await checkPeriodOpen(ctx,access.tenantId,journal.fiscal_period_id);
    const r=await ctx.broker('core_erp','query',{text:`UPDATE erp_journal SET workflow_status='submitted',submitted_by_email=$3,updated_by_email=$3,updated_at=now() WHERE tenant_id=$1 AND journal_id=$2 RETURNING *`,values:[access.tenantId,id,access.auth.email]});
    return {journal:r.rows[0]};
  }
  if(action==='approve'){
    if(journal.workflow_status!=='submitted')return ctx.send(400,{error:'Only submitted journals can be approved'});
    await validateJournal(ctx,access.tenantId,id);
    await checkPeriodOpen(ctx,access.tenantId,journal.fiscal_period_id);
    const r=await ctx.broker('core_erp','query',{text:`UPDATE erp_journal SET workflow_status='approved',approved_by_email=$3,approved_at=now(),updated_by_email=$3,updated_at=now(),journal_number=COALESCE(journal_number,'J-'||to_char(now(),'YYYYMMDD')||'-'||left(journal_id::text,8)) WHERE tenant_id=$1 AND journal_id=$2 RETURNING *`,values:[access.tenantId,id,access.auth.email]});
    return {journal:r.rows[0]};
  }
  if(action==='reject'){
    if(journal.workflow_status!=='submitted')return ctx.send(400,{error:'Only submitted journals can be rejected'});
    const r=await ctx.broker('core_erp','query',{text:`UPDATE erp_journal SET workflow_status='rejected',updated_by_email=$3,updated_at=now() WHERE tenant_id=$1 AND journal_id=$2 RETURNING *`,values:[access.tenantId,id,access.auth.email]});
    return {journal:r.rows[0]};
  }
  if(action==='block'){
    if(!['submitted','approved','rejected'].includes(journal.workflow_status))return ctx.send(400,{error:'Only submitted, approved or rejected journals can be blocked'});
    const r=await ctx.broker('core_erp','query',{text:`UPDATE erp_journal SET workflow_status='blocked',updated_by_email=$3,updated_at=now() WHERE tenant_id=$1 AND journal_id=$2 RETURNING *`,values:[access.tenantId,id,access.auth.email]});
    return {journal:r.rows[0]};
  }
  if(action==='delete'){
    if(journal.workflow_status!=='draft')return ctx.send(400,{error:'Only draft journals can be deleted'});
    const r=await ctx.broker('core_erp','query',{text:`UPDATE erp_journal SET workflow_status='deleted',updated_by_email=$3,updated_at=now() WHERE tenant_id=$1 AND journal_id=$2 RETURNING *`,values:[access.tenantId,id,access.auth.email]});
    return {journal:r.rows[0]};
  }
  if(action==='reverse'){
    if(journal.workflow_status!=='approved')return ctx.send(400,{error:'Only approved journals can be reversed'});
    await checkPeriodOpen(ctx,access.tenantId,journal.fiscal_period_id);
    const r=await ctx.broker('core_erp','query',{
      text:`WITH reversal AS (
              INSERT INTO erp_journal(tenant_id,organisation_id,transaction_type_id,fiscal_period_id,source_division_id,journal_date,description,workflow_status,currency_code,exchange_rate,reversing_journal_id,created_by_email,updated_by_email,submitted_by_email,approved_by_email,approved_at)
              SELECT tenant_id,organisation_id,transaction_type_id,fiscal_period_id,source_division_id,CURRENT_DATE,'Reversal: '||description,'approved',currency_code,exchange_rate,journal_id,$3,$3,$3,$3,now()
              FROM erp_journal WHERE tenant_id=$1 AND journal_id=$2
              RETURNING *
            ),
            copied AS (
              INSERT INTO erp_journal_line(tenant_id,organisation_id,journal_id,line_number,division_id,gl_account_id,subledger_account_id,description,debit_amount,credit_amount,currency_code)
              SELECT l.tenant_id,l.organisation_id,reversal.journal_id,l.line_number,l.division_id,l.gl_account_id,l.subledger_account_id,'Reversal: '||l.description,l.credit_amount,l.debit_amount,l.currency_code
              FROM erp_journal_line l CROSS JOIN reversal
              WHERE l.tenant_id=$1 AND l.journal_id=$2
            )
            UPDATE erp_journal SET workflow_status='reversed',reversed_by_email=$3,reversed_at=now(),updated_by_email=$3,updated_at=now()
            WHERE tenant_id=$1 AND journal_id=$2
            RETURNING *`,
      values:[access.tenantId,id,access.auth.email]
    });
    return {journal:r.rows[0]};
  }
  return ctx.send(400,{error:'Unsupported journal action'});
};
