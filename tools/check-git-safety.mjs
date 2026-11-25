// Inspect the exact files Git can include. Never print matched secret values.
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z']).toString().split('\0').filter(Boolean),secrets=[];
try{const config=JSON.parse(await fs.readFile('.local/notification-config.json','utf8'));secrets.push(config.token,config.recipient);}catch{}
try{const config=JSON.parse(await fs.readFile('.local/monthly-output-config.json','utf8'));secrets.push(...Object.keys(config.approvedRoles||{}));}catch{}
for(const file of ['.local/monthly-oauth-client.json','.local/monthly-google-adc.json'])try{const config=JSON.parse(await fs.readFile(file,'utf8')),credentials=config.installed||config;secrets.push(credentials.client_secret,credentials.refresh_token);}catch{}
try{const env=await fs.readFile('.env.local','utf8');for(const line of env.split(/\r?\n/)){const i=line.indexOf('=');if(/SECRET|PASSWORD_HASH|TOP5_DOWNLOAD_KEY/.test(line.slice(0,i)))secrets.push(line.slice(i+1).trim());}}catch{}
const problems=[];
for(const file of files){if(/^\.local\/|^\.env(?!\.example$)|(^|\/)\.clasprc|PortalBridgeConfig\.gs$/.test(file)){problems.push(file);continue;}const bytes=await fs.readFile(file).catch(()=>null);if(!bytes)continue;const text=bytes.toString('utf8');if(secrets.some(value=>typeof value==='string'&&value.length>12&&text.includes(value))||/GOCSPX-[A-Za-z0-9_-]{20,}|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----\r?\n/.test(text))problems.push(file);}
if(problems.length){console.error(JSON.stringify({safe:false,files:problems}));process.exitCode=1;}else console.log(JSON.stringify({safe:true,filesChecked:files.length,privateConfigExcluded:true}));
