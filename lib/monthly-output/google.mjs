import {GoogleAuth} from 'google-auth-library';
import {outputCell} from './pure.mjs';

export function createOutputGoogle({auth=new GoogleAuth({scopes:['https://www.googleapis.com/auth/spreadsheets','https://www.googleapis.com/auth/drive.metadata.readonly']})}={}){
 async function request(url,method='GET',data){const client=await auth.getClient();return (await client.request({url,method,data,retry:false,timeout:30000})).data;}
 function bases(config){if(!/^[\w-]{20,150}$/.test(config.id||'')||!Number.isSafeInteger(config.gid)||typeof config.tab!=='string')throw Error('output_not_configured');return {drive:'https://www.googleapis.com/drive/v3/files/'+config.id,sheets:'https://sheets.googleapis.com/v4/spreadsheets/'+config.id};}
 return {
  async permissionPages(config){const {drive}=bases(config),file=await request(drive+'?'+new URLSearchParams({supportsAllDrives:'true',fields:'id,mimeType,trashed,driveId,capabilities(canShare)'}));
   if(!file||file.id!==config.id||file.trashed===true||file.driveId||file.mimeType!=='application/vnd.google-apps.spreadsheet'||file.capabilities?.canShare!==true)return null;
   const pages=[],tokens=new Set();let pageToken;
   do{const query=new URLSearchParams({supportsAllDrives:'true',includePermissionsForView:'published',fields:'nextPageToken,permissions(id,type,role,deleted,view,emailAddress,pendingOwner,allowFileDiscovery)',pageSize:'100'});if(pageToken)query.set('pageToken',pageToken);const response=await request(drive+'/permissions?'+query);if(!Array.isArray(response?.permissions)||pages.length>=20)return null;pages.push(response.permissions);pageToken=response.nextPageToken;if(pageToken){if(tokens.has(pageToken))return null;tokens.add(pageToken);}}while(pageToken);
   return pages;
  },
  async found(config,hash){const result=await request(bases(config).sheets+'/developerMetadata:search','POST',{dataFilters:[{developerMetadataLookup:{metadataKey:config.key,metadataValue:hash,visibility:'PROJECT'}}]});return Array.isArray(result?.matchedDeveloperMetadata)&&result.matchedDeveloperMetadata.length>0;},
  async targetMatches(config){const {sheets}=bases(config),book=await request(sheets+'?fields=sheets.properties(sheetId,title)');if(!book.sheets?.some(s=>s.properties.sheetId===config.gid&&s.properties.title===config.tab))return false;const range="'"+config.tab.replaceAll("'","''")+"'!A1:O1",header=await request(sheets+'/values/'+encodeURIComponent(range)+'?valueRenderOption=UNFORMATTED_VALUE');return JSON.stringify(header.values?.[0])===JSON.stringify(config.headers);},
  async append(config,row,hash){return request(bases(config).sheets+':batchUpdate','POST',{requests:[{appendCells:{sheetId:config.gid,rows:[{values:row.map(outputCell)}],fields:'userEnteredValue'}},{createDeveloperMetadata:{developerMetadata:{metadataKey:config.key,metadataValue:hash,location:{spreadsheet:true},visibility:'PROJECT'}}}]});}
 };
}
