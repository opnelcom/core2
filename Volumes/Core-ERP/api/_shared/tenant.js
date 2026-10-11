'use strict';

async function authTenant(ctx){
  const membership=await ctx.tenantSession();
  if(membership.status)return membership;
  const {auth,tenantId}=membership;
  return {auth,tenantId};
}

module.exports={authTenant};
