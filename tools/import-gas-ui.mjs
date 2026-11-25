// One-time frontend migration utility. Reads only public UI source, never GAS credentials.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=process.argv[2];if(!source)throw new Error('Pass the original frontend source directory');
const read=name=>fs.readFile(path.join(source,name),'utf8');
const write=async(name,text)=>{await fs.mkdir(path.dirname(path.join(root,name)),{recursive:true});await fs.writeFile(path.join(root,name),text.replace(/[ \t]+$/gm,'').trimEnd()+'\n');};
const homeUrl='https://script.google.com/macros/s/AKfycbwjMTmXFnw4fzqwWTkFn3fvQmiY24-4hRiX_rmOfwOMeCwDiUBe4IYXpTKxxendgZdk/exec';
const monthlyUrl='https://script.google.com/macros/s/AKfycbxOGXXRUeP1PeCJfOu0krdIq8ngnl1QgSraURox4eX93SHa3XmNOnxt-wYtSroe5myp/exec';
const resultsUrl='https://script.google.com/macros/s/AKfycbyQ5mvrIaIiwoygVkESrM3puUJf2mX4Dm_G1zb43J33Qn2qdOCtnfNAmlVz1T85aZssnQ/exec';
const links=html=>html.replaceAll(monthlyUrl+'?view=admin','__PORTAL_BASE_PATH__/admin').replaceAll(homeUrl,'__PORTAL_BASE_PATH__').replaceAll(monthlyUrl,'__PORTAL_BASE_PATH__/monthly-report').replaceAll(resultsUrl,'__PORTAL_BASE_PATH__/results').replaceAll('{{HOME_URL}}','__PORTAL_BASE_PATH__');
function extract(html){
 const withoutScripts=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
 const styles=[...withoutScripts.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map(m=>m[1]).join('\n');
 const body=withoutScripts.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1];assert(body,'Body missing');
 const markup=links(body.replace(/<style[^>]*>[\s\S]*?<\/style>/gi,''));
 assert(!/<script\b/i.test(markup),'Unexpected inline script in view markup');
 return {markup,styles,scripts:[]};
}
const home=extract(await read('student-home/gas/Home.html'));
const monthly=extract(await read('monthly-report/gas/MonthlyReport.html'));
const admin=extract(await read('monthly-report/gas/Admin.html'));
for(const name of ['ng-rules.js','report-core.js','image-renderer.js'])await write('public/legacy/'+name,await read('monthly-report/'+name));
await write('public/legacy/monthly-app.js',await read('monthly-report/app.js'));
await write('public/legacy/monthly-data.js',`'use strict';\nwindow.MonthlyData={preview:false,policy:()=>window.PortalRpc('getMonthlyReportPolicy'),init:()=>window.PortalRpc('getMonthlyReportInit'),monthly:(name,month)=>window.PortalRpc('getMonthlyReportData',[name,month])};\n`);
let adminCode=await read('monthly-report/admin.js');
const originalRpc=adminCode.match(/  function rpc\(method,\.\.\.args\)\{[\s\S]*?\n  \}\n/);assert(originalRpc,'Admin RPC not found');
adminCode=adminCode.replace(originalRpc[0],"  function rpc(method,...args){return window.PortalRpc(method,args);}\n");
assert(!adminCode.includes('google.script.run'));await write('public/legacy/admin-app.js',adminCode);
monthly.scripts=['portal-rpc.js','ng-rules.js','report-core.js','image-renderer.js','monthly-data.js','monthly-app.js'];
admin.scripts=['portal-rpc.js','ng-rules.js','report-core.js','admin-app.js'];
const dashboardHtml=await read('ranking-top5/gas/index.html'),results=extract(dashboardHtml);
const scripts=[...dashboardHtml.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
let initCount=0,lineCount=0;
for(let index=0;index<scripts.length;index++){
 let code=scripts[index];
 const init=code.match(/window\.onload = \(\) => \{[\s\S]*?\.getData\(\);\s*\};/);
 if(init){initCount++;code=code.replace(init[0],`window.PortalStartDashboard=()=>window.PortalRpc('getData').then(onDataLoaded).catch(()=>{document.getElementById('loading').textContent='読み込めませんでした。ページを再読み込みしてください。';});`);}
 if(code.includes('google.script.run.withSuccessHandler(result=>{')){
  lineCount++;code=code.replace('google.script.run.withSuccessHandler(result=>{',"window.PortalRpc('getDashboardLineLink',[name]).then(result=>{").replace('}).withFailureHandler(failed).getDashboardLineLink(name);','}).catch(failed);');
 }
 assert(!code.includes('google.script.run'),'Unmigrated browser RPC');
 const name='dashboard-'+index+'.js';await write('public/legacy/'+name,code);results.scripts.push(name);
}
assert.equal(initCount,1);assert.equal(lineCount,1);
await write('public/legacy/dashboard-start.js',"window.PortalStartDashboard();\n");
results.scripts=['portal-rpc.js',...results.scripts,'dashboard-start.js'];
await write('src/legacy/views.js','// Trusted local views migrated from the published GAS frontend.\nexport const views='+JSON.stringify({home,monthly,admin,results},null,2)+';\n');
for(const [dir,key,title] of [['','home','AI ONEインスタ部門'],['monthly-report','monthly','AI ONEインスタ部門 月報'],['results','results','AI ONEインスタ部門 成果ダッシュボード'],['admin','admin','管理者ページ | AI ONEインスタ部門']]){
 const prefix=dir?'../../':'../';
 await write('app/'+(dir?dir+'/':'')+'page.js',`import LegacyPage from '${prefix}components/LegacyPage';\nimport {views} from '${prefix}src/legacy/views';\nexport const metadata={title:${JSON.stringify(title)}};\nexport default function Page(){return <LegacyPage {...views.${key}} />;}\n`);
}
console.log('Migrated four local Next.js views and browser RPC adapters; no GAS server source or credentials imported.');
