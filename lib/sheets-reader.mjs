import {GoogleAuth} from 'google-auth-library';
import {readWorkbook} from './xlsx-reader.mjs';

export function createSheetsReader({env=process.env,fetcher=fetch,auth=new GoogleAuth({scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']})}={}){
 const inflight=new Map(),cache=new Map();
 async function request(url,headers={}){
  let response;try{response=await fetcher(url,{headers,cache:'no-store',signal:AbortSignal.timeout(60000)});}catch{throw Error('source_unavailable');}
  if(!response.ok)throw Error(response.status===401||response.status===403?'sheets_access_denied':'source_unavailable');
  return response;
 }
 async function read({id,tab,gid,range,byId=false,dateColumns=[]}){
  if(!/^[\w-]{20,150}$/.test(id||'')||typeof tab!=='string'||!tab)throw Error('not_configured');
  const transport=env.PORTAL_SHEETS_TRANSPORT||'api';
  if(transport==='xlsx'){
   // Uses existing sheet access; never publishes a sheet or changes its sharing.
   const url=`https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx`+(Number.isSafeInteger(gid)?'&gid='+gid:'');
   const response=await request(url),type=response.headers.get('content-type')||'';
   if(!type.includes('spreadsheetml'))throw Error('sheets_access_denied');
   const maxColumns=range==='A:H'?8:range==='A:D'?4:16384;
   const data=readWorkbook(new Uint8Array(await response.arrayBuffer()),tab,{maxColumns});
   for(const row of data.rows.slice(1))for(const column of dateColumns)if(typeof row[column]==='number'){const date=new Date(Date.UTC(1899,11,30)+Math.round(row[column]*86400000));row[column]=date.toISOString().slice(0,19).replace('T',' ');}
   return data;
  }
  if(transport!=='api')throw Error('not_configured');
  let headers;try{headers=await auth.getRequestHeaders();}catch{throw Error('not_configured');}
  if(typeof headers.entries==='function')headers=Object.fromEntries(headers.entries());
  if(byId){const metadata=await (await request(`https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=sheets.properties(sheetId,title)`,headers)).json();const selected=metadata.sheets?.find(s=>s.properties?.sheetId===gid);if(!selected)throw Error('source_sheet_missing');tab=selected.properties.title;}
  const quoted="'"+tab.replaceAll("'","''")+"'"+(range?'!'+range:'');
  const base=`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(quoted)}`;
  const [values,formulas]=await Promise.all(['UNFORMATTED_VALUE','FORMULA'].map(async option=>(await request(base+'?'+new URLSearchParams({valueRenderOption:option,dateTimeRenderOption:'FORMATTED_STRING'}),headers)).json()));
  if(!Array.isArray(values.values)||!Array.isArray(formulas.values))throw Error('source_unavailable');
  return {rows:values.values,formulas:formulas.values.map(row=>row.map(value=>typeof value==='string'&&value.startsWith('=')?value.slice(1):undefined))};
 }
 return {read(source){const key=JSON.stringify(source),previous=cache.get(key),ttl=Number(env.PORTAL_SHEET_CACHE_MS||30000);if(previous&&Date.now()-previous.at<ttl)return Promise.resolve(previous.value);if(!inflight.has(key))inflight.set(key,read(source).then(value=>{value.fetchedAt=Date.now();cache.set(key,{at:value.fetchedAt,value});return value;}).finally(()=>inflight.delete(key)));return inflight.get(key);}};
}
