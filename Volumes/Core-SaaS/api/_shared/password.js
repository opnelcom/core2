'use strict';
const crypto=require('crypto');
const {promisify}=require('util');
const scrypt=promisify(crypto.scrypt);

async function hash(password){
  const salt=crypto.randomBytes(16).toString('hex');
  const key=await scrypt(password,salt,64);
  return `${salt}:${Buffer.from(key).toString('hex')}`;
}

async function verify(password,stored){
  const [salt,hex]=String(stored||'').split(':');
  if(!salt||!hex)return false;
  const key=await scrypt(password,salt,64);
  const expected=Buffer.from(hex,'hex');
  const actual=Buffer.from(key);
  return expected.length===actual.length&&crypto.timingSafeEqual(expected,actual);
}

module.exports={hash,verify};
