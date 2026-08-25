'use strict';

async function ensureTenantAuditColumns(ctx){
  await ctx.broker('core_saas','query',{
    text:`ALTER TABLE core_tenant
          ADD COLUMN IF NOT EXISTS created_by_user_id uuid REFERENCES core_user(user_id),
          ADD COLUMN IF NOT EXISTS updated_by_user_id uuid REFERENCES core_user(user_id)`,
    values:[]
  });
}

module.exports={ensureTenantAuditColumns};
