import fs from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {createStateStore} from '../state-store.mjs';
import {createSheetsReader} from '../sheets-reader.mjs';
import {japanMonth} from '../portal-data.mjs';
import {planSheetMaintenance,applySheetMaintenance} from '../sheet-maintenance.mjs';
import {buildNotificationReport,jobNames,periodFor,tokyoParts} from './reports.mjs';
import {createLineSender} from './sender.mjs';

export function createJobService({env=process.env,reader=createSheetsReader({env}),store,config,notificationConfig,sender,maintenance=applySheetMaintenance,now=()=>new Date()}={}){
 let ledger=store;
 async function configs(){config??=JSON.parse(await fs.readFile(env.PORTAL_SOURCE_CONFIG_FILE,'utf8'));notificationConfig??=JSON.parse(await fs.readFile(env.PORTAL_NOTIFICATION_CONFIG_FILE,'utf8'));return {config,notificationConfig};}
 async function prepare(job,date=now()){
  if(!jobNames.includes(job))throw Error('unknown_job');const c=await configs();
  const [results,source]=await Promise.all([reader.read(c.config.results),reader.read({...c.config.source,range:'A:H'})]);
  if(job==='maintenance')return {plan:planSheetMaintenance(results.rows,source.rows,c.config,japanMonth(date)),messages:[],month:japanMonth(date)};
  let reservations;
  if(job==='interviews'){const pairs=await Promise.all(Object.entries(c.notificationConfig.appointments).map(async([kind,src])=>[kind,(await reader.read(src)).rows]));reservations=Object.fromEntries(pairs);}
  return buildNotificationReport(job,{results:results.rows,source:source.rows,reservations,...c,now:date});
 }
 return {prepare,async run(job){
  if(!jobNames.includes(job))throw Error('unknown_job');
  if(env.PORTAL_JOBS_ENABLED!=='true'||env.PORTAL_JOB_OWNER!=='next')return {status:'disabled'};
  const notBefore=Date.parse(env.PORTAL_JOBS_NOT_BEFORE||'');if(!Number.isFinite(notBefore))throw Error('cutover_time_required');if(now().getTime()<notBefore)return {status:'before_cutover'};
  if(job==='interviews'&&tokyoParts(now()).hour!=='08')return {status:'outside_scheduled_hour'};
  await configs();ledger??=createStateStore(env.PORTAL_NOTIFICATION_STATE_FILE);
  const runAt=now(),scope=job==='maintenance'?'sheet:'+config.results.id:'line:'+notificationConfig.recipient;
  let key=createHash('sha256').update(scope+':'+job+':'+periodFor(job,runAt)).digest('hex');
  // Preparation has no side effects; failures are safe to retry before claiming a dispatch.
  let report;
  try{report=await prepare(job,runAt);}catch(error){if(!['list-morning','list-evening'].includes(job))throw error;report={messages:[{type:'text',text:'⚠️ リスト通知の処理に失敗しました。確認が必要です。'}],failed:true};key+=':error';}
  if(job!=='maintenance'&&!report.messages.length)return {status:'empty',messages:0};
  const intent=await ledger.transact(state=>{state.deliveries??={};if(state.deliveries[key])return null;const entry={status:'sending',at:now().toISOString(),keys:report.messages.map(()=>randomUUID())};state.deliveries[key]=entry;return entry;});
  if(!intent)return {status:'already_attempted'};
  try{
   if(job==='maintenance')await maintenance(report.plan);
   else{const send=sender||createLineSender({token:notificationConfig.token,recipient:notificationConfig.recipient});for(let i=0;i<report.messages.length;i++){await send(report.messages[i],intent.keys[i]);await ledger.transact(state=>{state.deliveries[key].accepted=i+1;});if(i+1<report.messages.length)await new Promise(resolve=>setTimeout(resolve,1500));}}
   await ledger.transact(state=>{state.deliveries[key].status='sent';});return {status:report.failed?'error_notified':'sent',messages:report.messages.length};
  }catch{await ledger.transact(state=>{state.deliveries[key].status='outcome_uncertain';});throw Error('job_outcome_uncertain_check_before_retry');}
 }};
}
let service;
export function nativeJobs(){return service??=createJobService();}
