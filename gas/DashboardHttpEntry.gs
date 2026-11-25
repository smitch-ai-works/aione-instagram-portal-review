// Add this only when the dashboard project has no active doPost function.
function doPost(e){
  if(e&&e.parameter&&e.parameter.portal_api==='v1')return portalBridgeRequest_(e,'dashboard');
  return portalJson_({ok:false,error:'invalid_request'});
}
