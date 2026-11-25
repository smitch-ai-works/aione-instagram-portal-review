import {validateCall} from '../../../lib/rpc-contract.mjs';
import {callPortal} from '../../../lib/portal-service.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const reply=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff'}});
export async function POST(request){
  const allowed=process.env.PORTAL_PUBLIC_ORIGIN;
  if(!allowed)return reply({error:'not_configured'},503);
  if(request.headers.get('origin')!==allowed)return reply({error:'forbidden'},403);
  if(!request.headers.get('content-type')?.startsWith('application/json'))return reply({error:'invalid_request'},415);
  let body;
  try{
    const reader=request.body?.getReader();if(!reader)return reply({error:'invalid_request'},400);
    const chunks=[];let length=0;
    while(true){const {value,done}=await reader.read();if(done)break;length+=value.byteLength;if(length>64000){await reader.cancel();return reply({error:'request_too_large'},413);}chunks.push(value);}
    let parsed;try{parsed=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{if(length>16000)return reply({error:'request_too_large'},413);throw Error('invalid_request');}
    if(length>16000&&parsed?.method!=='saveMonthlyOutput')return reply({error:'request_too_large'},413);
    body=validateCall(parsed);
  }catch{return reply({error:'invalid_request'},400);}
  try{return reply(await callPortal(body));}catch(error){return reply({error:error.message==='not_configured'?'not_configured':'source_unavailable'},error.message==='not_configured'?503:502);}
}
