// Run on the same Node host as Next.js, or use the authenticated /api/jobs endpoints.
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createJobService} from '../lib/notifications/service.mjs';
import {jobNames,tokyoParts} from '../lib/notifications/reports.mjs';
export function validateSchedule(schedule){if(!Array.isArray(schedule)||!schedule.length)throw Error('invalid_schedule');const seen=new Set();for(const s of schedule){if(!jobNames.includes(s.job)||seen.has(s.job)||(s.day!==undefined&&(!Number.isInteger(s.day)||s.day<1||s.day>31)))throw Error('invalid_schedule');seen.add(s.job);if(s.job==='maintenance'){if(s.everyMinutes!==30)throw Error('invalid_schedule');}else if(!Number.isInteger(s.hour)||s.hour<0||s.hour>23||!Number.isInteger(s.minute)||s.minute<0||s.minute>59)throw Error('invalid_schedule');}return schedule;}
export function dueJobs(schedule,now){const p=tokyoParts(now),minute=Number(p.hour)*60+Number(p.minute);return schedule.filter(s=>jobNames.includes(s.job)&&(s.day===undefined||s.day===Number(p.day))&&(s.everyMinutes?Number(p.minute)%s.everyMinutes<5:minute>=s.hour*60+s.minute&&minute-(s.hour*60+s.minute)<5)).map(s=>s.job);}
export async function runWorker({env=process.env,once=false}={}){
 if(env.PORTAL_JOBS_ENABLED!=='true'||env.PORTAL_JOB_OWNER!=='next'){console.log(JSON.stringify({status:'disabled'}));return;}
 const schedule=validateSchedule(JSON.parse(await fs.readFile(env.PORTAL_SCHEDULES_FILE,'utf8')));const service=createJobService({env});
 do{for(const job of dueJobs(schedule,new Date())){try{const result=await service.run(job);console.log(JSON.stringify({job,status:result.status}));}catch{console.error(JSON.stringify({job,status:'failed_check_private_ledger'}));}}if(!once)await new Promise(resolve=>setTimeout(resolve,15000));}while(!once);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await runWorker({once:process.argv.includes('--once')});
