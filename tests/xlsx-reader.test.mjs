import test from 'node:test';
import assert from 'node:assert/strict';
import {zipSync,strToU8} from 'fflate';
import {readWorkbook} from '../lib/xlsx-reader.mjs';
import {createSheetsReader} from '../lib/sheets-reader.mjs';
function workbook(){return zipSync(Object.fromEntries(Object.entries({
 'xl/workbook.xml':'<workbook><sheets><sheet name="検証" r:id="rId1"/></sheets></workbook>',
 'xl/_rels/workbook.xml.rels':'<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
 'xl/sharedStrings.xml':'<sst><si><t>名前</t></si><si><r><t>検証</t></r><r><t>花子&amp;太郎</t></r></si></sst>',
 'xl/worksheets/sheet1.xml':'<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row><row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2"><v>1234</v></c><c r="C2" t="str"><f>HYPERLINK("test")</f><v>text</v></c><c r="D2" t="e"><v>#REF!</v></c></row><row r="300000"><c r="A300000" s="2"/></row></sheetData></worksheet>'
 }).map(([name,value])=>[name,strToU8(value)])));}
test('direct workbook reading preserves raw numbers, rich strings, errors and formulas without type inference or formatted trailing rows',()=>{
 const data=readWorkbook(workbook(),'検証');assert.equal(data.rows.length,2);assert.deepEqual(data.rows[1],['検証花子&太郎',1234,'text','#REF!']);assert.equal(data.formulas[1][2],'HYPERLINK("test")');assert.throws(()=>readWorkbook(workbook(),'missing'),/source_sheet_missing/);
});
test('public export reader never calls GAS and coalesces concurrent reads with a bounded cache',async()=>{
 let calls=0;const reader=createSheetsReader({env:{PORTAL_SHEETS_TRANSPORT:'xlsx'},fetcher:async url=>{calls++;assert(url.startsWith('https://docs.google.com/spreadsheets/d/'));return new Response(workbook(),{headers:{'content-type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}});}});
 const source={id:'synthetic-spreadsheet-id',tab:'検証',gid:1};const values=await Promise.all([reader.read(source),reader.read(source)]);assert.equal(calls,1);assert.equal(values[0].rows[1][1],1234);await reader.read(source);assert.equal(calls,1);
});
test('private-sheet API access requests raw values and formulas and never silently falls back to a public export',async()=>{
 const requests=[];const reader=createSheetsReader({env:{PORTAL_SHEETS_TRANSPORT:'api',PORTAL_SHEET_CACHE_MS:'0'},auth:{getRequestHeaders:async()=>({authorization:'Bearer synthetic'})},fetcher:async(url,options)=>{requests.push(url);assert.equal(options.headers.authorization,'Bearer synthetic');return Response.json({values:[['header'],[123]]});}});
 const data=await reader.read({id:'synthetic-spreadsheet-id',tab:'検証'});assert.equal(data.rows[1][0],123);assert.equal(requests.length,2);assert(requests.every(url=>url.startsWith('https://sheets.googleapis.com/')));
 const denied=createSheetsReader({env:{PORTAL_SHEETS_TRANSPORT:'api'},auth:{getRequestHeaders:async()=>({})},fetcher:async()=>new Response('',{status:403})});await assert.rejects(denied.read({id:'synthetic-spreadsheet-id',tab:'検証'}),/sheets_access_denied/);
});
test('API reading of the limited LINE tab follows its stable ID through renames and rejects a missing ID',async()=>{
 const requested=[];let present=true;
 const reader=createSheetsReader({env:{PORTAL_SHEETS_TRANSPORT:'api',PORTAL_SHEET_CACHE_MS:'0'},auth:{getRequestHeaders:async()=>({})},fetcher:async url=>{requested.push(url);return Response.json(url.includes('?fields=')?{sheets:[{properties:{sheetId:present?0:99,title:'改名後'}}]}:{values:[['header']]});}});
 await reader.read({id:'synthetic-spreadsheet-id',tab:'古い名前',gid:0,byId:true});assert(requested.some(url=>url.includes(encodeURIComponent("'改名後'"))));
 present=false;await assert.rejects(reader.read({id:'synthetic-spreadsheet-id',tab:'古い名前',gid:0,byId:true}),/source_sheet_missing/);
});
