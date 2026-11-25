// Pure validation and row building ported from the current GAS source.
import {createHash} from 'node:crypto';
const monthlyAdminDigest_=value=>createHash('sha256').update(value).digest('hex');
export const outputSchema={"headers":["対象月","投稿日","氏名","リスト数","収益（円）","リール本数","フィード本数","ストーリーズ日数","前月末フォロワー","当月末フォロワー","フォロワー増減","良かったこと","改善点","来月の目標","長期目標"],"fields":["good","growth","action","goal"],"counts":["reelPosts","feedPosts","storyDays","followersStart","followersEnd"],"key":"aione-output-request-v1"};
const MONTHLY_OUTPUT_=outputSchema;
function monthlyOutputPermissionsOk_(permissionPages,allow){
  const seen=new Set();
  let hasOwner=false;
  let hasLinkReader=false;
  for(const page of permissionPages){
    if(!Array.isArray(page))return false;
    for(const grant of page){
      if(grant.deleted===true)continue;
      if(grant.view||grant.pendingOwner===true)return false;
      if(grant.type==='anyone'){
        if(hasLinkReader||grant.role!=='reader'||grant.allowFileDiscovery!==false)return false;
        hasLinkReader=true;
        continue;
      }
      if(grant.type!=='user'||typeof grant.emailAddress!=='string'||!grant.emailAddress.trim())return false;
      const key=monthlyAdminDigest_(grant.emailAddress.trim().toLowerCase());
      if(seen.has(key)||!Object.prototype.hasOwnProperty.call(allow,key)||allow[key]!==grant.role)return false;
      seen.add(key);if(grant.role==='owner')hasOwner=true;
    }
  }
  return hasOwner&&seen.size>0;
}
function monthlyOutputCell_(value){
  return value===''?{}:{userEnteredValue:typeof value==='number'?{numberValue:value}:{stringValue:value}};
}
function monthlyOutputRow_(entry,core,policy,metrics,stamp){
  const cfg=MONTHLY_OUTPUT_;
  if(!entry||typeof entry!=='object'||typeof entry.name!=='string'||!entry.name.trim()||entry.name.length>100||
     typeof entry.month!=='string'||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(entry.month)||
     !entry.draft||typeof entry.draft!=='object'||Array.isArray(entry.draft))return null;
  if(!metrics||metrics.status!=='ready'||metrics.month!==entry.month||metrics.name!==entry.name)return null;
  const raw={};for(const f of cfg.fields.concat(cfg.counts)){
    const value=entry.draft[f]??'';
    if(typeof value!=='string'||value.length>(cfg.fields.includes(f)?3000:9)||/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u.test(value))return null;
    raw[f]=value;
  }
  if(!core.setScreeningPolicy(policy))return null;
  const checked=core.screenDraft(raw);if(!checked.ready)return null;
  const activity=core.activityData(raw,entry.month);if(!activity.valid)return null;
  const state=core.getMonthlyState({monthly:{[entry.month]:metrics}},entry.month);
  const display=core.reportDisplay(state);
  if(!display.ready||!core.reportText({name:metrics.name,monthly:{[entry.month]:metrics}},entry.month,raw))return null;
  return [entry.month,stamp,metrics.name,display.showLists?metrics.clients:'',display.showRevenue?metrics.revenue:'',
    ...cfg.counts.map(f=>activity.values[f]??''),activity.difference??'',...cfg.fields.map(f=>checked.draft[f]??'')];
}
export {monthlyOutputPermissionsOk_ as permissionsOk,monthlyOutputCell_ as outputCell,monthlyOutputRow_ as buildOutputRow};
