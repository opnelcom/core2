'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {auth,signSession}=require('../api/_shared/session');
const config={sessionSecret:'test-only-session-secret'};
const user={user_id:'user-1',email:'user@example.test',user_type:'administration_user'};
test('SaaS signs and validates existing session format; rejects tampered, expired and incomplete tokens',()=>{
  const token=signSession(config,user);
  assert.equal(auth({config,cookies:{core_session:token}}).email,user.email);
  assert.equal(auth({config,cookies:{core_session:token+'bad'}}),null);
  const payload=Buffer.from(JSON.stringify({...user,exp:Date.now()-1})).toString('base64url');
  const signature=crypto.createHmac('sha256',config.sessionSecret).update(payload).digest('base64url');
  assert.equal(auth({config,cookies:{core_session:payload+'.'+signature}}),null);
  assert.equal(auth({config,cookies:{core_session:signSession(config,{})}}),null);
});
test('missing or placeholder signing secret is rejected',()=>{
  for(const sessionSecret of [undefined,'','change-me'])assert.throws(()=>signSession({sessionSecret},user),/sessionSecret/);
});
