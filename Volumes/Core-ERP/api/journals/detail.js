'use strict';
const {authTenant,requireModuleAccess}=require('../_shared/erp');

module.exports=async ctx=>{
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const id=ctx.query.journal_id;
  if(!id)return ctx.send(400,{error:'journal_id is required'});
  const journal=await ctx.broker('core_erp','query',{
    text:`SELECT *
          FROM erp_journal j
          WHERE j.tenant_id=$1 AND j.journal_id=$2
          AND (
            EXISTS (
              WITH RECURSIVE ancestors AS (
                SELECT division_id,parent_division_id FROM erp_division WHERE division_id=j.source_division_id
                UNION ALL
                SELECT parent.division_id,parent.parent_division_id
                FROM erp_division parent
                JOIN ancestors child ON child.parent_division_id=parent.division_id
              )
              SELECT 1
              FROM erp_user_role ur
              JOIN erp_role role ON role.role_id=ur.role_id
              JOIN erp_role_permission rp ON rp.role_id=role.role_id
              JOIN ancestors scope ON scope.division_id=rp.division_id
              WHERE ur.tenant_id=$1 AND ur.organisation_id=j.organisation_id AND lower(ur.email)=lower($3)
              AND role.is_active=true AND ur.valid_from <= CURRENT_DATE AND (ur.valid_to IS NULL OR ur.valid_to >= CURRENT_DATE)
              AND rp.resource_kind='transaction'
              AND (rp.workflow_status='view' OR rp.workflow_status='*' OR rp.workflow_status=j.workflow_status)
              AND (rp.resource_code=j.transaction_type_id::text OR rp.resource_code='*')
            )
            OR lower(j.created_by_email)=lower($3)
          )`,
    values:[access.tenantId,id,access.auth.email]
  });
  if(!journal.rowCount)return ctx.send(404,{error:'Journal not found'});
  const moduleDenied=await requireModuleAccess(ctx,access,{organisationId:journal.rows[0].organisation_id,resourceKind:'transaction_type',resourceCode:journal.rows[0].transaction_type_id});
  if(moduleDenied)return ctx.send(moduleDenied.status,moduleDenied.body);
  const lines=await ctx.broker('core_erp','query',{
    text:`SELECT l.*,gl.account_code gl_account_code,gl.account_name gl_account_name,sub.account_code subledger_account_code,sub.account_name subledger_account_name,d.division_name,
                 COALESCE((SELECT jsonb_agg(jsonb_build_object('accounting_object_type_id',allocation.accounting_object_type_id,'accounting_object_id',allocation.accounting_object_id,'type_name',type.type_name,'object_code',object.object_code,'object_name',object.object_name) ORDER BY type.type_name) FROM erp_journal_line_accounting_object allocation JOIN erp_accounting_object_type type ON type.accounting_object_type_id=allocation.accounting_object_type_id JOIN erp_accounting_object object ON object.accounting_object_id=allocation.accounting_object_id WHERE allocation.journal_line_id=l.journal_line_id),'[]'::jsonb) accounting_objects,
                 COALESCE((SELECT jsonb_agg(jsonb_build_object('accounting_dimension_type_id',allocation.accounting_dimension_type_id,'accounting_dimension_id',allocation.accounting_dimension_id,'type_name',type.type_name,'dimension_code',dimension.dimension_code,'dimension_name',dimension.dimension_name) ORDER BY type.type_name) FROM erp_journal_line_accounting_dimension allocation JOIN erp_accounting_dimension_type type ON type.accounting_dimension_type_id=allocation.accounting_dimension_type_id JOIN erp_accounting_dimension dimension ON dimension.accounting_dimension_id=allocation.accounting_dimension_id WHERE allocation.journal_line_id=l.journal_line_id),'[]'::jsonb) accounting_dimensions
          FROM erp_journal_line l
          JOIN erp_gl_account gl ON gl.gl_account_id=l.gl_account_id
          LEFT JOIN erp_subledger_account sub ON sub.subledger_account_id=l.subledger_account_id
          JOIN erp_division d ON d.division_id=l.division_id
          WHERE l.tenant_id=$1 AND l.journal_id=$2
          ORDER BY l.line_number`,
    values:[access.tenantId,id]
  });
  return {journal:journal.rows[0],lines:lines.rows};
};
