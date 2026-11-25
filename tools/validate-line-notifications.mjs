// No delivery: only synthetic messages go to LINE's validation endpoint.
// The normal sender is exercised with a capture-only transport, never real fetch.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {buildNotificationReport} from '../lib/notifications/reports.mjs';
import {createLineSender} from '../lib/notifications/sender.mjs';

export function syntheticReports(){
 const results=[['登録経路名','ふりがな','その他','累計集客','累計収益','26年11月集客','26年11月収益']];
 const source=[['全シナリオ共通読者ID','LINE友達ID','共通ID','LINE登録名','メールアドレス','登録経路','配信基準日時','LINEアカウント番号']];
 const header=['導線名','日程','LINE名','名前','メールアドレス','','','','担当者','記入日','状態','備考'];
 const reservations={minako:[header],textbook:[header]};
 for(let i=1;i<=100;i++){
  const name='架空検証'+String(i).padStart(3,'0'),email='synthetic-'+i+'@example.test';
  results.push([name,'かくうけんしょう','',0,0,0,(i%2?i:i-1)*1000]);
  for(const [month,count] of [['2026-11',i%13+1],['2026-10',i%7+1]])for(let n=0;n<count;n++)source.push([month+'-'+i+'-'+n,'','','架空の登録名',n===0?email:month+'-'+i+'-'+n+'@example.test',name,month+'-01 08:00:00','@synthetic']);
  for(let n=0;n<i%9+1;n++)reservations.textbook.push(['@synthetic','2026-11-'+String(n+10)+' 10:00','架空の登録名','',email,'','','','架空担当','2026-11-01 10:00','','']);
 }
 const config={fallbackNames:{},readerOverrides:{},hiddenNames:[]};
 const notificationConfig={minakoOwner:'架空検証001',interviewHiddenNames:[],revenueHiddenNames:[]};
 const input={results,source,reservations,config,notificationConfig,now:new Date('2026-11-12T08:30:00+09:00')};
 const jobs=['list-morning','list-evening','revenue','interviews','previous-month'];
 const reports=jobs.map(job=>({job,scenario:'populated',...buildNotificationReport(job,input)}));
 const empty={...input,results:results.slice(0,1),source:source.slice(0,1),reservations:{minako:[header],textbook:[header]}};
 reports.push(...jobs.map(job=>({job,scenario:'empty',...buildNotificationReport(job,empty)})));
 reports.push({job:'list-error',scenario:'source-unavailable',messages:[{type:'text',text:'⚠️ リスト通知の処理に失敗しました。確認が必要です。'}]});
 return reports;
}

export async function validateWithoutSending({live=false,env=process.env,fetcher=fetch}={}){
 const reports=syntheticReports(),captured=[];
 for(const report of reports)for(const message of report.messages){
  const retryKey=randomUUID(),recipient='C'+'1'.repeat(32);
  const send=createLineSender({token:'synthetic-token',recipient,fetcher:async(url,init)=>{
   assert.equal(url,'https://api.line.me/v2/bot/message/push');assert.equal(init.method,'POST');
   assert.equal(init.headers['X-Line-Retry-Key'],retryKey);assert.equal(init.headers.authorization,'Bearer synthetic-token');
   const body=JSON.parse(init.body);assert.equal(body.to,recipient);assert.deepEqual(body.messages,[message]);
   captured.push({job:report.job,scenario:report.scenario,message});return new Response('',{status:200});
  }});
  await send(message,retryKey);
 }
 const outcomes={offlineSenderContract:true,reportCases:reports.length,syntheticMessages:captured.length,splitMessageCases:reports.filter(r=>r.messages.length>1).length,liveValidation:live,deliveredMessages:0};
 if(live){
  const config=JSON.parse(await fs.readFile(env.PORTAL_NOTIFICATION_CONFIG_FILE,'utf8'));
  if(typeof config.token!=='string'||!config.token||!/^([CUR])[0-9a-f]{32}$/.test(config.recipient||''))throw Error('line_not_configured');
  const accessPath=config.recipient.startsWith('C')?'/v2/bot/group/'+config.recipient+'/summary':config.recipient.startsWith('R')?'/v2/bot/room/'+config.recipient+'/members/count':'/v2/bot/profile/'+config.recipient;
  // Fixed allowlist deliberately excludes every actual send endpoint.
  const allowed=new Set(['/v2/bot/info',accessPath,'/v2/bot/message/validate/push']);
  async function api(path,body){
   assert(allowed.has(path),'non_validation_endpoint_blocked');
   let response;try{response=await fetcher('https://api.line.me'+path,{method:body?'POST':'GET',headers:{authorization:'Bearer '+config.token,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});}catch{throw Error('line_validation_network_unavailable');}
   if(!response.ok)throw Error('line_validation_http_'+response.status);
   // Do not print or persist bot/profile/group information or API response bodies.
   await response.arrayBuffer();
  }
  await api('/v2/bot/info');outcomes.botCredentialsAccepted=true;
  await api(accessPath);outcomes.recipientAccessible=true;
  for(const item of captured)await api('/v2/bot/message/validate/push',{messages:[item.message]});
  outcomes.officiallyValidatedMessages=captured.length;
 }
 return outcomes;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{console.log(JSON.stringify(await validateWithoutSending({live:process.argv.includes('--validate')})));}
 catch(error){console.error(/^(line_validation_|line_not_configured)/.test(error.message)?error.message:'line_contract_check_failed');process.exitCode=1;}
}
