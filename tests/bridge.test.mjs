import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHmac} from 'node:crypto';
import {signedEnvelope,callGas} from '../lib/gas-client.mjs';
const secret='synthetic-test-secret-which-is-not-a-live-credential';
function runtime(){
 const cache=new Map(),calls=[];
 const context=vm.createContext({
   portalBridgeConfig_:()=>({secret}),
   ContentService:{MimeType:{JSON:'json'},createTextOutput:value=>({setMimeType:()=>JSON.parse(value)})},
   Utilities:{Charset:{UTF_8:'utf8'},computeHmacSha256Signature:(message,key)=>[...createHmac('sha256',key).update(message).digest()]},
   CacheService:{getScriptCache:()=>({get:key=>cache.get(key),put:(key,value)=>cache.set(key,value)})},
   LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},
   getMonthlyReportInit:()=>{calls.push('init');return {students:[]};},
   getData:()=>{calls.push('data');return {students:[],months:[]};},
   sendLineMessage:()=>{throw new Error('Must never be exposed');}
 });
 vm.runInContext(fs.readFileSync(new URL('../gas/PortalBridge.gs',import.meta.url),'utf8'),context);
 return {calls,send:(envelope,target='monthly')=>context.portalBridgeRequest_({postData:{contents:JSON.stringify(envelope)}},target)};
}
test('signed request reaches the original read function, and a replay is rejected',()=>{
 const {send,calls}=runtime(),request=signedEnvelope({target:'monthly',method:'getMonthlyReportInit',args:[]},secret);
 assert.equal(send(request).ok,true);assert.equal(send(request).error,'unauthorized');assert.deepEqual(calls,['init']);
});
test('tampered, expired and cross-project requests never call an underlying function',()=>{
 for(const kind of ['signature','payload','expired','target']){
   const {send,calls}=runtime(),request=signedEnvelope({target:'monthly',method:'getMonthlyReportInit',args:[]},secret,kind==='expired'?Date.now()-120000:Date.now());
   if(kind==='signature')request.signature='0'.repeat(64);
   if(kind==='payload')request.payload=request.payload.replace('getMonthlyReportInit','getData');
   const result=send(request,kind==='target'?'dashboard':'monthly');assert.equal(result.ok,false);assert.deepEqual(calls,[]);
 }
});
test('even a correctly signed request cannot expose notification or arbitrary function names',()=>{
 for(const method of ['sendLineMessage','updateDataSheet','installDailyRevenueTrigger','constructor','__proto__']){
   const {send,calls}=runtime();assert.equal(send(signedEnvelope({target:'dashboard',method,args:[]},secret),'dashboard').ok,false);assert.deepEqual(calls,[]);
 }
});
test('Next server sends a signed POST to the fixed GAS endpoint and disables caching',async()=>{
 let captured;
 const call={target:'monthly',method:'getMonthlyReportInit',args:[]};
 const result=await callGas(call,{env:{GAS_BRIDGE_SECRET:secret,GAS_MONTHLY_URL:'https://script.google.com/macros/s/example/exec'},fetcher:async(url,options)=>{captured={url,options};return {ok:true,json:async()=>({ok:true,result:{students:[]}})};}});
 assert.deepEqual(result,{students:[]});assert.equal(captured.url.searchParams.get('portal_api'),'v1');assert.equal(captured.options.method,'POST');assert.equal(captured.options.cache,'no-store');assert(!captured.url.toString().includes(secret));
 const envelope=JSON.parse(captured.options.body);assert.equal(envelope.signature,createHmac('sha256',secret).update(envelope.timestamp+'.'+envelope.nonce+'.'+envelope.payload).digest('hex'));
});
test('configuration failures, login HTML and upstream failures never become zero-valued data',async()=>{
 await assert.rejects(callGas({target:'monthly'},{env:{}}),/not_configured/);
 await assert.rejects(callGas({target:'monthly'},{env:{GAS_BRIDGE_SECRET:secret,GAS_MONTHLY_URL:'https://attacker.invalid/exec'}}),/not_configured/);
 await assert.rejects(callGas({target:'monthly'},{env:{GAS_BRIDGE_SECRET:secret,GAS_MONTHLY_URL:'https://script.google.com/macros/s/example/exec'},fetcher:async()=>({ok:true,json:async()=>{throw new Error('HTML login')}})}),/upstream_unavailable/);
});
