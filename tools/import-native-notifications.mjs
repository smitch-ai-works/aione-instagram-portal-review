// One-time, read-only extraction. Secrets stay in ignored .local/ files.
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import {parse} from 'acorn';
import {unzipSync,strFromU8} from 'fflate';
import {XMLParser} from 'fast-xml-parser';
import {readWorkbook} from '../lib/xlsx-reader.mjs';
const privateSettings=JSON.parse(await fs.readFile(process.env.PORTAL_NOTIFICATION_IMPORT_CONFIG_FILE||'.local/notification-config.json','utf8'));
if(!Array.isArray(privateSettings.revenueHiddenNames)||!privateSettings.revenueHiddenNames.every(name=>typeof name==='string'))throw Error('Private revenue exclusions required');
const auth=JSON.parse(await fs.readFile(path.join(process.env.USERPROFILE,'.clasprc.json'),'utf8')).tokens['monthly-report'];
const tokenResponse=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:auth.client_id,client_secret:auth.client_secret,refresh_token:auth.refresh_token,grant_type:'refresh_token'})});
if(!tokenResponse.ok)throw Error('Source authentication failed');
const token=(await tokenResponse.json()).access_token;
const response=await fetch('https://script.googleapis.com/v1/projects/'+process.env.LEGACY_DASHBOARD_PROJECT_ID+'/content',{headers:{authorization:'Bearer '+token}});
if(!response.ok)throw Error('Source read failed');const files=(await response.json()).files;
const functions=new Map(),variables=new Map();
for(const file of files.filter(f=>f.type==='SERVER_JS'))for(const node of parse(file.source,{ecmaVersion:'latest'}).body){if(node.type==='FunctionDeclaration')functions.set(node.id.name,file.source.slice(node.start,node.end));if(node.type==='VariableDeclaration')for(const d of node.declarations)if(d.id.name)variables.set(d.id.name,file.source.slice(d.init.start,d.init.end));}
const names=['formatToJPYearMonth','groupRankingEntries_','rankingTier_','makeRankingBubble_','buildRankingFlexMessages_','makeRevenueRankingBubble_','buildRevenueFlexMessages_'];
const renderers=names.map(name=>{if(!functions.has(name))throw Error('Missing renderer '+name);return functions.get(name);}).join('\n').replace(/[ \t]+$/gm,'');
if(/LINE_TOKEN|LINE_GROUP_ID|UrlFetchApp|SpreadsheetApp/.test(renderers))throw Error('Unexpected renderer dependency');
await fs.mkdir('lib/notifications',{recursive:true});
await fs.writeFile('lib/notifications/legacy-renderers.mjs','// Pure Flex renderers ported from the live GAS source.\nconst Utilities={newBlob:value=>({getBytes:()=>Buffer.from(value)})};\n'+renderers+'\nexport {buildRankingFlexMessages_ as buildListMessages,buildRevenueFlexMessages_ as buildRevenueMessages};\n');
const minakoOwner=variables.get('InterviewCore').match(/input\.minakoOwner \|\| '([^']+)'/)?.[1];if(!minakoOwner)throw Error('Interview owner configuration missing');
for(const [variable,target] of [['InterviewCore','interview-core'],['InterviewFlex','interview-flex']]){let code=variables.get(variable);if(!code)throw Error('Missing '+variable);if(variable==='InterviewCore')code=code.replace(/input\.minakoOwner \|\| '[^']+'/g,"input.minakoOwner || ''");await fs.writeFile('lib/notifications/'+target+'.mjs','// Pure logic ported from the live GAS source.\nconst '+variable+'='+code+';\nexport default '+variable+';\n');}
const sender=parse(functions.get('sendLineMessage'),{ecmaVersion:'latest'}).body[0];const secrets={};
for(const node of sender.body.body)if(node.type==='VariableDeclaration')for(const d of node.declarations)if(['LINE_TOKEN','LINE_GROUP_ID'].includes(d.id.name)&&d.init.type==='Literal')secrets[d.id.name]=d.init.value;
if(!secrets.LINE_TOKEN||!secrets.LINE_GROUP_ID)throw Error('Sender configuration missing');
const original=vm.runInNewContext('('+variables.get('INTERVIEW_SOURCE_CONFIG')+')');
const appointmentResponse=await fetch(`https://docs.google.com/spreadsheets/d/${original.appointments}/export?format=xlsx`);if(!appointmentResponse.ok)throw Error('Appointment source unavailable');
const bytes=new Uint8Array(await appointmentResponse.arrayBuffer());const zip=unzipSync(bytes,{filter:e=>e.name==='xl/workbook.xml'});const xml=new XMLParser({ignoreAttributes:false,attributeNamePrefix:'@'}).parse(strFromU8(zip['xl/workbook.xml']));const tabs=[xml.workbook.sheets.sheet].flat().map(s=>s['@name']);
async function sourceById(gid){
 const r=await fetch(`https://docs.google.com/spreadsheets/d/${original.appointments}/gviz/tq?gid=${gid}&headers=0&range=A1:L3&tqx=out:json`);const text=await r.text();const start=text.indexOf('{'),end=text.lastIndexOf('}');const query=JSON.parse(text.slice(start,end+1));if(query.status!=='ok')throw Error('Stable tab verification failed');
 const sample=query.table.rows.map(row=>row.c.map(c=>c?.v??''));
 const matches=tabs.filter(tab=>{const sheet=readWorkbook(bytes,tab);return sample.every((row,i)=>[0,2,4].every(j=>String(row[j]??'')===String(sheet.rows[i]?.[j]??'')));});
 if(matches.length!==1)throw Error('Appointment tab identity is ambiguous');return {id:original.appointments,gid,tab:matches[0],range:'A:L',byId:true,dateColumns:[1,9]};
}
const config={token:secrets.LINE_TOKEN,recipient:secrets.LINE_GROUP_ID,minakoOwner,interviewHiddenNames:original.hiddenNames,revenueHiddenNames:privateSettings.revenueHiddenNames,appointments:{minako:await sourceById(original.minakoSheetId),textbook:await sourceById(original.textbookSheetId)}};
await fs.writeFile('.local/notification-config.json',JSON.stringify(config),{mode:0o600});
const statePath=path.resolve('.local/notification-state.json');try{await fs.writeFile(statePath,JSON.stringify({settings:{revision:0,words:[]},sessions:{},deliveries:{}}),{flag:'wx',mode:0o600});}catch(e){if(e.code!=='EEXIST')throw e;}
let env=await fs.readFile('.env.local','utf8');for(const [key,value] of Object.entries({PORTAL_NOTIFICATION_CONFIG_FILE:path.resolve('.local/notification-config.json'),PORTAL_NOTIFICATION_STATE_FILE:statePath})){env=env.replace(new RegExp('^'+key+'=.*(?:\\r?\\n|$)','gm'),'');env+='\n'+key+'='+value;}await fs.writeFile('.env.local',env,{mode:0o600});
console.log(JSON.stringify({renderersImported:true,interviewLogicImported:true,senderConfigImported:true,appointmentTabsVerified:true,gasChanged:false,messagesSent:false}));
