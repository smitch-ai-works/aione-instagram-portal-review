// No write unless explicitly invoked with --apply after operator cutover approval.
import fs from 'node:fs/promises';
import {createSheetsReader} from '../lib/sheets-reader.mjs';
import {japanMonth} from '../lib/portal-data.mjs';
import {planSheetMaintenance,applySheetMaintenance} from '../lib/sheet-maintenance.mjs';
const config=JSON.parse(await fs.readFile(process.env.PORTAL_SOURCE_CONFIG_FILE,'utf8')),reader=createSheetsReader();
const [results,source]=await Promise.all([reader.read(config.results),reader.read({...config.source,range:'A:H'})]);
const plan=planSheetMaintenance(results.rows,source.rows,config,japanMonth());
if(process.argv.includes('--apply')){await applySheetMaintenance(plan);console.log(JSON.stringify({applied:true,gasChanged:false,notificationsSent:false}));}
else console.log(JSON.stringify({applied:false,rowCount:results.rows.length-1,monthColumnsToAdd:plan.requests.length?2:0,updatesPlanned:plan.updates.length}));
