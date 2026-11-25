// Copies only reviewed public UI. No original access key is read or copied.
import fs from 'node:fs/promises';
import path from 'node:path';
const base=process.argv[2];if(!base)throw Error('Pass original TOP5 frontend directory');
await fs.copyFile(path.join(base,'ranking-top5.js'),'public/legacy/ranking-top5.js');
const controller=(await fs.readFile(path.join(base,'download-controller.js'),'utf8')).replace('google.script.run.withSuccessHandler(loaded).withFailureHandler(failed).getData();',"window.PortalRpc('getData').then(loaded).catch(failed);");
if(controller.includes('google.script'))throw Error('Unported browser dependency');await fs.writeFile('public/legacy/top5-download.js',controller);
const html=await fs.readFile(path.join(base,'download-page.html'),'utf8'),markup=html.match(/<body[^>]*>([^]*?)<\/body>/i)[1],styles=html.match(/<style[^>]*>([^]*?)<\/style>/i)[1];
await fs.writeFile('src/legacy/top5-view.js','// Reviewed public TOP5 download view.\nexport const top5View='+JSON.stringify({markup,styles,scripts:['portal-rpc.js','ranking-top5.js','top5-download.js']})+';\n');
