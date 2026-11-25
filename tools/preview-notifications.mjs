import {createJobService} from '../lib/notifications/service.mjs';
import {jobNames} from '../lib/notifications/reports.mjs';
const service=createJobService();
for(const job of jobNames){const report=await service.prepare(job);console.log(JSON.stringify({job,month:report.month,people:report.people,messages:report.messages.length,updates:report.plan?.updates.length,sent:false}));}
