export function createLineSender({token,recipient,fetcher=fetch}){
 return async function send(message,retryKey){
  if(typeof token!=='string'||!token||!/^C[0-9a-f]{32}$|^U[0-9a-f]{32}$|^R[0-9a-f]{32}$/.test(recipient||''))throw Error('line_not_configured');
  if(!message||!['text','flex'].includes(message.type)||typeof retryKey!=='string')throw Error('invalid_line_message');
  let response;try{response=await fetcher('https://api.line.me/v2/bot/message/push',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token,'X-Line-Retry-Key':retryKey},body:JSON.stringify({to:recipient,messages:[message]}),signal:AbortSignal.timeout(30000)});}catch{throw Error('line_outcome_uncertain');}
  // LINE returns 409 with this header when the same retry key was already accepted.
  if(response.status===409&&response.headers.get('x-line-accepted-request-id'))return;
  if(!response.ok)throw Error(response.status>=500?'line_outcome_uncertain':'line_rejected_'+response.status);
 };
}
