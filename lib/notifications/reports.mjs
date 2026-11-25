import {aggregateSourceRows} from '../source-aggregation.mjs';
import {japanMonth} from '../portal-data.mjs';
import {buildListMessages,buildRevenueMessages} from './legacy-renderers.mjs';
import InterviewCore from './interview-core.mjs';
import InterviewFlex from './interview-flex.mjs';

export const jobNames=['list-morning','list-evening','revenue','interviews','previous-month','maintenance'];
export function tokyoParts(now){return Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));}
export function periodFor(job,now){const p=tokyoParts(now),day=`${p.year}-${p.month}-${p.day}`;return job==='previous-month'?previousMonth(now):job==='maintenance'?day+'T'+p.hour+':'+String(Math.floor(Number(p.minute)/30)*30).padStart(2,'0'):day;}
export function previousMonth(now){const [year,month]=japanMonth(now).split('-').map(Number);return new Date(Date.UTC(year,month-2,1)).toISOString().slice(0,7);}
function checkHeaders(rows,expected){if(!rows?.length||Object.entries(expected).some(([i,value])=>String(rows[0]?.[i]||'').trim()!==value))throw Error('source_schema_changed');}
export function buildNotificationReport(job,{results,source,reservations,config,notificationConfig,now}){
 const month=job==='previous-month'?previousMonth(now):japanMonth(now);
 if(['list-morning','list-evening','previous-month'].includes(job)){
  const roster=new Set(results.slice(1).map(row=>String(row[0]||'').trim()).filter(Boolean)),counts=new Map();
  for(const [name,ts] of aggregateSourceRows(source.slice(1),results,config))if(roster.has(name)&&String(ts).startsWith(month))counts.set(name,(counts.get(name)||0)+1);
  const entries=[...counts].sort((a,b)=>b[1]-a[1]);
  return {month,messages:entries.length||job==='previous-month'?buildListMessages(month,entries,job==='previous-month'):[],people:entries.length};
 }
 if(job==='revenue'){
  const label=month.slice(2,4)+'年'+month.slice(5)+'月収益',index=results[0].indexOf(label);if(index<0)throw Error('revenue_column_missing');
  const hidden=new Set(notificationConfig.revenueHiddenNames),totals=new Map();
  for(const row of results.slice(1)){const name=String(row[0]||'').trim();if(!name||hidden.has(name))continue;const amount=Number(String(row[index]||0).replace(/[^0-9.-]/g,''))||0;if(amount>0)totals.set(name,(totals.get(name)||0)+amount);}
  const entries=[...totals].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'ja'));
  return {month,messages:buildRevenueMessages(month,entries),people:entries.length};
 }
 if(job==='interviews'){
  checkHeaders(results,{0:'登録経路名',1:'ふりがな'});
  checkHeaders(source,{0:'全シナリオ共通読者ID',3:'LINE登録名',4:'メールアドレス',5:'登録経路',6:'配信基準日時',7:'LINEアカウント番号'});
  for(const rows of Object.values(reservations))checkHeaders(rows,{0:'導線名',1:'日程',2:'LINE名',4:'メールアドレス',8:'担当者',9:'記入日'});
  if(!Array.isArray(notificationConfig.interviewHiddenNames))throw Error('interview_exclusions_not_configured');
  const report=InterviewCore.aggregate({month,reservations,roster:results.slice(1).map(r=>r[0]).filter(Boolean),sourceRows:source.slice(1).filter(row=>InterviewCore.slotKey(row[6]).slice(0,7)>='2026-02'),confirmedAccountFallbacks:config.fallbackNames,readerOverrides:config.readerOverrides,hiddenNames:notificationConfig.interviewHiddenNames,minakoOwner:notificationConfig.minakoOwner,statusBasis:'sheet'});
  return {month,messages:[InterviewFlex.build(report)],people:report.students.length};
 }
 throw Error('unknown_job');
}
