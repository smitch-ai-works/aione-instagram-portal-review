import test from 'node:test';
import assert from 'node:assert/strict';
import {dashboardFromRows,monthlyFromRows,eligibleStudents,reportMonths,japanMonth,nativeResultsRows,lineLinkFromRows} from '../lib/portal-data.mjs';
import {aggregateSourceRows} from '../lib/source-aggregation.mjs';
import {createPortalService} from '../lib/portal-service.mjs';

const header=['名前','ふりがな','25年12月集客','25年12月収益','26年10月集客','26年10月収益','26年11月集客','26年11月収益'];
const rows=[header,['検証花子','けんしょうはなこ',99,99999,2,1200,9,50],['検証花子','はなこ',0,0,3,100,9,20],['検証太郎','けんしょうたろう',0,0,0,'',0,0],['対象外','たいしょうがい',0,0,100,10000,0,0]];
const sourceHeader=['reader','line','shared','name','email','route','timestamp','account'];
const source=(reader,route,ts,{email='',line='',shared='',account=''}={})=>[reader,line,shared,'',email,route,ts,account];
test('monthly report preserves duplicate-name sums, readings, exclusions, blank-zero and missing/invalid distinctions',()=>{
 const students=eligibleStudents(rows,['対象外']);assert.equal(students.length,2);assert.deepEqual(students.find(s=>s.name==='検証花子').readings,['けんしょうはなこ','はなこ']);
 assert.deepEqual(monthlyFromRows(rows,'検証 花子','2026-10','2026-11',['対象外']),{status:'ready',name:'検証花子',month:'2026-10',clients:5,revenue:1300});
 assert.equal(monthlyFromRows(rows,'検証花子','2026-11','2026-11').status,'unavailable');assert.equal(monthlyFromRows(rows,'検証花子','2026-09','2026-11').status,'unavailable');
 assert.equal(monthlyFromRows(rows,'対象外','2026-10','2026-11',['対象外']).status,'not_eligible');
 const bad=structuredClone(rows);bad[1][5]='#REF!';assert.equal(monthlyFromRows(bad,'検証花子','2026-10','2026-11').status,'unavailable');assert.equal(monthlyFromRows(rows,'検証太郎','2026-10','2026-11').revenue,0);
});
test('dashboard retains all-time sums from 2026 onward, duplicate rows and existing month ordering',()=>{
 const data=dashboardFromRows(rows,['対象外']),student=data.students.find(s=>s.name==='検証花子');assert.deepEqual(data.months,['26年10月','26年11月']);assert.equal(student.totalClients,23);assert.equal(student.totalRevenue,1370);assert.equal(data.students.length,2);
});
test('Tokyo month boundary and report-year rollover remain identical to the existing policy',()=>{assert.equal(japanMonth(new Date('2026-12-31T15:00:00Z')),'2027-01');assert.deepEqual(reportMonths('2027-01'),['2026-12','2026-11']);});
test('source matching uses strongest attribution, earliest signup, normalized identity and cross-reader deduplication',()=>{
 const raw=[source('same','','2026-10-01',{account:'＠confirmed'}),source('same','検証花子追加','2026-11-02',{email:' SAME@EXAMPLE.TEST '}),source('other','検証花子','2026-11-03',{email:'same@example.test'}),source('taro','検証太郎','2026-11-04',{email:'same@example.test'}),source('override','検証太郎','2026-11-05'),source('old','検証太郎','2026-01-01')];
 const selected=aggregateSourceRows(raw,rows,{fallbackNames:{'@confirmed':'検証太郎'},readerOverrides:{override:'検証花子'}});
 assert.deepEqual(selected,[['検証花子','2026-10-01'],['検証太郎','2026-11-04'],['検証花子','2026-11-05']]);
});
test('ambiguous shared LINE accounts never attribute a blank registration to an arbitrary student',()=>{
 const selected=aggregateSourceRows([source('a','検証花子','2026-11-01',{account:'@shared'}),source('b','検証太郎','2026-11-02',{account:'@shared'}),source('c','','2026-11-03',{account:'@shared'})],rows);
 assert.deepEqual(selected,[['検証花子','2026-11-01'],['検証太郎','2026-11-02'],['','2026-11-03']]);
});
test('native aggregation leaves source and historical totals intact, including same-name row behavior, across month rollover',()=>{
 const raw=[sourceHeader,source('a','検証花子','2026-11-01'),source('b','検証花子','2026-12-01')],before=JSON.stringify(rows);
 const result=nativeResultsRows(rows,raw,{},'2026-12','2026-11');assert.equal(JSON.stringify(rows),before);assert.equal(result[1][4],2);assert.equal(result[1][6],1);assert.equal(result[2][6],1);
 const december=result[0].indexOf('26年12月集客');assert.equal(result[1][december],1);assert.equal(dashboardFromRows(result).students.find(s=>s.name==='検証花子').totalClients,9);
 // Missing revenue columns remain unavailable, never silently treated as a reported zero.
 assert.equal(monthlyFromRows(result,'検証花子','2026-12','2027-01').status,'unavailable');
});
test('limited LINE links preserve fixed headers, duplicate/invalid/formula checks and allowed-name restriction',()=>{
 const table=[['LINEアカウント名','生徒名','Instagramリンク','最新LINEリンク'],['a','検証花子','','https://sub.aione.co.jp/line/open/test?mtid=abc']];
 assert.equal(lineLinkFromRows(table,[[],[]],'検証花子','検証花子').status,'ready');assert.deepEqual(lineLinkFromRows(table,[[],[]],'検証太郎','検証花子'),{enabled:false});
 assert.equal(lineLinkFromRows(table,[[],[,,, 'HYPERLINK(...)']],'検証花子','検証花子').status,'unavailable');
 const multiple=[...table,['b','検証花子','','https://sub.aione.co.jp/line/open/test?mtid=xyz']];assert.equal(lineLinkFromRows(multiple,[[],[],[]],'検証花子','検証花子').status,'multiple');
});
test('portal service works with no GAS configuration and refreshes from the direct sheet reader',async()=>{
 let sourceRows=[sourceHeader,source('a','検証太郎','2026-11-01')];const requested=[];
 const reader={read:async config=>{requested.push(config.id);return {rows:config.id==='results'?rows:sourceRows};}};
 const service=createPortalService({env:{PORTAL_NATIVE_START_MONTH:'2026-11'},reader,config:{results:{id:'results'},source:{id:'source'},hiddenNames:['対象外']},now:()=>new Date('2026-11-03T01:00Z')});
 const first=await service.call({method:'getData',args:[]});assert.equal(first.students.find(s=>s.name==='検証太郎').monthly['26年11月'].clients,1);
 sourceRows=[...sourceRows,source('b','検証太郎','2026-11-02')];const second=await service.call({method:'getData',args:[]});assert.equal(second.students.find(s=>s.name==='検証太郎').monthly['26年11月'].clients,2);assert(requested.every(id=>['results','source'].includes(id)));
 const monthly=await service.call({method:'getMonthlyReportData',args:['検証花子','2026-10']});assert.equal(monthly.clients,5);
});
test('a direct-source failure fails the request instead of using zero counts or falling back to GAS',async()=>{
 const service=createPortalService({env:{PORTAL_NATIVE_START_MONTH:'2026-11'},reader:{read:async()=>{throw Error('sheets_access_denied');}},config:{results:{id:'results'},source:{id:'source'}}});
 await assert.rejects(service.call({method:'getData',args:[]}),/sheets_access_denied/);
});
test('LINE capability is enforced by the server before reading a privately configured source',async()=>{
 let reads=0;
 const reader={read:async()=>{reads++;return {rows:[['LINEアカウント名','生徒名','Instagramリンク','最新LINEリンク'],['a','検証花子','','https://sub.aione.co.jp/line/open/test?mtid=abc']],formulas:[[],[]]};}};
 const service=createPortalService({reader,config:{lineLinkName:'検証花子',links:{id:'private-test-source'}}});
 assert.deepEqual(await service.call({method:'getDashboardLineLink',args:['検証太郎']}),{enabled:false});
 assert.equal(reads,0);
 const result=await service.call({method:'getDashboardLineLink',args:['検証 花子']});
 assert.equal(result.enabled,true);assert.equal(result.status,'ready');assert.equal(reads,1);
});
