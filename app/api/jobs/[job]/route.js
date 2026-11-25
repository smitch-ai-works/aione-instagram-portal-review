import {nativeJobs} from '../../../../lib/notifications/service.mjs';
import {jobNames} from '../../../../lib/notifications/reports.mjs';
import {secretMatches} from '../../../../lib/notifications/authorization.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=300;
export async function POST(request,context){
 const secret=process.env.PORTAL_SCHEDULER_SECRET;if(!secret||secret.length<32)return Response.json({error:'not_configured'},{status:503});
 if(!secretMatches(request.headers.get('authorization'),'Bearer '+secret))return Response.json({error:'forbidden'},{status:403});
 const {job}=await context.params;if(!jobNames.includes(job))return Response.json({error:'unknown_job'},{status:404});
 try{return Response.json(await nativeJobs().run(job),{headers:{'Cache-Control':'no-store'}});}catch{return Response.json({error:'job_failed_check_private_ledger'},{status:502});}
}
export const GET=POST;
