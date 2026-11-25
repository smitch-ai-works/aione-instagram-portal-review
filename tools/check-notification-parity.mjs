// Compare against live GAS in a sandbox, never execute its network or writes.
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import {parse} from 'acorn';
import {isDeepStrictEqual} from 'node:util';
import {createSheetsReader} from '../lib/sheets-reader.mjs';
import {buildNotificationReport,tokyoParts} from '../lib/notifications/reports.mjs';
if(!process.env.LEGACY_DASHBOARD_PROJECT_ID)throw Error('LEGACY_DASHBOARD_PROJECT_ID is required for read-only source comparison');
process.env.TZ='Asia/Tokyo';
const now=new Date(),config=JSON.parse(await fs.readFile(process.env.PORTAL_SOURCE_CONFIG_FILE,'utf8')),notificationConfig=JSON.parse(await fs.readFile(process.env.PORTAL_NOTIFICATION_CONFIG_FILE,'utf8')),reader=createSheetsReader();
const [results,source,...reservationSheets]=await Promise.all([reader.read(config.results),reader.read({...config.source,range:'A:H'}),...Object.values(notificationConfig.appointments).map(s=>reader.read(s))]);
const reservations=Object.fromEntries(Object.keys(notificationConfig.appointments).map((kind,i)=>[kind,reservationSheets[i].rows]));
const auth=JSON.parse(await fs.readFile(path.join(process.env.USERPROFILE,'.clasprc.json'),'utf8')).tokens['monthly-report'];
const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:auth.client_id,client_secret:auth.client_secret,refresh_token:auth.refresh_token,grant_type:'refresh_token'})});if(!response.ok)throw Error('Source authentication failed');
const token=(await response.json()).access_token,content=await fetch('https://script.googleapis.com/v1/projects/'+process.env.LEGACY_DASHBOARD_PROJECT_ID+'/content',{headers:{authorization:'Bearer '+token}});if(!content.ok)throw Error('Source read failed');
const functions=new Map(),variables=new Map();for(const file of (await content.json()).files.filter(f=>f.type==='SERVER_JS'))for(const node of parse(file.source,{ecmaVersion:'latest'}).body){if(node.type==='FunctionDeclaration')functions.set(node.id.name,file.source.slice(node.start,node.end));if(node.type==='VariableDeclaration')for(const d of node.declarations)if(d.id.name)variables.set(d.id.name,file.source.slice(d.init.start,d.init.end));}
function sheet(rows){return {getLastRow:()=>rows.length,getDataRange:()=>({getValues:()=>structuredClone(rows)}),getRange:(r,c,h,w)=>{if(typeof r==='string')return {getValues:()=>rows.slice(1).map(row=>[row[0]])};const values=rows.slice(r-1,r-1+h).map(row=>Array.from({length:w},(_,i)=>row[c-1+i]??''));return {getValues:()=>structuredClone(values),getDisplayValues:()=>values.map(row=>row.map(String))};}};}
const storage=new Map(),messages=[];
class FixedDate extends Date{constructor(...args){super(...(args.length?args:[now.getTime()]));}static now(){return now.getTime();}}
const context=vm.createContext({Date:FixedDate,console:{log(){}},Logger:{log(){}},sendLineMessage:message=>messages.push(JSON.parse(JSON.stringify(message))),LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},PropertiesService:{getScriptProperties:()=>({getProperty:key=>storage.get(key),setProperty:(key,value)=>storage.set(key,value)})},Utilities:{newBlob:value=>({getBytes:()=>Buffer.from(value)}),sleep(){},formatDate:(date,zone,pattern)=>{const p=tokyoParts(date);return pattern.replace('yyyy',p.year).replace('MM',p.month).replace('dd',p.day).replace('HH',p.hour).replace('mm',p.minute).replace('ss','00');}},SpreadsheetApp:{openById:id=>({getSheetByName:()=>sheet(id===config.source.id?source.rows:results.rows),getSheetById:gid=>sheet(id===config.source.id?source.rows:id===config.results.id?results.rows:gid===notificationConfig.appointments.minako.gid?reservations.minako:reservations.textbook)})}});
const constantNames=['SPREADSHEET_ID','SOURCE_SS_ID','SOURCE_SHEET','LINE_ACCOUNT_NAME_FALLBACKS','READER_NAME_OVERRIDES','INTERVIEW_SOURCE_CONFIG','InterviewCore','InterviewFlex'];
const names=['getNameList','normalizeLineAccountId_','buildLineAccountResolution_','buildRosterTrie','resolveRosterName','readFromSource','formatToJPYearMonth','groupRankingEntries_','rankingTier_','makeRankingBubble_','buildRankingFlexMessages_','sendRankingFlexMessages_','notifyDailyReport','notifyPreviousMonthFinalReport','getCurrentMonthRevenueEntries_','makeRevenueRankingBubble_','buildRevenueFlexMessages_','notifyDailyRevenueReport','interviewSheetById_','interviewReadRows_','interviewReadAppointments_','interviewPrepareReport_'];
const sandboxCode=constantNames.map(name=>'const '+name+'='+variables.get(name)+';').join('\n')+'\n'+names.map(name=>functions.get(name)).join('\n');
vm.runInContext(sandboxCode,context,{timeout:10000});
for(const [job,expression] of [['list-morning','notifyDailyReport()'],['list-evening','notifyDailyReport()'],['revenue','notifyDailyRevenueReport()'],['previous-month','notifyPreviousMonthFinalReport()'],['interviews','sendLineMessage(InterviewFlex.build(interviewPrepareReport_(new Date())))']]){
 messages.length=0;storage.clear();vm.runInContext(expression,context,{timeout:60000});const native=buildNotificationReport(job,{results:results.rows,source:source.rows,reservations,config,notificationConfig,now});if(!isDeepStrictEqual(native.messages,messages))throw Error('Notification payload mismatch: '+job+' (inspect privately)');console.log(JSON.stringify({job,payloadMatchesLiveGas:true,messages:native.messages.length,sent:false}));
}
