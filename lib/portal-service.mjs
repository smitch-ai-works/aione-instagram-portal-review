import fs from 'node:fs/promises';
import {createSheetsReader} from './sheets-reader.mjs';
import {createStateStore} from './state-store.mjs';
import {createAdminService} from './admin-service.mjs';
import {createMonthlyOutputService} from './monthly-output/service.mjs';
import {japanMonth,reportMonths,eligibleStudents,monthlyFromRows,dashboardFromRows,nativeResultsRows,lineLinkFromRows,nameKey} from './portal-data.mjs';

export function createPortalService({env=process.env,reader=createSheetsReader({env}),store,config,now=()=>new Date()}={}){
 let configuration=config,admin,output;const inflight=new Map();
 async function getConfig(){if(!configuration){if(!env.PORTAL_SOURCE_CONFIG_FILE)throw Error('not_configured');try{configuration=JSON.parse(await fs.readFile(env.PORTAL_SOURCE_CONFIG_FILE,'utf8'));}catch{throw Error('not_configured');}}return configuration;}
 function getAdmin(){admin??=createAdminService({store:store||createStateStore(env.PORTAL_STATE_FILE),passwordHash:env.PORTAL_ADMIN_PASSWORD_HASH,now:()=>now().getTime()});return admin;}
 function getOutput(){output??=createMonthlyOutputService({env,now,policy:()=>getAdmin().policy(),metrics:async(name,month)=>{const s=await snapshot(month>=env.PORTAL_NATIVE_START_MONTH);return monthlyFromRows(s.rows,name,month,japanMonth(now()),s.config.hiddenNames);}});return output;}
 async function snapshot(native=true){
  if(!inflight.has(native))inflight.set(native,(async()=>{const c=await getConfig(),[results,source]=await Promise.all([reader.read(c.results),native?reader.read({...c.source,range:'A:H'}):null]);if(!results.rows?.length||(native&&!source.rows?.length))throw Error('source_unavailable');const checkedAt=new Date(Math.min(results.fetchedAt||now().getTime(),source?.fetchedAt||now().getTime())).toISOString();return {rows:native?nativeResultsRows(results.rows,source.rows,c,japanMonth(now()),env.PORTAL_NATIVE_START_MONTH):results.rows,config:c,checkedAt};})().finally(()=>{inflight.delete(native);}));
  return inflight.get(native);
 }
 return {async call({method,args}){
  switch(method){
   case 'getMonthlyReportPolicy':return getAdmin().policy();
   case 'adminLogin':return getAdmin().login(...args);
   case 'adminGetRules':return getAdmin().getRules(...args);
   case 'adminSaveRules':return getAdmin().saveRules(...args);
   case 'adminLogout':return getAdmin().logout(...args);
   case 'saveMonthlyOutput':return getOutput().save(args[0]);
   case 'getMonthlyReportInit':{const [s,monthlyOutputEnabled]=await Promise.all([snapshot(false),getOutput().ready()]),months=reportMonths(japanMonth(now()));return {students:eligibleStudents(s.rows,s.config.hiddenNames),months,defaultMonth:months[0],checkedAt:s.checkedAt,monthlyOutputEnabled};}
   case 'getMonthlyReportData':{const s=await snapshot(args[1]>=env.PORTAL_NATIVE_START_MONTH);return {...monthlyFromRows(s.rows,args[0],args[1],japanMonth(now()),s.config.hiddenNames),checkedAt:s.checkedAt};}
   case 'getData':{const s=await snapshot();return {...dashboardFromRows(s.rows,s.config.hiddenNames),checkedAt:s.checkedAt};}
   case 'getDashboardLineLink':{const c=await getConfig();if(nameKey(args[0])!==nameKey(c.lineLinkName))return {enabled:false};try{const s=await reader.read({...c.links,byId:true,range:'A:D'});return lineLinkFromRows(s.rows,s.formulas,args[0],c.lineLinkName);}catch{return {enabled:true,status:'unavailable'};}}
   default:throw Error('invalid_request');
  }
 }};
}
let portal;
export function callPortal(call){portal??=createPortalService();return portal.call(call);}
