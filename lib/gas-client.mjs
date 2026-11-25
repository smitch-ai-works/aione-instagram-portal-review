import {createHmac,randomBytes} from 'node:crypto';
export function signedEnvelope(call,secret,now=Date.now(),nonce=randomBytes(16).toString('hex')){
  const payload=JSON.stringify(call);
  return {timestamp:now,nonce,payload,signature:createHmac('sha256',secret).update(now+'.'+nonce+'.'+payload).digest('hex')};
}
export async function callGas(call,{env=process.env,fetcher=fetch}={}){
  const secret=env.GAS_BRIDGE_SECRET,url=call.target==='monthly'?env.GAS_MONTHLY_URL:env.GAS_DASHBOARD_URL;
  if(!secret||secret.length<32||!url)throw new Error('not_configured');
  const upstream=new URL(url);
  if(upstream.protocol!=='https:'||upstream.hostname!=='script.google.com'||!/^\/macros\/s\/[\w-]+\/exec$/.test(upstream.pathname)||upstream.search)throw new Error('not_configured');
  upstream.searchParams.set('portal_api','v1');
  const response=await fetcher(upstream,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(signedEnvelope(call,secret)),cache:'no-store',redirect:'follow',signal:AbortSignal.timeout(25000)});
  if(!response.ok)throw new Error('upstream_unavailable');
  let reply;try{reply=await response.json();}catch{throw new Error('upstream_unavailable');}
  if(reply?.ok!==true||!Object.hasOwn(reply,'result'))throw new Error('upstream_unavailable');
  return reply.result;
}
