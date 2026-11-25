// Check a review snapshot, optionally including all reachable Git history.
// Private values are compared in memory; only filenames and issue types are printed.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const git=args=>execFileSync('git',args,{maxBuffer:40*1024*1024});
const privateRoot=path.resolve(process.env.PORTAL_PRIVATE_AUDIT_ROOT||'.');
const known=new Set(),issues=[];
const add=value=>{if(typeof value==='string'&&value.trim().length>=12)known.add(value.trim());};
const personal=value=>{
 if(Array.isArray(value))value.forEach(personal);
 else if(value&&typeof value==='object')for(const [key,item] of Object.entries(value)){if(key.length>=20)add(key);personal(item);}
 else if(typeof value==='string'&&value.length>=2)known.add(value);
};
const config=file=>{try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return {};}};
const local=file=>path.join(privateRoot,'.local',file);
const source=config(process.env.PORTAL_SOURCE_CONFIG_FILE||local('source-config.json'));
for(const key of ['results','source','links'])add(source[key]?.id);
for(const key of ['hiddenNames','fallbackNames','readerOverrides','interviewHiddenNames','lineLinkName'])personal(source[key]);
const notice=config(process.env.PORTAL_NOTIFICATION_CONFIG_FILE||local('notification-config.json'));
add(notice.token);add(notice.recipient);personal(notice.interviewHiddenNames);personal(notice.revenueHiddenNames);personal(notice.minakoOwner);
for(const sheet of Object.values(notice.appointments||{}))add(sheet.id);
const output=config(process.env.PORTAL_MONTHLY_OUTPUT_CONFIG_FILE||local('monthly-output-config.json'));
add(output.id);Object.keys(output.approvedRoles||{}).forEach(add);
for(const file of ['monthly-google-adc.json','monthly-oauth-client.json']){
 const raw=config(local(file)),credentials=raw.installed||raw.web||raw;
 for(const key of ['private_key','client_secret','client_id','refresh_token'])add(credentials[key]);
}
for(const [key,value] of Object.entries(process.env))if(/^(PORTAL_|LEGACY_)/.test(key)&&/SECRET|PASSWORD_HASH|DOWNLOAD_KEY|PROJECT_ID/.test(key))add(value);

const forbidden=/^(?:\.local\/|\.env(?!\.example$))|(?:^|\/)(?:\.clasprc|client_secret)|PortalBridgeConfig\.gs$/;
function inspect(file,bytes){
 if(forbidden.test(file))issues.push({file,kind:'private_path'});
 const text=bytes.toString('utf8');
 if([...known].some(value=>text.includes(value)))issues.push({file,kind:'private_configuration_value'});
 if(/GOCSPX-[A-Za-z0-9_-]{20,}|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----[\r\n]|ya29\.[A-Za-z0-9_-]{30,}/.test(text))issues.push({file,kind:'credential_pattern'});
 const emails=[...text.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)].map(match=>match[0]);
 if(emails.some(email=>!/@(?:[^@]+\.)?(?:test|invalid)$|@example\.(?:com|org|net)$/i.test(email)))issues.push({file,kind:'email_literal_requires_review'});
}
const current=git(['ls-files','--cached','--others','--exclude-standard','-z']).toString().split('\0').filter(Boolean);
for(const file of current)inspect(file,fs.readFileSync(file));
let historyBlobsChecked=0;
if(process.argv.includes('--history')){
 const seen=new Set();
 for(const line of git(['rev-list','--objects','--all']).toString().trim().split('\n')){
  const split=line.indexOf(' ');if(split<0)continue;
  const oid=line.slice(0,split),file=line.slice(split+1);
  if(forbidden.test(file))issues.push({file,kind:'private_path_in_history'});
  if(seen.has(oid)||git(['cat-file','-t',oid]).toString().trim()!=='blob')continue;
  seen.add(oid);historyBlobsChecked++;inspect(file,git(['cat-file','blob',oid]));
 }
}
const problems=[...new Map(issues.map(issue=>[JSON.stringify(issue),issue])).values()];
console.log(JSON.stringify({safe:problems.length===0,currentFilesChecked:current.length,historyBlobsChecked,knownPrivateValuesChecked:known.size,problems}));
if(problems.length)process.exitCode=1;
