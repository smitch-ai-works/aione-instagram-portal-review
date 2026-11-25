// Read-only real-source comparison. Reports counts/booleans only, never records or credentials.
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import {isDeepStrictEqual} from 'node:util';
import {parse} from 'acorn';
import {createSheetsReader} from '../lib/sheets-reader.mjs';
import {dashboardFromRows,eligibleStudents,monthlyFromRows,japanMonth,reportMonths,nativeResultsRows} from '../lib/portal-data.mjs';
import {aggregateSourceRows} from '../lib/source-aggregation.mjs';
import {createPortalService} from '../lib/portal-service.mjs';
import {callGas} from '../lib/gas-client.mjs';

if(!process.env.LEGACY_DASHBOARD_PROJECT_ID)throw Error('LEGACY_DASHBOARD_PROJECT_ID is required for read-only source comparison');
const check=(condition,message)=>{if(!condition)throw Error(message);};
const config=JSON.parse(await fs.readFile(process.env.PORTAL_SOURCE_CONFIG_FILE,'utf8')),reader=createSheetsReader();
const [results,source,legacyDashboard,legacyInit,legacyPolicy]=await Promise.all([
 reader.read(config.results),reader.read({...config.source,range:'A:H'}),
 callGas({target:'dashboard',method:'getData',args:[]}),callGas({target:'monthly',method:'getMonthlyReportInit',args:[]}),callGas({target:'monthly',method:'getMonthlyReportPolicy',args:[]})
]);
check(isDeepStrictEqual(dashboardFromRows(results.rows,config.hiddenNames),legacyDashboard),'Direct workbook dashboard differs from existing GAS; inspect privately');
check(isDeepStrictEqual(eligibleStudents(results.rows,config.hiddenNames),legacyInit.students),'Direct workbook roster differs from existing GAS');
const credentials=JSON.parse(await fs.readFile(path.join(process.env.USERPROFILE,'.clasprc.json'),'utf8')).tokens[process.env.CLASP_USER||'monthly-report'];
const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:credentials.client_id,client_secret:credentials.client_secret,refresh_token:credentials.refresh_token,grant_type:'refresh_token'})});
check(response.ok,'Legacy source authentication unavailable');const token=(await response.json()).access_token;
const scriptResponse=await fetch(`https://script.googleapis.com/v1/projects/${process.env.LEGACY_DASHBOARD_PROJECT_ID}/content`,{headers:{authorization:'Bearer '+token}});check(scriptResponse.ok,'Legacy source read unavailable');const files=(await scriptResponse.json()).files;
const functions=new Map();for(const file of files.filter(f=>f.type==='SERVER_JS'))for(const node of parse(file.source,{ecmaVersion:'latest'}).body)if(node.type==='FunctionDeclaration')functions.set(node.id.name,file.source.slice(node.start,node.end));
const sourceSheet={getLastRow:()=>source.rows.length,getRange:()=>({getValues:()=>structuredClone(source.rows.slice(1).map(row=>row.slice(0,8)))})};
const resultSheet={getLastRow:()=>results.rows.length,getRange:()=>({getValues:()=>results.rows.slice(1).map(row=>[row[0]])})};
const context=vm.createContext({SpreadsheetApp:{openById:id=>({getSheetByName:()=>id===config.source.id?sourceSheet:resultSheet})}});
const code='const SPREADSHEET_ID='+JSON.stringify(config.results.id)+',SOURCE_SS_ID='+JSON.stringify(config.source.id)+',SOURCE_SHEET='+JSON.stringify(config.source.tab)+',LINE_ACCOUNT_NAME_FALLBACKS='+JSON.stringify(config.fallbackNames)+',READER_NAME_OVERRIDES='+JSON.stringify(config.readerOverrides)+';\n'+['getNameList','normalizeLineAccountId_','buildLineAccountResolution_','buildRosterTrie','resolveRosterName','readFromSource'].map(name=>functions.get(name)).join('\n');
vm.runInContext(code,context,{timeout:15000});const original=JSON.parse(vm.runInContext('JSON.stringify(readFromSource())',context,{timeout:30000}));
check(isDeepStrictEqual(aggregateSourceRows(source.rows.slice(1),results.rows,config),original),'Source attribution/deduplication differs from original GAS');
const service=createPortalService({reader}),policy=await service.call({method:'getMonthlyReportPolicy',args:[]});check(isDeepStrictEqual(policy,legacyPolicy),'Imported NG settings differ from current GAS');
const months=reportMonths(japanMonth());let ready=0;
for(const month of months){const person=legacyInit.students.find(person=>monthlyFromRows(results.rows,person.name,month,japanMonth(),config.hiddenNames).status==='ready');if(!person)continue;const old=await callGas({target:'monthly',method:'getMonthlyReportData',args:[person.name,month]});check(isDeepStrictEqual(monthlyFromRows(results.rows,person.name,month,japanMonth(),config.hiddenNames),old),'Monthly values differ from existing GAS');ready++;}
const native=nativeResultsRows(results.rows,source.rows,config,japanMonth(),process.env.PORTAL_NATIVE_START_MONTH);
const dashboard=dashboardFromRows(native,config.hiddenNames),nativeRead=await service.call({method:'getData',args:[]});
check(isDeepStrictEqual(dashboard.students,nativeRead.students),'Native service differs from the independently calculated source snapshot');
console.log(JSON.stringify({directSheetConnection:true,allDashboardStudentsMatchLegacy:true,dashboardRosterCount:legacyDashboard.students.length,monthCount:legacyDashboard.months.length,monthlyRosterMatchesLegacy:true,monthlyChecksPassed:ready,sourceRowCount:source.rows.length-1,deduplicatedReadersMatchOriginal:true,selectedReaders:original.length,ngSettingsMatchLegacy:true,nativeAggregationLoaded:true,gasSourcesChanged:false,sourceSheetsWritten:false,notificationsSent:false}));
