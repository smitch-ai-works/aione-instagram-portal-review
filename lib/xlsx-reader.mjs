import {unzipSync, strFromU8} from 'fflate';
import {XMLParser} from 'fast-xml-parser';

const list=value=>value===undefined?[]:Array.isArray(value)?value:[value];
const parser=new XMLParser({ignoreAttributes:false,attributeNamePrefix:'@',parseTagValue:false,trimValues:false});
function xml(bytes){const value=strFromU8(bytes);if(/<!DOCTYPE|<!ENTITY/i.test(value))throw Error('invalid_workbook');return parser.parse(value);}
function text(value){if(value===undefined)return '';if(typeof value!=='object')return String(value);if(value['#text']!==undefined)return String(value['#text']);return list(value.r).map(item=>text(item.t)).join('')||text(value.t);}
function colIndex(reference){const letters=reference.match(/^[A-Z]+/)?.[0];if(!letters)throw Error('invalid_workbook');let result=0;for(const c of letters)result=result*26+c.charCodeAt(0)-64;return result-1;}
export function readWorkbook(bytes,sheetName,{maxColumns=16384}={}){
 if(bytes.length>100*1024*1024)throw Error('workbook_too_large');
 const archive=unzipSync(bytes,{filter:entry=>entry.originalSize<=180*1024*1024&&/^(xl\/(workbook.xml|_rels\/workbook.xml.rels|sharedStrings.xml|worksheets\/sheet\d+.xml))$/.test(entry.name)});
 if(!archive['xl/workbook.xml']||!archive['xl/_rels/workbook.xml.rels'])throw Error('invalid_workbook');
 const sheets=list(xml(archive['xl/workbook.xml']).workbook.sheets.sheet);
 const selected=sheets.find(sheet=>sheet['@name']===sheetName);if(!selected)throw Error('source_sheet_missing');
 const relation=list(xml(archive['xl/_rels/workbook.xml.rels']).Relationships.Relationship).find(r=>r['@Id']===selected['@r:id']);
 if(!relation||relation['@TargetMode']==='External')throw Error('invalid_workbook');
 const target=relation['@Target'];const file=target.startsWith('/')?target.slice(1):'xl/'+target;
 if(!/^xl\/worksheets\/sheet\d+\.xml$/.test(file)||!archive[file])throw Error('invalid_workbook');
 const strings=archive['xl/sharedStrings.xml']?list(xml(archive['xl/sharedStrings.xml']).sst.si).map(text):[];
 const rows=[],formulas=[];
 for(const row of list(xml(archive[file]).worksheet.sheetData?.row)){
  const rowIndex=Number(row['@r'])-1;if(!Number.isSafeInteger(rowIndex)||rowIndex<0||rowIndex>1000000)throw Error('invalid_workbook');
  const values=[],formula=[];
  for(const cell of list(row.c)){
   const index=colIndex(cell['@r']);if(index>16383)throw Error('invalid_workbook');if(index>=maxColumns)continue;
   const type=cell['@t'],raw=cell.v;
   values[index]=type==='s'?(strings[Number(raw)]??''):type==='inlineStr'?text(cell.is):type==='b'?raw==='1':type==='e'?String(raw??'#ERROR!'):type==='str'?String(raw??''):raw===undefined?'':Number.isFinite(Number(raw))?Number(raw):String(raw);
   if(cell.f!==undefined)formula[index]=typeof cell.f==='object'?String(cell.f['#text']??''):String(cell.f);
  }
  if(values.some(value=>value!==''&&value!==undefined)||formula.some(value=>value!==undefined)){rows[rowIndex]=values;formulas[rowIndex]=formula;}
 }
 const width=rows.reduce((maximum,row)=>Math.max(maximum,row?.length||0),0);
 for(let i=0;i<rows.length;i++){rows[i]??=[];for(let j=0;j<width;j++)rows[i][j]??='';formulas[i]??=[];}
 return {rows,formulas,sheetNames:sheets.map(s=>s['@name'])};
}
