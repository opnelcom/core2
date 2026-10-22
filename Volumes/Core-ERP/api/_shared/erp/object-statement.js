'use strict';
const {validDate}=require('./trial-balance');
const {transactionVisibilitySql}=require('./transaction-visibility');
const {requireBusinessAccess,requireModuleAccess,hasResourcePermission,isAdministrator}=require('./access');
const classes=require('./object-classes');
const {postedLineScopeSql}=require('./posted-line-scope');
function fail(message,status=400){throw Object.assign(new Error(message),{status});}
function validate(query){
 const meta=classes[query.object_class];if(!meta)fail('Choose a supported object class');
 for(const key of ['organisation_id','object_type_id','object_id'])if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(query[key]||''))fail(`${key} must be a UUID`);
 if(query.gl_account_id&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(query.gl_account_id))fail('GL account must be a UUID');
 if(!validDate(query.date_from)||!validDate(query.date_to)||query.date_from>query.date_to)fail('Choose a valid ordered date range');
 if(query.division_id&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(query.division_id))fail('Division must be a UUID');
 if(query.include_child_divisions!==undefined&&!['0','1'].includes(query.include_child_divisions))fail('Invalid child-division setting');
 if(query.include_child_objects!==undefined&&!['0','1'].includes(query.include_child_objects))fail('Invalid child-object setting');
 const offset=Number(query.offset||0);if(!Number.isSafeInteger(offset)||offset<0)fail('Invalid statement page');
 return {meta,offset,children:query.object_class==='accounting_object'&&query.include_child_objects!=='0'};
}
// Trusted table/column metadata only; all selection values are parameters.
function objectVisibilitySql(meta,kind,{tenant='$1',organisation='$2',email='$7',administrator='$8'}={}){
 return `(${administrator}::boolean OR EXISTS (
 WITH RECURSIVE ancestors AS (
 SELECT division_id,parent_division_id,0 depth FROM erp_division WHERE tenant_id=${tenant} AND organisation_id=${organisation} AND division_id=o.owner_division_id
 UNION ALL SELECT p.division_id,p.parent_division_id,c.depth+1 FROM erp_division p JOIN ancestors c ON c.parent_division_id=p.division_id WHERE p.tenant_id=${tenant} AND p.organisation_id=${organisation})
 SELECT 1 FROM erp_user_role ur JOIN erp_role role ON role.role_id=ur.role_id JOIN erp_role_permission rp ON rp.role_id=role.role_id JOIN ancestors s ON s.division_id=rp.division_id
 WHERE ur.tenant_id=${tenant} AND ur.organisation_id=${organisation} AND lower(ur.email)=lower(${email}) AND role.is_active=true
 AND ur.valid_from<=CURRENT_DATE AND (ur.valid_to IS NULL OR ur.valid_to>=CURRENT_DATE)
 AND rp.valid_from<=CURRENT_DATE AND (rp.valid_to IS NULL OR rp.valid_to>=CURRENT_DATE)
 AND rp.resource_kind='${kind}' AND (rp.resource_code=o.${meta.type}::text OR rp.resource_code='*') AND rp.workflow_status IN ('view','*')
 AND (s.depth=0 OR rp.applies_to_children=true)
 AND EXISTS(SELECT 1 FROM erp_user_role module_user JOIN erp_role module_role ON module_role.role_id=module_user.role_id JOIN erp_role_module rm ON rm.role_id=module_role.role_id JOIN ${meta.types}_module link ON link.module_id=rm.module_id
 WHERE module_user.tenant_id=${tenant} AND module_user.organisation_id=${organisation} AND lower(module_user.email)=lower(${email}) AND module_role.is_active=true
 AND module_user.valid_from<=CURRENT_DATE AND (module_user.valid_to IS NULL OR module_user.valid_to>=CURRENT_DATE) AND link.${meta.type}=o.${meta.type})))`;
}
function statementSql(kind){
 const m=classes[kind];if(!m)fail('Unsupported object class');
 const descendants=kind==='accounting_object'?`UNION SELECT c.${m.id} FROM ${m.table} c JOIN object_scope p ON c.parent_accounting_object_id=p.object_id WHERE c.tenant_id=$1 AND c.organisation_id=$2 AND (SELECT include_child_objects FROM statement_parameters)`:'';
 const allocation=kind==='subledger_account'?`l.subledger_account_id=o.${m.id}`:`EXISTS(SELECT 1 FROM erp_journal_line_${kind} allocation WHERE allocation.tenant_id=$1 AND allocation.organisation_id=$2 AND allocation.journal_line_id=l.journal_line_id AND allocation.${m.id}=o.${m.id})`;
 // Type the child flag for every class, including queries without descendants.
 return `WITH RECURSIVE statement_parameters AS (SELECT $6::boolean include_child_objects), object_scope AS (
 SELECT ${m.id} object_id FROM ${m.table} WHERE tenant_id=$1 AND organisation_id=$2 AND ${m.id}=$5 ${descendants}
 ), scoped_objects AS (
 SELECT o.*,${objectVisibilitySql(m,kind)} object_visible FROM ${m.table} o JOIN object_scope s ON s.object_id=o.${m.id} WHERE o.tenant_id=$1 AND o.organisation_id=$2
 ), matched_lines AS (
 SELECT l.*,j.journal_date,j.journal_number,j.transaction_heading,j.description journal_description,j.created_at journal_created_at,
 a.account_code gl_account_code,a.account_name gl_account_name,
 ${transactionVisibilitySql({tenant:'$1',organisation:'$2',division:'l.division_id',transactionType:'j.transaction_type_id',status:"CASE WHEN j.workflow_status='reversed' THEN 'approved' ELSE j.workflow_status END",email:'$7',administrator:'$8'})} is_visible,
 EXISTS(SELECT 1 FROM scoped_objects o WHERE o.object_visible AND ${allocation}) object_visible,
 (SELECT string_agg(o.${m.code} || ' · ' || o.${m.name}, ', ' ORDER BY o.${m.code},o.${m.id}) FROM scoped_objects o WHERE o.object_visible AND ${allocation}) allocated_objects
 FROM erp_journal_line l JOIN erp_journal j ON j.journal_id=l.journal_id AND j.tenant_id=l.tenant_id AND j.organisation_id=l.organisation_id
 JOIN erp_gl_account a ON a.gl_account_id=l.gl_account_id AND a.tenant_id=l.tenant_id AND a.organisation_id=l.organisation_id
 WHERE ${postedLineScopeSql({tenant:'$1',organisation:'$2',asOf:'$4',selected:'$11',children:'$12'})}
 AND ($9::uuid IS NULL OR l.gl_account_id=$9) AND EXISTS(SELECT 1 FROM scoped_objects o WHERE ${allocation})
 ), visible_lines AS (SELECT * FROM matched_lines WHERE is_visible AND object_visible), summary AS (
 SELECT COALESCE(sum(CASE WHEN journal_date<$3::date THEN debit_amount-credit_amount ELSE 0 END),0) opening_balance,
 COALESCE(sum(CASE WHEN journal_date>=$3::date THEN debit_amount ELSE 0 END),0) period_debit,
 COALESCE(sum(CASE WHEN journal_date>=$3::date THEN credit_amount ELSE 0 END),0) period_credit,
 COALESCE(sum(debit_amount-credit_amount),0) closing_balance,
 count(CASE WHEN journal_date>=$3::date THEN 1 END) total_count FROM visible_lines
 ), running_lines AS (
 SELECT *,sum(debit_amount-credit_amount) OVER(ORDER BY journal_date,journal_created_at,journal_id,line_number,journal_line_id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) running_balance FROM visible_lines
 ), page AS (SELECT * FROM running_lines WHERE journal_date>=$3::date ORDER BY journal_date,journal_created_at,journal_id,line_number,journal_line_id LIMIT 100 OFFSET $10)
 SELECT summary.*,EXISTS(SELECT 1 FROM matched_lines WHERE NOT is_visible OR NOT object_visible) OR EXISTS(SELECT 1 FROM scoped_objects WHERE NOT object_visible) restricted,
 page.journal_line_id,page.journal_id,page.journal_date,page.journal_number,page.transaction_heading,page.description,page.journal_description,page.gl_account_code,page.gl_account_name,page.allocated_objects,page.debit_amount,page.credit_amount,page.running_balance
 FROM summary LEFT JOIN page ON true ORDER BY page.journal_date,page.journal_created_at,page.journal_id,page.line_number,page.journal_line_id`;
}
async function runStatement(ctx,access){
 const q=ctx.query,{meta:m,offset,children}=validate(q);
 const denied=await requireBusinessAccess(ctx,access,q.organisation_id);if(denied)fail(denied.body.error,denied.status);
 const record=await ctx.broker('core_erp','query',{text:`SELECT o.${m.id} object_id,o.${m.type} object_type_id,o.${m.code} object_code,o.${m.name} object_name,o.owner_division_id,t.type_name,org.organisation_name,org.base_currency_code FROM ${m.table} o JOIN ${m.types} t ON t.${m.type}=o.${m.type} AND t.tenant_id=o.tenant_id AND t.organisation_id=o.organisation_id JOIN erp_organisation org ON org.organisation_id=o.organisation_id AND org.tenant_id=o.tenant_id WHERE o.tenant_id=$1 AND o.organisation_id=$2 AND o.${m.id}=$3 AND o.${m.type}=$4`,values:[access.tenantId,q.organisation_id,q.object_id,q.object_type_id]});
 const object=record.rows[0];if(!object)fail('Object not found for the selected organisation and type',404);
 const moduleDenied=await requireModuleAccess(ctx,access,{organisationId:q.organisation_id,resourceKind:`${q.object_class}_type`,resourceCode:q.object_type_id});if(moduleDenied)fail(moduleDenied.body.error,moduleDenied.status);
 if(!await hasResourcePermission(ctx,access,{organisationId:q.organisation_id,divisionId:object.owner_division_id,resourceKind:q.object_class,resourceCode:q.object_type_id,workflowStatus:'view'}))fail('You do not have permission to view this object',403);
 if(q.gl_account_id){const gl=await ctx.broker('core_erp','query',{text:'SELECT account_code,account_name FROM erp_gl_account WHERE tenant_id=$1 AND organisation_id=$2 AND gl_account_id=$3',values:[access.tenantId,q.organisation_id,q.gl_account_id]});if(!gl.rows.length)fail('GL account not found in this organisation',404);object.gl_account=gl.rows[0];}
 const result=await ctx.broker('core_erp','query',{text:statementSql(q.object_class),values:[access.tenantId,q.organisation_id,q.date_from,q.date_to,q.object_id,children,access.auth.email,isAdministrator(access),q.gl_account_id||null,offset,q.division_id||null,q.include_child_divisions==='1']});
 const summary=result.rows[0];const rows=result.rows.filter(r=>r.journal_line_id).map(r=>Object.fromEntries(Object.entries(r).filter(([k])=>!['opening_balance','period_debit','period_credit','closing_balance','total_count','restricted'].includes(k))));
 return {division_id:q.division_id||null,include_child_divisions:q.include_child_divisions==='1',organisation_id:q.organisation_id,object_class:q.object_class,object_class_label:m.label,object,date_from:q.date_from,date_to:q.date_to,include_child_objects:children,hierarchy_basis:'current',currency_code:object.base_currency_code,gl_account_id:q.gl_account_id||null,opening_balance:String(summary.opening_balance),period_debit:String(summary.period_debit),period_credit:String(summary.period_credit),closing_balance:String(summary.closing_balance),restricted:summary.restricted===true||summary.restricted===1,total_count:Number(summary.total_count),offset,page_size:100,next_offset:offset+rows.length<Number(summary.total_count)?offset+rows.length:null,rows};
}
module.exports={classes,validate,statementSql,runStatement,objectVisibilitySql};
