'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../api/_shared/erp/comments'),'utf8');
const org='11111111-1111-1111-1111-111111111111',id='22222222-2222-2222-2222-222222222222';
const kinds=['legal_entity','gl_account','subledger_account','accounting_object','accounting_dimension'];
function fixture(kind,{missing=false,permissionDenied=false,moduleDenied=false,authDenied=false}={}){
  const queries=[],permissions=[];
  const denied={status:403,body:{error:'Denied'}};
  const dependency={
    authTenant:async()=>authDenied?{status:401,body:{error:'Authentication required'}}:{tenantId:'tenant-a',auth:{email:'author@example.com'}},
    clean:value=>String(value??'').trim(),
    requireModuleAccess:async(_ctx,_access,options)=>{permissions.push({category:'module',...options});return moduleDenied?denied:null},
    requireResourcePermission:async(_ctx,_access,options)=>{permissions.push({category:'division',...options});return permissionDenied?denied:null},
    requireOrganisationResourcePermission:async(_ctx,_access,options)=>{permissions.push({category:'organisation',...options});return permissionDenied?denied:null},
  };
  const sandbox={module:{exports:{}},require:()=>dependency};
  vm.runInNewContext(source,sandbox);
  const ctx={req:{method:'POST'},query:{organisation_id:org,entity_kind:kind,entity_id:id},body:{organisation_id:org,entity_kind:kind,entity_id:id,comment_text:'  Comment\nwith detail  ',created_by_email:'spoof@example.com',created_at:'2000-01-01'},send:(status,body)=>({status,body}),broker:async(profile,action,query)=>{
    assert.equal(profile,'core_erp');assert.equal(action,'query');queries.push(query);
    if(query.text.includes(`FROM erp_${kind}`))return {rowCount:missing?0:1,rows:[{workflow_status:'draft',owner_division_id:'division-a',[`${kind}_type_id`]:'type-a'}]};
    return {rowCount:1,rows:[{comment_id:'comment-a',comment_text:'Comment',created_by_email:'author@example.com',created_at:'2026-10-13T09:00:00Z'}]};
  }};
  return {api:sandbox.module.exports,ctx,queries,permissions};
}
for(const kind of kinds){
  test(`${kind}: submit uses the saved record scope and edit permission`,async()=>{
    const f=fixture(kind);assert.equal((await f.api.submitComment(f.ctx)).status,201);
    assert.deepEqual(Array.from(f.queries[0].values),['tenant-a',org,id]);
    assert.match(f.queries[0].text,/workflow_status<>'deleted'/);
    const insert=f.queries.at(-1);
    assert.deepEqual(Array.from(insert.values),['tenant-a',org,kind,id,'Comment\nwith detail','author@example.com']);
    assert.ok(!insert.text.includes('created_at,'));
    const permission=f.permissions.at(-1);
    assert.equal(permission.resourceKind,kind);
    assert.equal(permission.organisationId,org);
    assert.equal(permission.workflowStatus,kind==='legal_entity'?'draft':['gl_account','subledger_account'].includes(kind)?'approved':'*');
    if(['subledger_account','accounting_object','accounting_dimension'].includes(kind)){
      assert.equal(permission.divisionId,'division-a');assert.equal(permission.resourceCode,'type-a');
      assert.equal(f.permissions[0].resourceKind,`${kind}_type`);
    }else assert.equal(permission.category,'organisation');
  });
  test(`${kind}: list is scoped, ordered and subject to edit permissions`,async()=>{
    const f=fixture(kind);assert.equal((await f.api.listComments(f.ctx)).comments.length,1);
    const query=f.queries.at(-1);
    assert.deepEqual(Array.from(query.values),['tenant-a',org,kind,id]);
    assert.match(query.text,/ORDER BY created_at DESC,comment_id DESC/);
    for(const operation of ['listComments','submitComment']){
      for(const [options,status] of [[{missing:true},404],[{permissionDenied:true},403],[{authDenied:true},401]]){
        const blocked=fixture(kind,options);assert.equal((await blocked.api[operation](blocked.ctx)).status,status);
        assert.ok(!blocked.queries.some(q=>q.text.includes('erp_record_comment')));
      }
    }
  });
}
test('module denial prevents comment reads and writes for configurable classes',async()=>{
  for(const kind of kinds.slice(2))for(const operation of ['listComments','submitComment']){
    const f=fixture(kind,{moduleDenied:true});assert.equal((await f.api[operation](f.ctx)).status,403);
    assert.equal(f.permissions.length,1);assert.equal(f.queries.length,1);
  }
});
test('invalid classes, missing saved IDs and blank comments cannot be inserted',async()=>{
  for(const changes of [{entity_kind:'journal'},{entity_kind:'erp_gl_account; DROP TABLE x'},{entity_id:''},{organisation_id:''},{entity_id:'invalid'},{comment_text:''},{comment_text:' \n '},{comment_text:42},{comment_text:'bad\u0000value'}]){
    const f=fixture('gl_account');Object.assign(f.ctx.body,changes);
    assert.equal((await f.api.submitComment(f.ctx)).status,400);
    assert.ok(!f.queries.some(q=>q.text.startsWith('INSERT')));
  }
});
test('comments have only list/create endpoints and reject non-POST submission',async()=>{
  const f=fixture('gl_account');f.ctx.req.method='DELETE';assert.equal((await f.api.submitComment(f.ctx)).status,405);
  assert.equal(f.queries.length,0);
  assert.deepEqual(fs.readdirSync(require('node:path').join(__dirname,'../api/comments')).sort(),['list.js','submit.js']);
});
