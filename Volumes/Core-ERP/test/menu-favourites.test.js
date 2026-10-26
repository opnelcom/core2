'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const handler=require('../api/navigation/favourites');

function context(method='GET',body={},options={}){
  const calls=[];
  return {
    calls,req:{method},body,query:{organisation_id:'org'},cookies:{current_tenant:'tenant'},
    tenantSession:async function(){const auth=this.auth();return auth?{auth,tenantId:this.cookies.current_tenant}:{status:401,body:{error:"Authentication required"}};},auth:()=>options.unauthenticated?null:{user_id:'authenticated-user',email:'user@example.com'},
    send:(status,body)=>({status,body}),
    broker:async (name,operation,query)=>{
      calls.push(query);
      if(query.text.includes('to_regclass'))return {rows:[{favourite_table:options.missingTable?null:'erp_user_menu_favourite'}]};
      if(query.text.includes('SELECT item_key'))return {rows:[{item_key:'["view","dashboard"]'}]};
      if(query.text.includes('FROM erp_organisation_user'))return {rowCount:1,rows:[]};
      if(query.text.includes('FROM erp_organisation'))return {rowCount:options.missingOrg?0:1,rows:[]};
      return {rowCount:1,rows:[]};
    }
  };
}
test('reads favourites scoped to authenticated user, tenant and organisation',async()=>{
  const ctx=context();
  assert.deepEqual(await handler(ctx),{favourites:['["view","dashboard"]']});
  assert.deepEqual(ctx.calls.at(-1).values,['tenant','authenticated-user','org']);
});
test('add is idempotent and ignores a client supplied user identity',async()=>{
  const ctx=context('POST',{organisation_id:'org',user_id:'other-user',item_key:'["menuAction","init-schema"]',is_favourite:true});
  assert.deepEqual(await handler(ctx),{ok:true});
  assert.match(ctx.calls.at(-1).text,/ON CONFLICT DO NOTHING/);
  assert.deepEqual(ctx.calls.at(-1).values,['tenant','authenticated-user','org','["menuAction","init-schema"]']);
});
test('remove scopes its delete to the same user and organisation',async()=>{
  const ctx=context('POST',{organisation_id:'org',item_key:'["view","dashboard"]',is_favourite:false});
  await handler(ctx);
  assert.match(ctx.calls.at(-1).text,/DELETE.*tenant_id=\$1 AND user_id=\$2 AND organisation_id=\$3 AND item_key=\$4/);
});
test('rejects unauthenticated requests, unavailable organisations, and unsupported methods',async()=>{
  assert.equal((await handler(context('GET',{}, {unauthenticated:true}))).status,401);
  assert.equal((await handler(context('GET',{}, {missingOrg:true}))).status,404);
  assert.equal((await handler(context('DELETE'))).status,405);
});
test('rejects parent folders, malformed identifiers and non-boolean toggles',async()=>{
  for(const body of [
    {item_key:'["menuGroup","setup"]',is_favourite:true},
    {item_key:'invalid',is_favourite:true},
    {item_key:'["view","dashboard"]',is_favourite:'true'},
  ])assert.equal((await handler(context('POST',body))).status,400);
});
test('unmigrated databases allow menu loading and return a clear save error',async()=>{
  assert.deepEqual(await handler(context('GET',{}, {missingTable:true})),{favourites:[]});
  assert.equal((await handler(context('POST',{}, {missingTable:true}))).status,409);
});
