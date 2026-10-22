'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {brokerClient,smtpClient}=require('../index');
test('broker sends configured credentials and profile without leaking keys into payload',async()=>{
  let request;
  const broker=brokerClient({dbBrokerURL:'http://database.test:3001',dbBrokerProfiles:[{name:'erp',key:'secret'}]},async(url,options)=>{
    request={url,options};return {ok:true,json:async()=>({rows:[]})};
  });
  await broker('erp','query',{text:'SELECT 1'});
  assert.equal(request.url,'http://database.test:3001/api/broker/query');
  assert.equal(request.options.headers['x-core-key'],'secret');
  assert.deepEqual(JSON.parse(request.options.body),{brokerProfile:'erp',text:'SELECT 1'});
  await assert.rejects(brokerClient({})('erp','query'),/dbBrokerURL/);
});
test('smtp uses its own configured endpoint and fails safely when unreachable',async()=>{
  let payload;
  const smtp=smtpClient({smtpUrl:'http://mail.test:3002',smtpProfileKey:'secret'},async(url,options)=>{
    assert.equal(url,'http://mail.test:3002/api/mail/send');payload=JSON.parse(options.body);
    return {ok:true,json:async()=>({ok:true})};
  });
  await smtp('send',{profile:'mail',to:'test@example.test'});
  assert.equal(payload.profileKey,undefined);
  await assert.rejects(smtpClient({smtpUrl:'http://mail.test',smtpProfileKey:'secret'},async()=>{throw Error('offline');})('send',{profile:'mail'}),{status:503});
});
