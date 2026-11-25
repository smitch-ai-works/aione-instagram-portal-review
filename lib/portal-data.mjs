import {aggregateSourceRows} from './source-aggregation.mjs';

export const nameKey=name=>typeof name==='string'?name.normalize('NFKC').replace(/\s/g,''):'';
export function japanMonth(now=new Date()){const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit'}).formatToParts(now).map(p=>[p.type,p.value]));return p.year+'-'+p.month;}
export function reportMonths(currentYM){if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(currentYM))return [];const [y,m]=currentYM.split('-').map(Number),n=y*12+m-1;return [1,2].map(offset=>{const value=n-offset;return Math.floor(value/12)+'-'+String(value%12+1).padStart(2,'0');});}
const label=month=>month.slice(2,4)+'年'+month.slice(5)+'月';
export function eligibleStudents(rows,hiddenNames=[]){
 const names=new Map(),hidden=new Set(hiddenNames);
 for(const row of rows.slice(1)){const name=String(row[0]||'').trim(),id=nameKey(name);if(!id||hidden.has(name))continue;if(!names.has(id))names.set(id,{id,name,readings:[]});const reading=String(row[1]||'').trim();if(reading&&!names.get(id).readings.includes(reading))names.get(id).readings.push(reading);}
 return [...names.values()].sort((a,b)=>(a.readings[0]||a.name).localeCompare(b.readings[0]||b.name,'ja'));
}
function amount(value,type){if(value===''||value===null||value===undefined)return 0;if(typeof value==='number')return Number.isSafeInteger(value)&&value>=0?value:null;if(typeof value!=='string')return null;let text=value.normalize('NFKC').trim();text=type==='revenue'?text.replace(/^[¥￥]\s*/,'').replace(/円$/,''):text.replace(/件$/,'');if(!/^\d+(?:,\d{3})*$/.test(text))return null;const n=Number(text.replace(/,/g,''));return Number.isSafeInteger(n)&&n>=0?n:null;}
export function monthlyFromRows(rows,name,month,currentYM,hiddenNames=[]){
 const id=nameKey(name),student=eligibleStudents(rows,hiddenNames).find(s=>s.id===id);if(!student)return {status:'not_eligible'};
 const headers=rows[0]||[],columns=type=>headers.flatMap((h,i)=>h===label(month)+type?[i]:[]),clientsColumns=columns('集客'),revenueColumns=columns('収益');
 if(!reportMonths(currentYM).includes(month)||clientsColumns.length!==1||revenueColumns.length!==1)return {status:'unavailable'};
 const matching=rows.slice(1).filter(row=>nameKey(String(row[0]||'').trim())===id);if(!matching.length)return {status:'unavailable'};
 let clients=0,revenue=0;for(const row of matching){const c=amount(row[clientsColumns[0]],'clients'),r=amount(row[revenueColumns[0]],'revenue');if(c===null||r===null)return {status:'unavailable'};clients+=c;revenue+=r;}
 if(!Number.isSafeInteger(clients)||!Number.isSafeInteger(revenue))return {status:'unavailable'};
 return {status:'ready',name:student.name,month,clients,revenue};
}
export function dashboardFromRows(rows,hiddenNames=[]){
 const headers=rows[0];if(!Array.isArray(headers)||!headers.length)throw Error('source_unavailable');
 const months=[...new Set(headers.flatMap(h=>String(h).match(/(\d{2}年\d{2}月)/)?.[1]||[]))].filter(m=>m>='26年01月').sort();
 const merged=new Map();
 for(const row of rows.slice(1)){
  const name=String(row[0]??'').trim();if(!name)continue;
  if(!merged.has(name))merged.set(name,{name,hiragana:String(row[1]||'').trim(),totalRevenue:0,totalClients:0,monthly:Object.fromEntries(months.map(m=>[m,{clients:0,revenue:0}]))});
  const student=merged.get(name);
  for(const m of months){const c=headers.indexOf(m+'集客'),r=headers.indexOf(m+'収益');const clients=c<0?0:Number(String(row[c]??'').replace(/[^0-9]/g,''))||0,revenue=r<0?0:Number(String(row[r]??'').replace(/[^0-9]/g,''))||0;student.monthly[m].clients+=clients;student.monthly[m].revenue+=revenue;student.totalClients+=clients;student.totalRevenue+=revenue;}
 }
 const hidden=new Set(hiddenNames),students=[...merged.values()].filter(s=>!hidden.has(s.name)).sort((a,b)=>a.hiragana.localeCompare(b.hiragana,'ja'));
 return {students,months};
}
export function nativeResultsRows(resultRows,sourceRows,config,currentYM,startMonth){
 if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(startMonth||'')||startMonth>currentYM)throw Error('not_configured');
 const selected=aggregateSourceRows(sourceRows.slice(1),resultRows,config),counts=new Map();
 for(const [name,timestamp] of selected){const month=String(timestamp).slice(0,7);if(month<startMonth||month>currentYM)continue;if(!counts.has(name))counts.set(name,new Map());counts.get(name).set(month,(counts.get(name).get(month)||0)+1);}
 const rows=resultRows.map(row=>[...row]),headers=rows[0];
 const [sy,sm]=startMonth.split('-').map(Number),[cy,cm]=currentYM.split('-').map(Number);
 for(let n=sy*12+sm-1;n<=cy*12+cm-1;n++){
  const month=Math.floor(n/12)+'-'+String(n%12+1).padStart(2,'0'),clientLabel=label(month)+'集客';
  let index=headers.indexOf(clientLabel);if(index<0){index=headers.length;headers.push(clientLabel);}
  for(const row of rows.slice(1))row[index]=counts.get(String(row[0]||'').trim())?.get(month)||0;
 }
 return rows;
}
export function lineLinkFromRows(rows,formulas,name,allowedName){
 const key=nameKey(name);if(key!==nameKey(allowedName))return {enabled:false};
 const expected=[['LINEアカウント名'],['生徒名','受講生名'],['Instagramリンク'],['最新LINEリンク']],headers=rows[0]||[];
 if(expected.some((labels,i)=>!labels.includes(headers[i])))return {enabled:true,status:'unavailable'};
 const matching=rows.slice(1).map((row,i)=>({name:row[1],url:String(row[3]||''),formula:formulas[i+1]?.[3]})).filter(row=>nameKey(row.name)===key);
 const valid=url=>/^https:\/\/sub\.aione\.co\.jp\/line\/open\/[A-Za-z0-9_-]+\?mtid=[A-Za-z0-9_-]+$/.test(url);
 if(matching.some(row=>row.formula!==undefined||(row.url.trim()&&!valid(row.url.trim()))))return {enabled:true,status:'unavailable'};
 const links=[...new Set(matching.map(row=>row.url.trim()).filter(Boolean))];return links.length>1?{enabled:true,status:'multiple'}:links.length?{enabled:true,status:'ready',url:links[0]}:{enabled:true,status:'not_found'};
}
