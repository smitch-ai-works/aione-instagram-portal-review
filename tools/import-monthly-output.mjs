// Import the fetched live source without touching GAS or any Google file.
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import {parse} from 'acorn';
const dir=process.argv[2];if(!dir)throw Error('Pass the private directory of the current GAS readback');
const source=await fs.readFile(path.join(dir,'MonthlyOutput.js'),'utf8'),ast=parse(source,{ecmaVersion:'latest'}),constants=new Map(),functions=new Map();
for(const node of ast.body){if(node.type==='FunctionDeclaration')functions.set(node.id.name,source.slice(node.start,node.end));if(node.type==='VariableDeclaration')for(const d of node.declarations)constants.set(d.id.name,vm.runInNewContext('('+source.slice(d.init.start,d.init.end)+')',{}, {timeout:1000}));}
const cfg=JSON.parse(JSON.stringify(constants.get('MONTHLY_OUTPUT_'))),roles=JSON.parse(JSON.stringify(constants.get('MONTHLY_OUTPUT_APPROVED_ROLES_')));
if(!cfg||!roles)throw Error('Live configuration missing');
await fs.mkdir('lib/monthly-output',{recursive:true});
const publicConfig={headers:cfg.headers,fields:cfg.fields,counts:cfg.counts,key:cfg.key};
const pure="// Pure validation and row building ported from the current GAS source.\nimport {createHash} from 'node:crypto';\nconst monthlyAdminDigest_=value=>createHash('sha256').update(value).digest('hex');\nexport const outputSchema="+JSON.stringify(publicConfig)+";\nconst MONTHLY_OUTPUT_=outputSchema;\n"+['monthlyOutputPermissionsOk_','monthlyOutputCell_','monthlyOutputRow_'].map(n=>functions.get(n)).join('\n')+'\nexport {monthlyOutputPermissionsOk_ as permissionsOk,monthlyOutputCell_ as outputCell,monthlyOutputRow_ as buildOutputRow};\n';
await fs.writeFile('lib/monthly-output/pure.mjs',pure.replace(/[ \t]+$/gm,''));
await fs.writeFile('.local/monthly-output-config.json',JSON.stringify({...cfg,approvedRoles:roles,enabled:true}),{mode:0o600});
const stateFile=path.resolve('.local/monthly-output-state.json');try{await fs.writeFile(stateFile,JSON.stringify({settings:{revision:0,words:[]},sessions:{},saved:{}}),{flag:'wx',mode:0o600});}catch(e){if(e.code!=='EEXIST')throw e;}
let env=await fs.readFile('.env.local','utf8');for(const [key,value] of Object.entries({PORTAL_MONTHLY_OUTPUT_CONFIG_FILE:path.resolve('.local/monthly-output-config.json'),PORTAL_MONTHLY_OUTPUT_STATE_FILE:stateFile})){env=env.replace(new RegExp('^'+key+'=.*(?:\\r?\\n|$)','gm'),'');env+='\n'+key+'='+value;}await fs.writeFile('.env.local',env,{mode:0o600});
const html=await fs.readFile(path.join(dir,'MonthlyReport.html'),'utf8'),scripts=[...html.matchAll(/<script\b[^>]*>([^]*?)<\/script>/gi)].map(m=>m[1]),liveApp=scripts.find(s=>s.includes('const Core=window.MonthlyReport'));
if(!liveApp?.includes('sendMonthlyOutput'))throw Error('Live output handler missing');
const currentApp=await fs.readFile('public/legacy/monthly-app.js','utf8'),poll=currentApp.slice(currentApp.indexOf('let backgroundLoading=false;'));
if(!poll.startsWith('let backgroundLoading=false;'))throw Error('Native refresh extension missing');
await fs.writeFile('public/legacy/monthly-app.js',liveApp.trim()+'\n'+poll);
console.log(JSON.stringify({pureLogicImported:true,privateConfigurationImported:true,clientHandlerImported:true,googleFilesChanged:false}));
