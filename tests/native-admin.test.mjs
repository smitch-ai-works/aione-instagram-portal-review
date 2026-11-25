import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {hash} from 'bcryptjs';
import {createAdminService,validateWords} from '../lib/admin-service.mjs';
import {createStateStore} from '../lib/state-store.mjs';

test('native admin retains durable rules, revision conflicts, expiry, logout, password changes and throttling without GAS',async()=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'portal-admin-')),file=path.join(folder,'state.json');
 try{
  await fs.writeFile(file,JSON.stringify({settings:{revision:2,words:['返金']},sessions:{},failures:null}));
  const store=createStateStore(file),passwordHash=await hash('synthetic-admin-password',12);let time=1000;
  const admin=createAdminService({store,passwordHash,now:()=>time});assert.equal((await admin.getRules('f'.repeat(64))).status,'unauthorized');
  const signed=await admin.login('synthetic-admin-password');assert.equal(signed.status,'ok');
  const results=await Promise.all([admin.saveRules(signed.token,['変更A'],2),admin.saveRules(signed.token,['変更B'],2)]);assert.deepEqual(results.map(r=>r.status).sort(),['conflict','ok']);
  const restarted=createAdminService({store:createStateStore(file),passwordHash,now:()=>time});assert.equal((await restarted.getRules(signed.token)).revision,3);
  const serialized=await fs.readFile(file,'utf8');assert(!serialized.includes(signed.token));assert(!serialized.includes('synthetic-admin-password'));assert(!serialized.includes(passwordHash));
  const policy=await restarted.policy();assert.equal(policy.revision,3);assert(policy.rules.some(r=>r.patterns?.length));
  assert.equal((await restarted.saveRules(signed.token,['a\nb'],3)).status,'invalid_words');
  time=signed.expiresAt;assert.equal((await restarted.getRules(signed.token)).status,'unauthorized');time=2000;
  const second=await restarted.login('synthetic-admin-password');await restarted.logout(second.token);assert.equal((await restarted.getRules(second.token)).status,'unauthorized');
  const changed=createAdminService({store,passwordHash:await hash('different-admin-password',12),now:()=>time});assert.equal((await changed.getRules(signed.token)).status,'unauthorized');
  for(let i=0;i<5;i++)assert.equal((await restarted.login('wrong-password')).status,'invalid_password');assert.equal((await restarted.login('synthetic-admin-password')).status,'locked');time+=600001;assert.equal((await restarted.login('synthetic-admin-password')).status,'ok');
 }finally{await fs.rm(folder,{recursive:true,force:true});}
});
test('managed words preserve canonical normalization and limits',()=>{assert.deepEqual(validateWords(['ＡＩ','ai','返金']),['ＡＩ','返金']);for(const value of [['x\u2028y'],['x'.repeat(101)],Array(201).fill('a')])assert.throws(()=>validateWords(value),/invalid_words/);});
test('unavailable settings fail closed and never fall back to a default or GAS',async()=>{
 const admin=createAdminService({store:{read:async()=>{throw Error('state_unavailable');}},passwordHash:''});await assert.rejects(admin.policy(),/state_unavailable/);assert.equal((await admin.login('any-password')).status,'not_configured');
});
