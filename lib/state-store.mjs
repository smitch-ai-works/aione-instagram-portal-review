import fs from 'node:fs/promises';
import path from 'node:path';
import {randomBytes} from 'node:crypto';

// Single-host durable store. Atomic replace + interprocess lock protect revisions.
// Deploy on a persistent private volume; never under public/ or an ephemeral function FS.
export function createStateStore(file){
 if(!file||!path.isAbsolute(file)||/[/\\]public[/\\]/i.test(file))throw Error('not_configured');
 const lock=file+'.lock';
 async function read(){let state;try{state=JSON.parse(await fs.readFile(file,'utf8'));}catch{throw Error('state_unavailable');}if(!state.settings||!state.sessions)throw Error('state_unavailable');return state;}
 return {read,async transact(operation){
  await fs.mkdir(path.dirname(file),{recursive:true,mode:0o700});
  let acquired=false;const deadline=Date.now()+3000;
  while(!acquired){try{await fs.mkdir(lock);acquired=true;}catch(error){if(error.code!=='EEXIST')throw Error('state_unavailable');if(Date.now()>deadline)throw Error('busy');await new Promise(resolve=>setTimeout(resolve,25));}}
  const temporary=file+'.'+randomBytes(8).toString('hex')+'.tmp';
  try{const state=await read(),result=await operation(state);await fs.writeFile(temporary,JSON.stringify(state),{mode:0o600,flag:'wx'});await fs.rename(temporary,file);return result;}
  finally{await fs.unlink(temporary).catch(()=>{});await fs.rmdir(lock);}
 }};
}
