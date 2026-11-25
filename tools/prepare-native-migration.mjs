// Read-only migration of configuration. No GAS source/deployment, sheet or trigger writes.
// Credentials and private configuration are written ONLY to ignored local paths.
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import {parse} from 'acorn';
import {callGas} from '../lib/gas-client.mjs';
import {unzipSync,strFromU8} from 'fflate';
import {XMLParser} from 'fast-xml-parser';

const projectId=process.env.LEGACY_DASHBOARD_PROJECT_ID;
if(!/^[\w-]{20,150}$/.test(projectId||''))throw Error('Set LEGACY_DASHBOARD_PROJECT_ID to the existing project');
const claspPath=path.join(process.env.USERPROFILE||process.env.HOME,'.clasprc.json');
const credentials=JSON.parse(await fs.readFile(claspPath,'utf8')).tokens[process.env.CLASP_USER||'monthly-report'];
const tokenResponse=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:credentials.client_id,client_secret:credentials.client_secret,refresh_token:credentials.refresh_token,grant_type:'refresh_token'})});
if(!tokenResponse.ok)throw Error('Google source read authentication failed');
const token=(await tokenResponse.json()).access_token;
const response=await fetch(`https://script.googleapis.com/v1/projects/${projectId}/content`,{headers:{authorization:'Bearer '+token}});
if(!response.ok)throw Error('Source read failed');const files=(await response.json()).files;
const main=files.find(f=>f.name==='コード').source;
const parsed=files.filter(f=>f.type==='SERVER_JS').map(f=>({source:f.source,ast:parse(f.source,{ecmaVersion:'latest'})}));
function declaration(name){for(const {source,ast} of parsed)for(const node of ast.body){if(node.type==='FunctionDeclaration'&&node.id.name===name)return source.slice(node.start,node.end);if(node.type==='VariableDeclaration')for(const d of node.declarations)if(d.id.name===name)return source.slice(d.init.start,d.init.end);}throw Error('Missing source declaration: '+name);}
const constant=name=>vm.runInNewContext('('+declaration(name)+')',{}, {timeout:1000});
const local='.local';await fs.mkdir(local,{recursive:true});
const seed=JSON.parse(await fs.readFile(process.env.PORTAL_MIGRATION_CONFIG_FILE||path.join(local,'source-config.json'),'utf8'));
if(!/^[\w-]{20,150}$/.test(seed.links?.id||'')||!Array.isArray(seed.hiddenNames)||!seed.hiddenNames.every(name=>typeof name==='string')||typeof seed.lineLinkName!=='string'||!seed.lineLinkName.trim())throw Error('Private migration settings required');
const config={results:{id:constant('SPREADSHEET_ID'),tab:'SNSコンサル報酬管理シート',gid:seed.results?.gid},source:{id:constant('SOURCE_SS_ID'),tab:constant('SOURCE_SHEET'),gid:seed.source?.gid},links:{id:seed.links.id,gid:0},fallbackNames:constant('LINE_ACCOUNT_NAME_FALLBACKS'),readerOverrides:constant('READER_NAME_OVERRIDES'),hiddenNames:seed.hiddenNames,lineLinkName:seed.lineLinkName};
const linkResponse=await fetch(`https://docs.google.com/spreadsheets/d/${config.links.id}/export?format=xlsx&gid=0`);
if(!linkResponse.ok)throw Error('LINE source read failed');
const zipped=unzipSync(new Uint8Array(await linkResponse.arrayBuffer()),{filter:entry=>entry.name==='xl/workbook.xml'});
const workbook=new XMLParser({ignoreAttributes:false,attributeNamePrefix:'@'}).parse(strFromU8(zipped['xl/workbook.xml']));
const tabs=[workbook.workbook.sheets.sheet].flat();
if(tabs.length!==1)throw Error('Confirm original gid=0 tab name before migrating LINE links');
config.links.tab=tabs[0]['@name'];
const functions=['normalizeLineAccountId_','buildLineAccountResolution_','buildRosterTrie','resolveRosterName'].map(declaration).join('\n');
let sourceRead=declaration('readFromSource');
const start=sourceRead.indexOf('  const accountResolution =');
if(start<0)throw Error('Unexpected source reader shape');
sourceRead='function readFromSource() {\n  const rows = sourceRows;\n'+sourceRead.slice(start);
sourceRead=sourceRead.replace(/  if \(arguments\[0\] && arguments\[0\]\.notifyIssues\) \{[^]*?\n  \}\n/,'');
const engine='// Ported from existing GAS pure matching/deduplication logic. No GAS APIs or writes.\nexport function aggregateSourceRows(sourceRows,resultRows,config={}) {\n const LINE_ACCOUNT_NAME_FALLBACKS=config.fallbackNames||{},READER_NAME_OVERRIDES=config.readerOverrides||{};\n const getNameList=()=>new Set(resultRows.slice(1).map(row=>String(row[0]||\'\').trim()).filter(Boolean));\n'+functions+'\n'+sourceRead+'\n return readFromSource();\n}\n';
if(/SpreadsheetApp|PropertiesService|UrlFetchApp|ScriptApp/.test(engine))throw Error('Unported GAS dependency in aggregation engine');
await fs.writeFile('lib/source-aggregation.mjs',engine);
const policy=await callGas({target:'monthly',method:'getMonthlyReportPolicy',args:[]});
const adminConfig=await fs.readFile(process.env.LEGACY_ADMIN_CONFIG_PATH,'utf8');
const passwordHash=vm.runInNewContext(adminConfig+';monthlyAdminConfig_().passwordHash',{}, {timeout:1000});
const state={settings:{revision:policy.revision,words:policy.rules.find(r=>r.id==='managed-words')?.words||[]},sessions:{},failures:null};
await fs.writeFile(path.join(local,'source-config.json'),JSON.stringify(config),{mode:0o600});
try{await fs.writeFile(path.join(local,'portal-state.json'),JSON.stringify(state),{flag:'wx',mode:0o600});}catch(error){if(error.code!=='EEXIST')throw error;}
let env=await fs.readFile('.env.local','utf8');
const values={PORTAL_SOURCE_CONFIG_FILE:path.resolve(local,'source-config.json'),PORTAL_STATE_FILE:path.resolve(local,'portal-state.json'),PORTAL_ADMIN_PASSWORD_HASH:passwordHash,PORTAL_SHEETS_TRANSPORT:'xlsx',PORTAL_NATIVE_START_MONTH:'2026-11'};
for(const [key,value] of Object.entries(values)){env=env.replace(new RegExp('^'+key+'=.*(?:\\r?\\n|$)','gm'),'');env+='\n'+key+'='+value;}
await fs.writeFile('.env.local',env,{mode:0o600});
console.log(JSON.stringify({nativeAggregationPorted:true,sourceConfigImported:true,adminPasswordImported:true,ngSettingsImported:true,legacyGasChanged:false,sourceSheetsWritten:false}));
