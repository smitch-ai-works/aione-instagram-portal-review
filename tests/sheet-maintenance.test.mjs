import test from 'node:test';
import assert from 'node:assert/strict';
import {planSheetMaintenance,applySheetMaintenance} from '../lib/sheet-maintenance.mjs';
const rows=[['名前','読み','その他','累計集客','累計収益','26年10月集客','26年10月収益'],['検証花子','はなこ','',9,100,2,100]];
const source=[['reader','line','shared','name','email','route','time','account'],['a','','','','','検証花子','2026-11-01','']];
const config={results:{id:'synthetic-spreadsheet-id',tab:'実績',gid:123}};
test('native maintenance prepares the same new monthly columns and cumulative totals without mutating the input',()=>{
 const before=JSON.stringify(rows),plan=planSheetMaintenance(rows,source,config,'2026-11');assert.equal(JSON.stringify(rows),before);
 assert.deepEqual(plan.requests[0].insertDimension.range,{sheetId:123,dimension:'COLUMNS',startIndex:7,endIndex:9});assert.deepEqual(plan.updates[0].values,[['26年11月集客','26年11月収益']]);assert.deepEqual(plan.updates[1].values,[[1]]);assert.deepEqual(plan.updates[2].values,[[3,100]]);
});
test('applying an explicitly selected maintenance plan only uses the same spreadsheet through the Sheets API',async()=>{
 const requests=[],plan=planSheetMaintenance(rows,source,config,'2026-11');await applySheetMaintenance(plan,{auth:{getClient:async()=>({request:async request=>{requests.push(request);}})}});
 assert.equal(requests.length,2);assert(requests.every(r=>r.url.startsWith('https://sheets.googleapis.com/v4/spreadsheets/'+config.results.id)));assert.equal(requests[1].data.valueInputOption,'RAW');
});
