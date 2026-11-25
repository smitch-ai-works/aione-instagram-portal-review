// Read-only check. Prints only counts and booleans, never names, amounts or credentials.
import assert from 'node:assert/strict';
const origin=process.env.PORTAL_PUBLIC_ORIGIN||'http://127.0.0.1:3467',prefix=process.env.NEXT_PUBLIC_BASE_PATH||'/aione-instagram';
async function rpc(method,args=[]){const response=await fetch(origin+prefix+'/api/rpc',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({method,args}),signal:AbortSignal.timeout(90000)});assert(response.ok,'Next RPC failed for '+method+' ('+response.status+')');return response.json();}
const [init,policy,dashboard]=await Promise.all([rpc('getMonthlyReportInit'),rpc('getMonthlyReportPolicy'),rpc('getData')]);
assert(Array.isArray(init.students)&&init.students.length>0,'Live monthly roster unavailable');
assert(Array.isArray(policy.rules)&&policy.rules.length>0,'Live policy unavailable');
assert(Array.isArray(dashboard.students)&&dashboard.students.length>0,'Live dashboard unavailable');
const key=init.defaultMonth.slice(2,4)+'年'+init.defaultMonth.slice(5)+'月';
const person=init.students.find(s=>dashboard.students.some(d=>d.name===s.name&&d.monthly?.[key]));assert(person,'No overlapping student/month to check');
const data=await rpc('getMonthlyReportData',[person.name,init.defaultMonth]),expected=dashboard.students.find(d=>d.name===person.name).monthly[key];
assert.equal(data.status,'ready','Live monthly totals unavailable');
assert(data.clients===expected.clients&&data.revenue===expected.revenue,'Monthly and dashboard totals differ; inspect before handoff');
console.log(JSON.stringify({monthlyRosterLoaded:true,monthlyRosterCount:init.students.length,ngPolicyLoaded:true,dashboardLoaded:true,dashboardRosterCount:dashboard.students.length,monthlyDataReady:true,totalsMatchExistingDashboard:true,sourceSheetWritten:false}));
