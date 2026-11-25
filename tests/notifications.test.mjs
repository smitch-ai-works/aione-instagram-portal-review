import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createStateStore} from '../lib/state-store.mjs';
import {createJobService} from '../lib/notifications/service.mjs';
import {createLineSender} from '../lib/notifications/sender.mjs';
import {buildNotificationReport,previousMonth,periodFor} from '../lib/notifications/reports.mjs';
import {dueJobs,validateSchedule} from '../tools/notification-worker.mjs';
import {POST} from '../app/api/jobs/[job]/route.js';

const date=new Date('2026-11-12T08:30:00+09:00');
const results=[['登録経路名','ふりがな','その他','累計集客','累計収益','26年11月集客','26年11月収益'],['検証花子','はなこ','',0,0,0,1200],['検証花子','はなこ','',0,0,0,600],['検証太郎','たろう','',0,0,0,1800],['非表示','ひひょうじ','',0,0,0,3000]];
const sourceHeader=['全シナリオ共通読者ID','LINE友達ID','共通ID','LINE登録名','メールアドレス','登録経路','配信基準日時','LINEアカウント番号'];
const source=[sourceHeader,['a','','','連絡名','a@example.test','検証花子','2026-11-01 08:00:00','@one'],['b','','','連絡名','a@example.test','検証花子','2026-11-02 08:00:00','@one'],['c','','','別名','b@example.test','検証太郎','2026-10-01 08:00:00','@two']];
const config={results:{id:'results'},source:{id:'source'},hiddenNames:['非表示'],fallbackNames:{},readerOverrides:{}};
const notificationConfig={token:'synthetic',recipient:'C'+'1'.repeat(32),minakoOwner:'検証花子',interviewHiddenNames:['非表示'],revenueHiddenNames:['非表示'],appointments:{minako:{id:'appointments-a'},textbook:{id:'appointments-b'}}};
const appointmentHeader=['導線名','日程','LINE名','名前','メールアドレス','','','','担当者','記入日','状態','備考'];
function reservation(email,status='',note='',entered='2026-11-01 10:00:00'){return ['@one','2026-11-20 10:00','連絡名','',email,'','','','担当',entered,status,note];}
const reservations={minako:[appointmentHeader,reservation('a@example.test'),reservation('cancel@example.test','キャンセル'),reservation('test@example.test','','テスト'),reservation('onecoin@example.test','','ワンコインコンサル')],textbook:[appointmentHeader]};
const input={results,source,config,notificationConfig,now:date,reservations};
test('all notification kinds preserve positive-revenue sums, ties, list deduplication, cancellation/test exclusions and onecoin inclusion',()=>{
 const list=buildNotificationReport('list-morning',input);assert.equal(list.people,1);assert(list.messages[0].altText.includes('1件'));
 const revenue=buildNotificationReport('revenue',input);assert.equal(revenue.people,2);const text=JSON.stringify(revenue.messages);assert(text.includes('1,800'));assert(!text.includes('非表示'));
 const previous=buildNotificationReport('previous-month',input);assert.equal(previous.month,'2026-10');assert(previous.messages[0].altText.includes('月間最終'));
 const interview=buildNotificationReport('interviews',input);assert.equal(interview.people,1);assert(interview.messages[0].altText.includes('2件'));assert(!JSON.stringify(interview.messages).includes('ワンコイン'));
 const invalid=structuredClone(input);invalid.reservations.minako[0][1]='違う列';assert.throws(()=>buildNotificationReport('interviews',invalid),/source_schema_changed/);
});
test('scheduler uses JST, month rollover and separate daily slots; maintenance is once per half-hour',()=>{
 assert.equal(previousMonth(new Date('2026-12-31T15:01Z')),'2026-12');
 assert.equal(periodFor('revenue',new Date('2026-11-11T15:00Z')),'2026-11-12');
 assert.equal(periodFor('maintenance',date),'2026-11-12T08:30');
 assert.deepEqual(dueJobs([{job:'interviews',hour:8,minute:30},{job:'previous-month',day:1,hour:8,minute:30}],date),['interviews']);
 assert.deepEqual(dueJobs([{job:'interviews',hour:8,minute:30}],new Date('2026-11-12T08:33:00+09:00')),['interviews']);assert.deepEqual(dueJobs([{job:'interviews',hour:8,minute:30}],new Date('2026-11-12T08:35:00+09:00')),[]);
 assert.throws(()=>validateSchedule([{job:'arbitrary',hour:8,minute:30}]),/invalid_schedule/);assert.throws(()=>validateSchedule([{job:'revenue',hour:25,minute:0}]),/invalid_schedule/);
});
test('interview exclusions are independent of management screens and required explicitly',()=>{
 const separate={...input,config:{...config,hiddenNames:['検証花子','非表示']},notificationConfig:{...notificationConfig,interviewHiddenNames:['非表示']}};
 assert.equal(buildNotificationReport('interviews',separate).people,1);
 assert.deepEqual(separate.config.hiddenNames,['検証花子','非表示']);
 assert.throws(()=>buildNotificationReport('interviews',{...separate,notificationConfig:{...notificationConfig,interviewHiddenNames:undefined}}),/interview_exclusions_not_configured/);
});
test('LINE sender uses only the fixed push API, token header and stable retry key; errors never expose the response payload',async()=>{
 let request;const send=createLineSender({...notificationConfig,fetcher:async(url,init)=>{request={url,...init};return new Response('',{status:200});}});
 await send({type:'text',text:'架空の確認'},'synthetic-retry-key');assert.equal(request.url,'https://api.line.me/v2/bot/message/push');assert.equal(request.headers['X-Line-Retry-Key'],'synthetic-retry-key');assert.equal(JSON.parse(request.body).to,notificationConfig.recipient);
 const accepted=createLineSender({...notificationConfig,fetcher:async()=>new Response('',{status:409,headers:{'x-line-accepted-request-id':'synthetic'}})});await accepted({type:'text',text:'x'},'same-key');
 const uncertain=createLineSender({...notificationConfig,fetcher:async()=>{throw Error('private server details');}});await assert.rejects(uncertain({type:'text',text:'x'},'same-key'),/^Error: line_outcome_uncertain$/);
 const denied=createLineSender({...notificationConfig,fetcher:async()=>new Response('private response',{status:401})});await assert.rejects(denied({type:'text',text:'x'},'same-key'),/^Error: line_rejected_401$/);
});
test('durable dispatch intent prevents concurrent, repeated and post-restart duplicate sends, including an uncertain outcome',async()=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'portal-dispatch-')),file=path.join(folder,'state.json');
 try{
  await fs.writeFile(file,JSON.stringify({settings:{revision:0,words:[]},sessions:{},deliveries:{}}));
  const store=createStateStore(file),env={PORTAL_JOBS_ENABLED:'true',PORTAL_JOB_OWNER:'next',PORTAL_JOBS_NOT_BEFORE:'2026-01-01T00:00:00Z'};let sends=0;
  const reader={read:async c=>({rows:c.id==='results'?results:source})},opts={env,reader,store,config,notificationConfig,now:()=>date,sender:async()=>{sends++;}};
  const service=createJobService(opts),statuses=await Promise.all([service.run('revenue'),service.run('revenue')]);assert.equal(sends,1);assert.deepEqual(statuses.map(r=>r.status).sort(),['already_attempted','sent']);
  assert.equal((await createJobService({...opts,store:createStateStore(file)}).run('revenue')).status,'already_attempted');
  const failed=createJobService({...opts,sender:async()=>{sends++;throw Error('network unknown');}});await assert.rejects(failed.run('list-morning'),/job_outcome_uncertain/);assert.equal((await failed.run('list-morning')).status,'already_attempted');
  const state=await store.read();assert(Object.values(state.deliveries).some(v=>v.status==='outcome_uncertain'));assert(!(await fs.readFile(file,'utf8')).includes('example.test'));
  assert.equal((await createJobService({...opts,env:{}}).run('revenue')).status,'disabled');
  assert.equal((await createJobService({...opts,env:{...env,PORTAL_JOBS_NOT_BEFORE:'2027-01-01'}}).run('revenue')).status,'before_cutover');
 }finally{await fs.rm(folder,{recursive:true,force:true});}
});
test('scheduled endpoint rejects missing authorization and arbitrary jobs without accessing a sender',async()=>{
 const previous=process.env.PORTAL_SCHEDULER_SECRET;process.env.PORTAL_SCHEDULER_SECRET='s'.repeat(64);
 try{assert.equal((await POST(new Request('https://example.test/api/jobs/revenue'),{params:Promise.resolve({job:'revenue'})})).status,403);assert.equal((await POST(new Request('https://example.test/api/jobs/arbitrary',{headers:{authorization:'Bearer '+'s'.repeat(64)}}),{params:Promise.resolve({job:'arbitrary'})})).status,404);}finally{if(previous===undefined)delete process.env.PORTAL_SCHEDULER_SECRET;else process.env.PORTAL_SCHEDULER_SECRET=previous;}
});
test('list acquisition failure preserves the legacy warning, once per period, without blocking a later successful report',async()=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'portal-warning-')),file=path.join(folder,'state.json');
 try{await fs.writeFile(file,JSON.stringify({settings:{revision:0,words:[]},sessions:{},deliveries:{}}));let broken=true;const sent=[];
  const service=createJobService({env:{PORTAL_JOBS_ENABLED:'true',PORTAL_JOB_OWNER:'next',PORTAL_JOBS_NOT_BEFORE:'2026-01-01T00:00Z'},store:createStateStore(file),config,notificationConfig,now:()=>date,reader:{read:async c=>{if(broken)throw Error('source_down');return {rows:c.id==='results'?results:source};}},sender:async message=>sent.push(message)});
  assert.equal((await service.run('list-morning')).status,'error_notified');assert.equal((await service.run('list-morning')).status,'already_attempted');broken=false;assert.equal((await service.run('list-morning')).status,'sent');assert.equal(sent.length,2);assert.equal(sent[0].type,'text');assert.equal(sent[1].type,'flex');
 }finally{await fs.rm(folder,{recursive:true,force:true});}
});
