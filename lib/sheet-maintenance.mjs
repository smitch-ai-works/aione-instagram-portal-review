import {GoogleAuth} from 'google-auth-library';
import {nativeResultsRows} from './portal-data.mjs';

function column(index){let result='';for(let n=index+1;n;n=Math.floor((n-1)/26))result=String.fromCharCode(65+(n-1)%26)+result;return result;}
// Equivalent to existing updateDataSheet/refreshTotalClients. Planning is pure;
// application is deliberately separate while the original GAS trigger remains active.
export function planSheetMaintenance(results,source,config,currentYM){
 const rows=nativeResultsRows(results,source,config,currentYM,currentYM),original=results[0],headers=rows[0];
 const title=currentYM.slice(2,4)+'年'+currentYM.slice(5)+'月',clientLabel=title+'集客',revenueLabel=title+'収益';
 const missing=original.indexOf(clientLabel)<0;
 if((original.indexOf(revenueLabel)<0)!==missing)throw Error('incomplete_month_columns');
 if(missing)headers.push(revenueLabel);
 const clientIndex=headers.indexOf(clientLabel),quoted="'"+config.results.tab.replaceAll("'","''")+"'",updates=[];
 if(missing)updates.push({range:quoted+'!'+column(original.length)+'1:'+column(original.length+1)+'1',values:[[clientLabel,revenueLabel]]});
 updates.push({range:quoted+'!'+column(clientIndex)+'2:'+column(clientIndex)+rows.length,values:rows.slice(1).map(row=>[row[clientIndex]])});
 const clientColumns=headers.flatMap((h,i)=>String(h).includes('集客')&&!String(h).includes('累計')?[i]:[]),revenueColumns=headers.flatMap((h,i)=>String(h).includes('収益')&&!String(h).includes('累計')?[i]:[]);
 const sum=(row,columns)=>columns.reduce((total,index)=>total+(Number(String(row[index]??'').replace(/[^0-9]/g,''))||0),0);
 updates.push({range:quoted+'!D2:E'+rows.length,values:rows.slice(1).map(row=>[sum(row,clientColumns),sum(row,revenueColumns)])});
 return {spreadsheetId:config.results.id,requests:missing?[{insertDimension:{range:{sheetId:config.results.gid,dimension:'COLUMNS',startIndex:original.length,endIndex:original.length+2},inheritFromBefore:true}}]:[],updates};
}
export async function applySheetMaintenance(plan,{auth=new GoogleAuth({scopes:['https://www.googleapis.com/auth/spreadsheets']})}={}){
 if(!/^[\w-]{20,150}$/.test(plan.spreadsheetId||''))throw Error('invalid_plan');const client=await auth.getClient(),base='https://sheets.googleapis.com/v4/spreadsheets/'+plan.spreadsheetId;
 if(plan.requests.length)await client.request({url:base+':batchUpdate',method:'POST',data:{requests:plan.requests}});
 await client.request({url:base+'/values:batchUpdate',method:'POST',data:{valueInputOption:'RAW',data:plan.updates}});
}
