'use strict';
window.PortalRpc=async function(method,args=[]){
  const prefix=document.querySelector('[data-portal-prefix]')?.getAttribute('data-portal-prefix');
  if(!prefix)throw new Error('connection');
  const response=await fetch(prefix+'/api/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({method,args}),cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(90000)});
  if(!response.ok)throw new Error('connection');
  return response.json();
};
