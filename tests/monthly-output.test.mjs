import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';
import {outputSchema,permissionsOk,buildOutputRow,outputCell} from '../lib/monthly-output/pure.mjs';
import {createMonthlyOutputService,createOutputCore} from '../lib/monthly-output/service.mjs';
import {createOutputGoogle} from '../lib/monthly-output/google.mjs';
import {createStateStore} from '../lib/state-store.mjs';
import {validateCall} from '../lib/rpc-contract.mjs';import {POST} from '../app/api/rpc/route.js';
const digest=value=>createHash('sha256').update(value).digest('hex');
const roles={[digest('owner@example.test')]:'owner',[digest('writer@example.test')]:'writer'};
const grants=[{type:'user',emailAddress:'OWNER@example.test',role:'owner'},{type:'user',emailAddress:'writer@example.test',role:'writer'},{type:'anyone',role:'reader',allowFileDiscovery:false}];
const config={...outputSchema,id:'synthetic-spreadsheet-id',gid:123,tab:'月報ログ',approvedRoles:roles,enabled:true};
const entry={id:'00112233-4455-4677-8899-aabbccddeeff',name:'検証花子',month:'2026-10',draft:{good:'=SUM(A1:A2)',growth:'返金の対応をした。投稿の時間を見直した。',action:'継続する。',goal:'学び続ける。',reelPosts:'0',feedPosts:'2',storyDays:'31',followersStart:'100',followersEnd:'95'}};
const metrics={status:'ready',name:'検証花子',month:'2026-10',clients:3,revenue:1200};
const policy={revision:1,rules:[{id:'managed',reason:'確認',guidance:'取り組みを書く',words:['返金']}]};
test('live permission policy accepts only registered individual roles and non-discoverable link reading',()=>{
 assert(permissionsOk([grants],roles));assert(permissionsOk([grants.slice(0,2)],roles));
 for(const grant of [{type:'anyone',role:'writer',allowFileDiscovery:false},{type:'anyone',role:'reader',allowFileDiscovery:true},{type:'domain',role:'reader'},{type:'user',emailAddress:'unknown@example.test',role:'writer'},{type:'user',emailAddress:'owner@example.test',role:'reader'},{type:'user',emailAddress:'owner@example.test',role:'owner',pendingOwner:true},{type:'anyone',role:'reader',allowFileDiscovery:false,view:'published'}])assert.equal(permissionsOk([[...grants.slice(0,2),grant]],roles),false);
 assert.equal(permissionsOk([[...grants,...grants]],roles),false);assert.equal(permissionsOk([[grants[1]]],roles),false);assert.equal(permissionsOk([null],roles),false);
});
test('15-column row uses verified server metrics, screened text, explicit zeros, negative follower difference and literal formula strings',()=>{
 const row=buildOutputRow({...entry,clients:999,revenue:999},createOutputCore(policy),policy,metrics,'2026-11-22 20:00:00');
 assert.equal(row.length,15);assert.deepEqual(row.slice(0,11),['2026-10','2026-11-22 20:00:00','検証花子',3,1200,0,2,31,100,95,-5]);assert.equal(row[11],'=SUM(A1:A2)');assert.equal(row[12],'投稿の時間を見直した。');assert.deepEqual(outputCell(row[11]),{userEnteredValue:{stringValue:'=SUM(A1:A2)'}});
 assert.equal(buildOutputRow(entry,createOutputCore(policy),policy,{...metrics,name:'別人'},''),null);
 assert.equal(buildOutputRow({...entry,draft:{...entry.draft,storyDays:'32'}},createOutputCore(policy),policy,metrics,''),null);
 const zero=buildOutputRow(entry,createOutputCore(policy),policy,{...metrics,clients:0,revenue:0},'');assert.equal(zero[3],'');assert.equal(zero[4],'');
});
test('save rechecks ACL before append and prevents concurrent/restarted/retried duplicate rows, including an uncertain append',async()=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'monthly-output-')),file=path.join(folder,'state.json');
 try{await fs.writeFile(file,JSON.stringify({settings:{revision:0,words:[]},sessions:{},saved:{}}));let appends=0,checks=0,permission=true,uncertain=false;const hashes=new Set();
  const google={permissionPages:async()=>{checks++;return permission?[grants]:[[{type:'anyone',role:'writer'}]];},found:async(c,hash)=>hashes.has(hash),targetMatches:async()=>true,append:async(c,row,hash)=>{appends++;hashes.add(hash);if(uncertain)throw Error('network after committed write');}};
  const options={config,store:createStateStore(file),google,metrics:async()=>metrics,policy:async()=>policy,now:()=>new Date('2026-11-22T12:00Z')};const service=createMonthlyOutputService(options);
  assert.equal(await service.ready(),true);checks=0;
  const result=await Promise.all([service.save(entry),service.save(entry)]);assert(result.every(r=>r.status==='saved'));assert.equal(appends,1);assert(checks>=3);
  const restarted=createMonthlyOutputService({...options,store:createStateStore(file)});assert.equal((await restarted.save(entry)).status,'saved');assert.equal(appends,1);
  const other={...entry,id:'10112233-4455-4677-8899-aabbccddeeff'};uncertain=true;assert.equal((await restarted.save(other)).status,'unavailable');assert.equal((await restarted.save(other)).status,'saved');assert.equal(appends,2);
  permission=false;assert.equal((await restarted.save(entry)).status,'unavailable');assert.equal(await restarted.ready(),false);
  assert(!(await fs.readFile(file,'utf8')).includes(entry.name));
 }finally{await fs.rm(folder,{recursive:true,force:true});}
});
test('permission changes immediately before append, schema mismatch and rate limit all stop writing',async()=>{
 const state={settings:{revision:0,words:[]},sessions:{},saved:{}},store={transact:async fn=>fn(state)};let calls=0,writes=0;
 const google={permissionPages:async()=>++calls===1?[grants]:[],found:async()=>false,targetMatches:async()=>true,append:async()=>{writes++;}};
 const service=createMonthlyOutputService({config,store,google,metrics:async()=>metrics,policy:async()=>policy});assert.equal((await service.save(entry)).status,'unavailable');assert.equal(writes,0);
 const broken=createMonthlyOutputService({config:{...config,headers:['wrong']},store,google,metrics:async()=>metrics,policy:async()=>policy});assert.equal(await broken.ready(),false);
 state.outputRate={minute:Math.floor(Date.now()/60000),count:30};assert.equal((await service.save(entry)).status,'retry');assert.equal(writes,0);
});
test('Google adapter paginates uncached permissions, enforces fixed tab/schema and atomically pairs literal append with metadata',async()=>{
 const requests=[];const google=createOutputGoogle({auth:{getClient:async()=>({request:async request=>{requests.push(request);const url=new URL(request.url);if(url.hostname==='www.googleapis.com'&&!url.pathname.endsWith('/permissions'))return {data:{id:config.id,mimeType:'application/vnd.google-apps.spreadsheet',capabilities:{canShare:true}}};if(url.pathname.endsWith('/permissions'))return {data:url.searchParams.has('pageToken')?{permissions:grants.slice(1)}:{permissions:[grants[0]],nextPageToken:'two'}};if(url.pathname.includes('/values/'))return {data:{values:[config.headers]}};if(url.pathname.endsWith('/developerMetadata:search'))return {data:{matchedDeveloperMetadata:[]}};if(request.method==='POST')return {data:{}};return {data:{sheets:[{properties:{sheetId:config.gid,title:config.tab}}]}};}})}});
 assert.equal((await google.permissionPages(config)).length,2);assert.equal((await google.permissionPages(config)).length,2);assert.equal(requests.filter(r=>r.url.includes('/permissions?')).length,4);
 assert.equal(await google.targetMatches(config),true);assert.equal(await google.found(config,'hash'),false);await google.append(config,['=unsafe',0],'hash');
 const request=requests.at(-1);assert.equal(request.retry,false);assert.equal(request.data.requests.length,2);assert.equal(request.data.requests[0].appendCells.rows[0].values[0].userEnteredValue.stringValue,'=unsafe');assert.equal(request.data.requests[1].createDeveloperMetadata.developerMetadata.metadataValue,'hash');assert(requests.every(r=>['www.googleapis.com','sheets.googleapis.com'].includes(new URL(r.url).hostname)));
});
test('RPC admits a full Japanese draft without raising limits for unrelated methods',async()=>{
 const payload={...entry,draft:{good:'あ'.repeat(3000),growth:'い'.repeat(3000),action:'う'.repeat(3000),goal:'え'.repeat(3000)}};assert.equal(validateCall({method:'saveMonthlyOutput',args:[payload]}).method,'saveMonthlyOutput');assert.throws(()=>validateCall({method:'saveMonthlyOutput',args:[{...entry,id:'invalid'}]}));
 const originBefore=process.env.PORTAL_PUBLIC_ORIGIN,pathBefore=process.env.PORTAL_MONTHLY_OUTPUT_CONFIG_FILE;process.env.PORTAL_PUBLIC_ORIGIN='https://portal.example';process.env.PORTAL_MONTHLY_OUTPUT_CONFIG_FILE='';
 try{const request=body=>new Request('https://portal.example/aione-instagram/api/rpc',{method:'POST',headers:{origin:'https://portal.example','content-type':'application/json'},body:JSON.stringify(body)});const saved=await POST(request({method:'saveMonthlyOutput',args:[payload]}));assert.equal(saved.status,200);assert.equal((await saved.json()).status,'unavailable');assert.equal((await POST(request({method:'getData',args:['あ'.repeat(6000)]}))).status,413);}finally{for(const [key,value] of [['PORTAL_PUBLIC_ORIGIN',originBefore],['PORTAL_MONTHLY_OUTPUT_CONFIG_FILE',pathBefore]])if(value===undefined)delete process.env[key];else process.env[key]=value;}
});
