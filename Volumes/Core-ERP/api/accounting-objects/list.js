'use strict';
const {authTenant,isAdministrator,requireModuleAccess}=require('../_shared/erp');

module.exports=async ctx=>{
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const orgId=ctx.query.organisation_id;
  const typeId=ctx.query.accounting_object_type_id;
  if(!orgId||!typeId)return ctx.send(400,{error:'organisation_id and accounting_object_type_id are required'});
  const moduleDenied=await requireModuleAccess(ctx,access,{organisationId:orgId,resourceKind:'accounting_object_type',resourceCode:typeId});
  if(moduleDenied)return ctx.send(moduleDenied.status,moduleDenied.body);
  const administrator=isAdministrator(access);
  const r=await ctx.broker('core_erp','query',{
    text:`SELECT o.*,t.type_code,t.type_name,d.division_name owner_division_name,
            step.step_label workflow_step_label,
            step.colour workflow_step_colour,
            COALESCE((
              SELECT jsonb_agg(jsonb_build_object('step_code',next_step.step_code,'step_label',next_step.step_label,'colour',next_step.colour) ORDER BY next_step.sort_order,next_step.step_label)
                FROM erp_workflow_next wn
                JOIN erp_workflow_step next_step ON next_step.workflow_path_id=wn.workflow_path_id AND next_step.step_code=wn.next_step_code
                WHERE wn.workflow_path_id=t.workflow_path_id
                  AND wn.current_step_code=o.workflow_status
                AND (
                  $5::boolean
                  OR EXISTS (
                  WITH RECURSIVE ancestors AS (
                    SELECT division_id,parent_division_id,0 AS depth FROM erp_division WHERE division_id=o.owner_division_id
                    UNION ALL
                    SELECT parent.division_id,parent.parent_division_id,child.depth+1
                    FROM erp_division parent JOIN ancestors child ON child.parent_division_id=parent.division_id
                    WHERE parent.tenant_id=$1 AND parent.organisation_id=$2
                  )
                  SELECT 1
                  FROM erp_user_role ur
                  JOIN erp_role role ON role.role_id=ur.role_id
                  JOIN erp_role_permission rp ON rp.role_id=role.role_id
                  JOIN ancestors scope ON scope.division_id=rp.division_id
                  WHERE ur.tenant_id=$1 AND ur.organisation_id=$2 AND lower(ur.email)=lower($4)
                    AND role.is_active=true AND ur.valid_from<=CURRENT_DATE AND (ur.valid_to IS NULL OR ur.valid_to>=CURRENT_DATE)
                    AND rp.resource_kind='accounting_object'
                    AND (rp.resource_code=t.accounting_object_type_id::text OR rp.resource_code='*')
                    AND (rp.workflow_status=next_step.step_code OR rp.workflow_status='*')
                    AND rp.valid_from<=CURRENT_DATE AND (rp.valid_to IS NULL OR rp.valid_to>=CURRENT_DATE)
                    AND (scope.depth=0 OR rp.applies_to_children=true)
                  )
                )
            ),'[]'::jsonb) available_workflow_steps,
            COALESCE((
              SELECT jsonb_agg(jsonb_build_object('previous_step_code',h.previous_step_code,'new_step_code',h.new_step_code,'user_email',h.user_email,'comment',h.comment,'created_at',h.created_at) ORDER BY h.created_at DESC)
              FROM erp_workflow_history h
              WHERE h.tenant_id=o.tenant_id AND h.organisation_id=o.organisation_id AND h.object_type='accounting_object' AND h.object_id=o.accounting_object_id
            ),'[]'::jsonb) workflow_history,
            parent.object_code parent_object_code,parent.object_name parent_object_name,
            parent_type.type_code parent_type_code,parent_type.type_name parent_type_name
          FROM erp_accounting_object o
          JOIN erp_accounting_object_type t ON t.accounting_object_type_id=o.accounting_object_type_id
          JOIN erp_division d ON d.division_id=o.owner_division_id
          LEFT JOIN erp_workflow_step step ON step.workflow_path_id=t.workflow_path_id AND step.step_code=o.workflow_status
          LEFT JOIN erp_accounting_object parent ON parent.tenant_id=o.tenant_id AND parent.organisation_id=o.organisation_id AND parent.accounting_object_id=o.parent_accounting_object_id
          LEFT JOIN erp_accounting_object_type parent_type ON parent_type.accounting_object_type_id=parent.accounting_object_type_id
          WHERE o.tenant_id=$1 AND o.organisation_id=$2 AND o.accounting_object_type_id=$3
          AND o.workflow_status <> 'deleted'
          AND ($5::boolean OR EXISTS (
            WITH RECURSIVE permitted_ancestors AS (
              SELECT division_id,parent_division_id,0 AS depth FROM erp_division WHERE division_id=o.owner_division_id
              UNION ALL
              SELECT parent.division_id,parent.parent_division_id,child.depth+1
              FROM erp_division parent JOIN permitted_ancestors child ON child.parent_division_id=parent.division_id
              WHERE parent.tenant_id=$1 AND parent.organisation_id=$2
            )
            SELECT 1 FROM erp_user_role ur
            JOIN erp_role role ON role.role_id=ur.role_id
            JOIN erp_role_permission permission ON permission.role_id=role.role_id
            JOIN permitted_ancestors scope ON scope.division_id=permission.division_id
            WHERE ur.tenant_id=$1 AND ur.organisation_id=$2 AND lower(ur.email)=lower($4)
              AND role.is_active=true AND ur.valid_from<=CURRENT_DATE AND (ur.valid_to IS NULL OR ur.valid_to>=CURRENT_DATE)
              AND permission.resource_kind='accounting_object'
              AND (permission.resource_code=$3::text OR permission.resource_code='*')
              AND permission.workflow_status IN('view','*')
              AND permission.valid_from<=CURRENT_DATE AND (permission.valid_to IS NULL OR permission.valid_to>=CURRENT_DATE)
              AND (scope.depth=0 OR permission.applies_to_children=true)
          ))
          ORDER BY o.object_name`,
    values:[access.tenantId,orgId,typeId,access.auth.email,administrator]
  });
  return {records:r.rows};
};
