'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const path=require('node:path'),{createRequire}=require('node:module');
const manifest=require('../package.json');
const lock=require('../package-lock.json');

test('built-in dependency versions are locked and contain no Core packages',()=>{
  for(const name of ['pg','nodemailer']){
    assert.equal(lock.packages['node_modules/'+name].version,manifest.dependencies[name]);
  }
  assert.ok(!Object.keys(lock.packages).some(name=>name.includes('@core/')));
});

test('a mounted-content API resolves technical packages from the parent Runtime installation',()=>{
  // Mirrors /app/content/api -> /app/node_modules using normal Node ancestor lookup.
  const apiRequire=createRequire(path.join(__dirname,'..','content','api','example.js'));
  assert.equal(typeof apiRequire('pg').Pool,'function');
  assert.equal(typeof apiRequire('nodemailer').createTransport,'function');
  assert.throws(()=>apiRequire.resolve('@core/identity-client'),{code:'MODULE_NOT_FOUND'});
});
