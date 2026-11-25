import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCall} from '../lib/rpc-contract.mjs';
import {POST} from '../app/api/rpc/route.js';
test('RPC exposes only the required application functions and validates admin save arguments',()=>{
 assert.equal(validateCall({method:'getData',args:[]}).target,'dashboard');
 for(const method of ['sendLineMessage','updateDataSheet','doPost','constructor','__proto__'])assert.throws(()=>validateCall({method,args:[]}));
 assert.throws(()=>validateCall({method:'adminSaveRules',args:['bad-token',['word'],0]}));
 assert.throws(()=>validateCall({method:'getMonthlyReportData',args:['name','2026-99']}));
 assert.throws(()=>validateCall({method:'getData',args:['unwanted argument']}));
});
test('HTTP boundary rejects other origins and unsupported or oversized requests before GAS access',async()=>{
 const previous=process.env.PORTAL_PUBLIC_ORIGIN;process.env.PORTAL_PUBLIC_ORIGIN='https://portal.example';
 const request=(body,origin='https://portal.example')=>new Request('https://portal.example/aione-instagram/api/rpc',{method:'POST',headers:{origin,'content-type':'application/json'},body});
 try{
   assert.equal((await POST(request('{"method":"getData","args":[]}','https://other.example'))).status,403);
   assert.equal((await POST(request('{"method":"sendLineMessage","args":[]}'))).status,400);
   assert.equal((await POST(request('x'.repeat(16001)))).status,413);
   assert.equal((await POST(request('invalid JSON'))).status,400);
 }finally{if(previous===undefined)delete process.env.PORTAL_PUBLIC_ORIGIN;else process.env.PORTAL_PUBLIC_ORIGIN=previous;}
});
