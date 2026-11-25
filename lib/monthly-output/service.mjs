import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {createStateStore} from '../state-store.mjs';
import {createOutputGoogle} from './google.mjs';
import {buildOutputRow,permissionsOk,outputSchema} from './pure.mjs';

let coreSource;
export function createOutputCore(policy){coreSource??=fs.readFileSync(path.join(process.cwd(),'public/legacy/report-core.js'),'utf8');const context=vm.createContext({MonthlyReportNgRules:policy});vm.runInContext(coreSource,context,{timeout:1000});return context.MonthlyReport;}
export function validOutputEntry(entry){return !!entry&&typeof entry==='object'&&!Array.isArray(entry)&&typeof entry.id==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(entry.id)&&typeof entry.name==='string'&&entry.name.length<=100&&typeof entry.month==='string'&&/^20\d{2}-(0[1-9]|1[0-2])$/.test(entry.month)&&JSON.stringify(entry).length<=15000;}
function stamp(now){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(now);}
export function createMonthlyOutputService({env=process.env,config,store,google=createOutputGoogle(),metrics,policy,now=()=>new Date()}={}){
 let configuration=config,ledger=store;
 async function getConfig(){if(!configuration){if(!env.PORTAL_MONTHLY_OUTPUT_CONFIG_FILE)return null;try{configuration=JSON.parse(await fsp.readFile(env.PORTAL_MONTHLY_OUTPUT_CONFIG_FILE,'utf8'));}catch{return null;}}if(configuration.enabled!==true||!configuration.approvedRoles)return null;for(const key of ['headers','fields','counts','key'])if(JSON.stringify(configuration[key])!==JSON.stringify(outputSchema[key]))return null;return configuration;}
 async function allowed(c){const pages=await google.permissionPages(c);return !!pages&&permissionsOk(pages,c.approvedRoles);}
 return {async ready(){try{const c=await getConfig();if(!c)return false;ledger??=createStateStore(env.PORTAL_MONTHLY_OUTPUT_STATE_FILE);await ledger.read();return await allowed(c);}catch{return false;}},async save(entry){
  if(!validOutputEntry(entry))return {status:'retry'};
  try{
   const c=await getConfig();if(!c)return {status:'unavailable'};ledger??=createStateStore(env.PORTAL_MONTHLY_OUTPUT_STATE_FILE);
   return await ledger.transact(async state=>{
    const minute=Math.floor(now().getTime()/60000);if(state.outputRate?.minute!==minute)state.outputRate={minute,count:0};if(!Number.isSafeInteger(state.outputRate.count)||state.outputRate.count>=30)return {status:'retry'};state.outputRate.count++;
    if(!await allowed(c))return {status:'unavailable'};
    const hash=createHash('sha256').update(entry.id.toLowerCase()).digest('hex');state.saved??={};
    if(state.saved[hash]||await google.found(c,hash))return {status:'saved'};
    const [rules,values]=await Promise.all([policy(),metrics(entry.name,entry.month)]),row=buildOutputRow(entry,createOutputCore(rules),rules,values,stamp(now()));
    if(!row)return {status:'retry'};
    if(!await google.targetMatches(c)||!await allowed(c))return {status:'unavailable'};
    await google.append(c,row,hash);state.saved[hash]=true;return {status:'saved'};
   });
  }catch(error){return {status:error.message==='busy'?'retry':'unavailable'};}
 }};
}
