// Compare only pure functions using synthetic entries. No sheet or permission writes.
import fs from 'node:fs/promises';import path from 'node:path';import vm from 'node:vm';import {createHash} from 'node:crypto';import {isDeepStrictEqual} from 'node:util';
import {buildOutputRow,permissionsOk,outputCell} from '../lib/monthly-output/pure.mjs';import {createOutputCore} from '../lib/monthly-output/service.mjs';
const dir=process.argv[2];if(!dir)throw Error('Pass the private current-source directory');
const policy={rules:[{id:'managed',reason:'検証',guidance:'取り組みを書く',words:['返金']}]};
const context=vm.createContext({monthlyAdminDigest_:value=>createHash('sha256').update(value).digest('hex'),monthlyDefaultNgPolicy_:()=>policy});
vm.runInContext((await fs.readFile(path.join(dir,'MonthlyOutput.js'),'utf8'))+'\n'+(await fs.readFile(path.join(dir,'MonthlyOutputCore.js'),'utf8')),context,{timeout:1000});
const owner='owner@example.test',writer='writer@example.test',digest=value=>createHash('sha256').update(value).digest('hex'),roles={[digest(owner)]:'owner',[digest(writer)]:'writer'};
const grant={type:'user',emailAddress:owner,role:'owner'},variants=[[],[grant],[grant,{type:'user',emailAddress:writer,role:'writer'}],[grant,{type:'anyone',role:'reader',allowFileDiscovery:false}],[grant,{type:'anyone',role:'writer',allowFileDiscovery:false}],[grant,{type:'anyone',role:'reader',allowFileDiscovery:true}],[grant,{type:'user',emailAddress:'unknown@example.test',role:'writer'}],[{...grant,pendingOwner:true}]];
for(const grants of variants){context.pages=[grants];context.roles=roles;if(vm.runInContext('monthlyOutputPermissionsOk_(pages,roles)',context)!==permissionsOk([grants],roles))throw Error('Permission policy mismatch');}
const base={id:'00112233-4455-4677-8899-aabbccddeeff',name:'検証花子',month:'2026-10',draft:{good:'返金をした。投稿を継続した。',growth:'=SUM(A1:A2)',reelPosts:'0',storyDays:'31',followersStart:'10',followersEnd:'5'}};
const metrics={status:'ready',name:'検証花子',month:'2026-10',clients:3,revenue:1200};
let count=0;
for(const entry of [base,{...base,draft:{good:'',goal:'',followersEnd:'0'}},{...base,draft:{good:'あ'.repeat(3000)}},{...base,draft:{good:'あ'.repeat(3001)}},{...base,draft:{storyDays:'32'}},{...base,draft:{good:'x\u0000y'}},{...base,name:'別名'}])for(const values of [metrics,{...metrics,clients:0,revenue:0},{...metrics,status:'unavailable'}]){
 context.entry=entry;context.metrics=values;context.policy=policy;const original=JSON.parse(vm.runInContext("JSON.stringify(monthlyOutputRow_(entry,monthlyOutputCore_(),policy,metrics,'2026-11-22 12:34:56'))",context,{timeout:1000}));const native=buildOutputRow(entry,createOutputCore(policy),policy,values,'2026-11-22 12:34:56');if(!isDeepStrictEqual(original,native))throw Error('Row validation mismatch');count++;
}
for(const value of ['',0,-5,'=SUM(A1:A2)','+payload','@mention']){context.value=value;if(!isDeepStrictEqual(JSON.parse(vm.runInContext('JSON.stringify(monthlyOutputCell_(value))',context)),outputCell(value)))throw Error('Literal cell encoding mismatch');}
console.log(JSON.stringify({permissionCasesMatched:variants.length,rowCasesMatched:count,literalCellEncodingMatched:true,googleFilesChanged:false}));
