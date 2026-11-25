import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {validateWithoutSending} from '../tools/validate-line-notifications.mjs';

test('acceptance validates every notification with synthetic data and never calls a delivery endpoint',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'line-validation-'));
 try{
  const file=path.join(directory,'config.json');await fs.writeFile(file,JSON.stringify({token:'synthetic-access-token',recipient:'C'+'2'.repeat(32)}));
  const calls=[];const result=await validateWithoutSending({live:true,env:{PORTAL_NOTIFICATION_CONFIG_FILE:file},fetcher:async(url,init)=>{
   const endpoint=new URL(url).pathname;assert(['/v2/bot/info','/v2/bot/group/C'+'2'.repeat(32)+'/summary','/v2/bot/message/validate/push'].includes(endpoint));
   calls.push(endpoint);if(init.body){const body=JSON.parse(init.body);assert(!('to' in body));assert.equal(body.messages.length,1);assert(!init.body.includes('synthetic-access-token'));}
   return new Response('{}',{status:200});
  }});
  assert.equal(result.deliveredMessages,0);assert(result.botCredentialsAccepted&&result.recipientAccessible);assert.equal(result.reportCases,11);assert(result.splitMessageCases>0);assert.equal(calls.length,result.officiallyValidatedMessages+2);
  const failed=()=>validateWithoutSending({live:true,env:{PORTAL_NOTIFICATION_CONFIG_FILE:file},fetcher:async()=>new Response('private-response',{status:401})});
  await assert.rejects(failed,/^Error: line_validation_http_401$/);
 }finally{await fs.rm(directory,{recursive:true,force:true});}
});
