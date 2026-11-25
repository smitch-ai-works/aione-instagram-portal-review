import {validOutputEntry} from './monthly-output/service.mjs';
const text=(value,max)=>typeof value==='string'&&value.length<=max&&!/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value);
const token=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const none=args=>args.length===0;
export const methods={
  getMonthlyReportInit:{target:'monthly',valid:none},
  getMonthlyReportPolicy:{target:'monthly',valid:none},
  getMonthlyReportData:{target:'monthly',valid:args=>args.length===2&&text(args[0],100)&&/^20\d{2}-(0[1-9]|1[0-2])$/.test(args[1])},
  saveMonthlyOutput:{target:'monthly',valid:args=>args.length===1&&validOutputEntry(args[0])},
  adminLogin:{target:'monthly',valid:args=>args.length===1&&text(args[0],72)&&Buffer.byteLength(args[0],'utf8')<=72},
  adminGetRules:{target:'monthly',valid:args=>args.length===1&&token(args[0])},
  adminLogout:{target:'monthly',valid:args=>args.length===1&&token(args[0])},
  adminSaveRules:{target:'monthly',valid:args=>args.length===3&&token(args[0])&&Array.isArray(args[1])&&args[1].length<=200&&args[1].every(word=>text(word,100))&&Number.isSafeInteger(args[2])&&args[2]>=0},
  getData:{target:'dashboard',valid:none},
  getDashboardLineLink:{target:'dashboard',valid:args=>args.length===1&&text(args[0],100)}
};
export function validateCall(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||!Object.hasOwn(methods,value.method)||!Array.isArray(value.args)||!methods[value.method].valid(value.args))throw new Error('invalid_request');
  return {method:value.method,args:value.args,target:methods[value.method].target};
}
