// Monthly project has no existing doPost. Add this entry only to that project.
function doPost(e){
  if(e&&e.parameter&&e.parameter.portal_api==='v1')return portalBridgeRequest_(e,'monthly');
  return portalJson_({ok:false,error:'invalid_request'});
}
