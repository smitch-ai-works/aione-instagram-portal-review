// Additive HTTP bridge. Existing sheet updates and notification functions are not exposed.
function portalJson_(value){return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);}
function portalBridgeRequest_(e,target){
  try{
    if(!e||!e.postData||typeof e.postData.contents!=='string'||e.postData.contents.length>20000)return portalJson_({ok:false,error:'invalid_request'});
    const request=JSON.parse(e.postData.contents),secret=portalBridgeConfig_().secret;
    if(typeof secret!=='string'||secret.length<32||!Number.isSafeInteger(request.timestamp)||Math.abs(Date.now()-request.timestamp)>90000||!/^[a-f0-9]{32}$/.test(request.nonce)||typeof request.payload!=='string'||!/^[a-f0-9]{64}$/.test(request.signature))return portalJson_({ok:false,error:'unauthorized'});
    const message=request.timestamp+'.'+request.nonce+'.'+request.payload;
    const expected=Utilities.computeHmacSha256Signature(message,secret,Utilities.Charset.UTF_8).map(byte=>('0'+(byte&255).toString(16)).slice(-2)).join('');
    let difference=0;for(let i=0;i<64;i++)difference|=expected.charCodeAt(i)^request.signature.charCodeAt(i);
    if(difference)return portalJson_({ok:false,error:'unauthorized'});
    const call=JSON.parse(request.payload);
    if(!call||call.target!==target||typeof call.method!=='string'||!Array.isArray(call.args))return portalJson_({ok:false,error:'invalid_request'});
    const methods=target==='monthly'?{
      getMonthlyReportInit:()=>getMonthlyReportInit(),getMonthlyReportPolicy:()=>getMonthlyReportPolicy(),getMonthlyReportData:(name,month)=>getMonthlyReportData(name,month),
      adminLogin:password=>adminLogin(password),adminGetRules:token=>adminGetRules(token),adminSaveRules:(token,words,revision)=>adminSaveRules(token,words,revision),adminLogout:token=>adminLogout(token)
    }:target==='dashboard'?{getData:()=>getData(),getDashboardLineLink:name=>getDashboardLineLink(name)}:{};
    if(!Object.prototype.hasOwnProperty.call(methods,call.method))return portalJson_({ok:false,error:'invalid_request'});
    const lock=LockService.getScriptLock();if(!lock.tryLock(1000))return portalJson_({ok:false,error:'busy'});
    try{const cache=CacheService.getScriptCache(),key='portal-nonce:'+request.nonce;if(cache.get(key))return portalJson_({ok:false,error:'unauthorized'});cache.put(key,'used',180);}finally{lock.releaseLock();}
    return portalJson_({ok:true,result:methods[call.method].apply(null,call.args)});
  }catch{return portalJson_({ok:false,error:'unavailable'});}
}
