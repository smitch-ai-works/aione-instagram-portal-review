import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import vm from 'node:vm';
const context=vm.createContext({});vm.runInContext(fs.readFileSync('public/legacy/ng-rules.js','utf8'),context);
const policy=JSON.parse(JSON.stringify(context.MonthlyReportNgRules));policy.revision=0;
const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit'}).formatToParts(new Date()).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
const serial=Number(parts.year)*12+Number(parts.month)-1;
const month=offset=>{const n=serial-offset;return Math.floor(n/12)+'-'+String(n%12+1).padStart(2,'0');};
const previous=month(1),current=month(0),key=String(parts.year).slice(-2)+'年'+parts.month+'月';
test.beforeEach(async({page})=>{
 let words=['クーリングオフ','返金'],revision=0;
 await page.route('**/aione-instagram/api/rpc',async route=>{
   const {method,args}=route.request().postDataJSON();let response;
   if(method==='getMonthlyReportInit')response={students:[{id:'synthetic',name:'検証花子',readings:['けんしょうはなこ']}],months:[previous,month(2)],defaultMonth:previous};
   else if(method==='getMonthlyReportData')response={status:'ready',name:args[0],month:args[1],clients:0,revenue:0};
   else if(method==='getMonthlyReportPolicy')response=policy;
   else if(method==='adminLogin')response=args[0]==='synthetic-test-password'?{status:'ok',token:'f'.repeat(64),expiresAt:Date.now()+3600000}:{status:'invalid_password'};
   else if(method==='adminGetRules')response={status:'ok',revision,words,patterns:[]};
   else if(method==='adminSaveRules'){words=args[1];revision++;response={status:'ok',revision,words};}
   else if(method==='adminLogout')response={status:'ok'};
   else if(method==='getData')response={months:[key],students:[{name:'検証花子',readings:['けんしょうはなこ'],totalClients:3,totalRevenue:1200,monthly:{[key]:{clients:3,revenue:1200}}}]};
   else response={status:'not_found'};
   await route.fulfill({json:response});
 });
});
test('home and all navigation stay below the selected path at 320 / 390 / 1280px',async({page})=>{
 for(const width of [320,390,1280]){
   await page.setViewportSize({width,height:844});await page.goto('/aione-instagram');await expect(page.getByRole('heading',{name:'AI ONEインスタ部門',exact:true})).toBeVisible();
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
   for(const path of ['/monthly-report','/results','/admin'])await expect(page.locator('a[href="/aione-instagram'+path+'"]')).toBeVisible();
 }
});
test('monthly report screens the examples and preserves the source without the GAS browser SDK',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/aione-instagram/monthly-report');
 await expect(page.locator('#name')).toBeEnabled();await page.locator('#name').fill('検証花子');await expect(page.locator('#workspace')).toBeVisible();
 const original='クーリングオフで収益が減った。毎週の投稿を継続できた。';await page.locator('#good').fill(original);await page.locator('#growth').fill('セールスチームに企画やってもらった。次月の投稿計画を見直した。');
 await page.locator('#create').click();await expect(page.locator('#result')).toBeVisible();await expect(page.locator('#report')).not.toContainText('クーリングオフ');await expect(page.locator('#report')).not.toContainText('やってもらった');await expect(page.locator('#report')).toContainText('毎週の投稿を継続できた。');
 await page.locator('#edit').click();await expect(page.locator('#good')).toHaveValue(original);expect(errors).toEqual([]);
 await page.getByRole('link',{name:'ホームに戻る'}).click();await expect(page).toHaveURL(/\/aione-instagram\/?$/);
});
test('admin rejects wrong password and saves the managed list through Next RPC',async({page})=>{
 await page.goto('/aione-instagram/admin');await page.getByLabel('管理者パスワード',{exact:true}).fill('wrong-password');await page.getByRole('button',{name:'管理者ページを開く'}).click();await expect(page.locator('#login-status')).toContainText('パスワードが違います');
 await page.getByLabel('管理者パスワード',{exact:true}).fill('synthetic-test-password');await page.getByRole('button',{name:'管理者ページを開く'}).click();await expect(page.locator('#manager')).toBeVisible();
 await page.getByLabel('登録する言葉',{exact:true}).fill('クーリングオフ\n返金\n検証用の語句');await page.getByRole('button',{name:'NGワードを保存する'}).click();await expect(page.locator('#save-status')).toContainText('保存しました');
 await page.getByRole('button',{name:'最新の設定を読み直す'}).click();await expect(page.locator('#save-status')).toContainText('最新の設定を読み込みました');await expect(page.locator('#words')).toHaveValue(/検証用の語句/);
});
test('admin waits for delayed runtime initialization before accepting a password or submit',async({page})=>{
 let releaseRuntime;const runtimeReady=new Promise(resolve=>{releaseRuntime=resolve;});
 await page.route('**/legacy/admin-app.js',async route=>{await runtimeReady;await route.continue();});
 try{
  await page.goto('/aione-instagram/admin');
  const password=page.getByLabel('管理者パスワード',{exact:true}),login=page.getByRole('button',{name:'管理者ページを開く'});
  await expect(password).toBeDisabled();await expect(login).toBeDisabled();
  releaseRuntime();await expect(password).toBeEnabled();await password.fill('wrong-password');await login.click();
  await expect(page.locator('#login-status')).toContainText('パスワードが違います');
 }finally{releaseRuntime();}
});
test('results keeps personal figures and ranks only revenue over 5000 for each period',async({page})=>{
 await page.route('**/aione-instagram/api/rpc',async route=>{
   if(route.request().postDataJSON().method!=='getData')return route.fallback();
   const priorKey=String(Number(parts.year)-1).slice(-2)+'年12月';
   const students=[
     {name:'検証花子',revenue:1200,total:1200},
     {name:'境界未満',revenue:4999,total:4999},
     {name:'境界一致',revenue:5000,total:5000},
     {name:'境界超過',revenue:5001,total:5001},
     {name:'上位',revenue:10000,total:10000},
     {name:'過去のみ',revenue:0,total:8000}
   ].map(({name,revenue,total})=>({name,totalClients:3,totalRevenue:total,monthly:{[key]:{clients:3,revenue},[priorKey]:{clients:0,revenue:total-revenue}}}));
   await route.fulfill({json:{months:[priorKey,key],students}});
 });
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/aione-instagram/results');
 await expect(page.locator('#app')).toBeVisible().catch(async error=>{console.log({errors,scripts:await page.locator('script[src*="/legacy/"]').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('src'))),status:await page.locator('[role="alert"]').allTextContents()});throw error;});
 await page.getByLabel('名前・ふりがな',{exact:true}).fill('検証花子');await expect(page.locator('#student-results')).toBeVisible();await expect(page.locator('#val-revenue')).toContainText('1,200');
 await page.getByRole('button',{name:'ランキング',exact:true}).click();
 for(const mode of ['month','year','all']){
   await page.locator('[data-period-owner="ranking"][data-period-mode="'+mode+'"]').click();
   await expect(page.locator('.ranking-name')).toHaveText(mode==='all'?['上位','過去のみ','境界超過']:['上位','境界超過']);
   await expect(page.locator('.rank-badge')).toHaveText(mode==='all'?['1','2','3']:['1','2']);
 }
 expect(errors).toEqual([]);
});
test('monthly copy preserves full text and downloads a 1080px report PNG',async({page,context})=>{
 await context.grantPermissions(['clipboard-read','clipboard-write']);
 await page.route('**/aione-instagram/api/rpc',async route=>{
   const {method,args}=route.request().postDataJSON();
   if(method==='getMonthlyReportData')await route.fulfill({json:{status:'ready',name:args[0],month:args[1],clients:3,revenue:1200}});else await route.fallback();
 });
 await page.goto('/aione-instagram/monthly-report');await expect(page.locator('#name')).toBeEnabled();await page.locator('#name').fill('検証花子');await expect(page.locator('#workspace')).toBeVisible();
 await page.locator('#good').fill('週3回の投稿を継続できた。');await page.locator('#create').click();await expect(page.locator('#result')).toBeVisible();
 const text=await page.locator('#report').innerText();const downloadPromise=page.waitForEvent('download');await page.locator('#copy').click();
 const download=await downloadPromise,bytes=fs.readFileSync(await download.path());expect(bytes.subarray(1,4).toString()).toBe('PNG');expect(bytes.readUInt32BE(16)).toBe(1080);expect(bytes.readUInt32BE(20)).toBe(1080);
 await expect(page.locator('#action-feedback')).toBeVisible();expect((await page.evaluate(()=>navigator.clipboard.readText())).replace(/\r\n/g,'\n')).toBe(text.replace(/\r\n/g,'\n'));
});
test('results keeps both SNS and internal PNG saving after the migration',async({page})=>{
 await page.goto('/aione-instagram/results');await expect(page.locator('#app')).toBeVisible();await page.getByLabel('名前・ふりがな',{exact:true}).fill('検証花子');await expect(page.locator('#student-results')).toBeVisible();
 for(const id of ['download-shared-button','download-report-button']){
   const pending=page.waitForEvent('download');await page.locator('#'+id).click();const file=await pending,bytes=fs.readFileSync(await file.path());
   expect(bytes.subarray(1,4).toString()).toBe('PNG');expect(bytes.readUInt32BE(16)).toBe(1080);expect(bytes.readUInt32BE(20)).toBe(1080);
 }
});
test('results refreshes changed data while keeping the selected person, query and period',async({page})=>{
 await page.clock.install();let calls=0;
 await page.route('**/aione-instagram/api/rpc',async route=>{
  if(route.request().postDataJSON().method!=='getData')return route.fallback();
  calls++;const revenue=calls===1?1200:2200;
  await route.fulfill({json:{months:[key],students:[{name:'検証花子',hiragana:'けんしょうはなこ',totalClients:3,totalRevenue:revenue,monthly:{[key]:{clients:3,revenue}}}]}});
 });
 await page.goto('/aione-instagram/results');await expect(page.locator('#app')).toBeVisible();await page.getByLabel('名前・ふりがな',{exact:true}).fill('検証花子');
 await page.locator('[data-period-owner="student"][data-period-mode="year"]').click();await expect(page.locator('#val-revenue')).toContainText('1,200');
 await page.clock.runFor(61000);await expect(page.locator('#val-revenue')).toContainText('2,200');await expect(page.locator('#student-search')).toHaveValue('検証花子');
 await expect(page.locator('[data-period-owner="student"][data-period-mode="year"]')).toHaveAttribute('aria-pressed','true');await expect(page.locator('#student-results')).toBeVisible();expect(calls).toBeGreaterThanOrEqual(2);
});
test('LINE panel follows server permission and ignores a delayed link for the previous selection',async({page})=>{
 let release,linkCalls=0,lateFinished=false;
 const delayed=new Promise(resolve=>{release=resolve;});
 const url='https://sub.aione.co.jp/line/open/test?mtid=synthetic';
 await page.route('**/aione-instagram/api/rpc',async route=>{
  const {method,args}=route.request().postDataJSON();
  if(method==='getData')return route.fulfill({json:{months:[key],students:['検証花子','検証太郎'].map(name=>({name,totalClients:3,totalRevenue:1200,monthly:{[key]:{clients:3,revenue:1200}}}))}});
  if(method!=='getDashboardLineLink')return route.fallback();
  if(args[0]!=='検証花子')return route.fulfill({json:{enabled:false}});
  linkCalls++;
  if(linkCalls===1){await delayed;await route.fulfill({json:{enabled:true,status:'ready',url}});lateFinished=true;return;}
  return route.fulfill({json:linkCalls===2?{enabled:true,status:'ready',url}:{enabled:true,status:'unavailable'}});
 });
 try{
  await page.goto('/aione-instagram/results');await expect(page.locator('#app')).toBeVisible();
  const search=page.getByLabel('名前・ふりがな',{exact:true}),panel=page.locator('#dashboard-line-link-panel');
  await search.fill('検証花子');await expect.poll(()=>linkCalls).toBe(1);await expect(panel).toBeHidden();
  await search.fill('検証太郎');await expect(page.locator('#student-results')).toBeVisible();release();
  await expect.poll(()=>lateFinished).toBe(true);await expect(panel).toBeHidden();
  await search.fill('検証花子');await expect(panel).toBeVisible();await expect(page.locator('#dashboard-line-link-url')).toHaveValue(url);
  await page.locator('#dashboard-line-link-refresh').click();await expect(page.locator('#dashboard-line-link-status')).toContainText('取得できませんでした');
  await expect(page.locator('#dashboard-line-link-tools')).toBeHidden();
 }finally{release();}
});
test('monthly background refresh keeps the draft and chosen month while updating actual figures',async({page})=>{
 await page.clock.install();let calls=0;
 await page.route('**/aione-instagram/api/rpc',async route=>{
  const {method,args}=route.request().postDataJSON();if(method!=='getMonthlyReportData')return route.fallback();calls++;
  await route.fulfill({json:{status:'ready',name:args[0],month:args[1],clients:calls===1?1:4,revenue:calls===1?1200:2200}});
 });
 await page.goto('/aione-instagram/monthly-report');await expect(page.locator('#name')).toBeEnabled();await page.locator('#name').fill('検証花子');await expect(page.locator('#workspace')).toBeVisible();
 await page.locator('#good').fill('入力途中の振り返りです。');await expect(page.locator('#revenue')).toContainText('1,200');
 await page.clock.runFor(61000);await expect(page.locator('#revenue')).toContainText('2,200');await expect(page.locator('#clients')).toContainText('4');
 await expect(page.locator('#good')).toHaveValue('入力途中の振り返りです。');await expect(page.locator('#month')).toHaveValue(previous);expect(calls).toBeGreaterThanOrEqual(2);
});
test('TOP5 private download keeps invalid links closed and uses the native RPC for a 1080px PNG',async({page})=>{
 await page.goto('/aione-instagram/results?ranking_image=invalid');await expect(page.getByText('このリンクは利用できません。')).toBeVisible();
 const pending=page.waitForEvent('download');await page.goto('/aione-instagram/results?ranking_image=synthetic-top5-key-for-browser-tests-123456');
 const file=await pending,bytes=fs.readFileSync(await file.path());expect(bytes.readUInt32BE(16)).toBe(1080);expect(bytes.readUInt32BE(20)).toBe(1080);
});
test('scheduled jobs require authentication and stay disabled before cutover',async({request})=>{
 const url='/aione-instagram/api/jobs/revenue';expect((await request.post(url)).status()).toBe(403);
 const result=await request.post(url,{headers:{authorization:'Bearer synthetic-scheduler-secret-for-tests-123456'}});expect(result.status()).toBe(200);expect(await result.json()).toEqual({status:'disabled'});
});
test('monthly output matches live GAS: disclose saving, keep the OpenChat link, and retry with the same request ID',async({page,context})=>{
 await context.grantPermissions(['clipboard-read','clipboard-write']);const entries=[];
 await context.route('https://line.me/**',route=>route.fulfill({body:'OpenChat preview'}));page.on('popup',popup=>void popup.close());
 await page.route('**/aione-instagram/api/rpc',async route=>{
  const {method,args}=route.request().postDataJSON();
  if(method==='getMonthlyReportInit')return route.fulfill({json:{students:[{id:'synthetic',name:'検証花子',readings:[]}],months:[previous,month(2)],defaultMonth:previous,monthlyOutputEnabled:true}});
  if(method==='saveMonthlyOutput'){entries.push(args[0]);return route.fulfill({json:{status:entries.length===1?'unavailable':'saved'}});}
  return route.fallback();
 });
 await page.goto('/aione-instagram/monthly-report');await expect(page.locator('#name')).toBeEnabled();await page.locator('#name').fill('検証花子');await expect(page.locator('#workspace')).toBeVisible();
 await page.locator('#good').fill('返金への対応をした。投稿を継続できた。');await page.locator('#create').click();await page.locator('#copy').click();await expect(page.locator('#action-feedback')).toBeVisible();
 await expect(page.getByText('アウトプットを押すと、氏名・実績・振り返りが、リンクを知っている人が閲覧できる月報ログに保存されます。LINEにはオプチャで貼り付けて送信してください。')).toBeVisible();
 await page.locator('#feedback-line').click();await expect(page.getByRole('button',{name:'台帳への保存を再試行',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'台帳への保存を再試行',exact:true}).click();await expect(page.getByText('台帳に保存しました。LINEの投稿はオプチャで送信してください。')).toBeVisible();
 expect(entries.length).toBe(2);expect(entries[0].id).toBe(entries[1].id);expect(entries[0].name).toBe('検証花子');expect(entries[0].month).toBe(previous);expect(entries[0].draft.good).toBe('投稿を継続できた。');
 await page.locator('#feedback-line').click();expect(entries.length).toBe(2);
});
test('monthly output stays off when the backend reports permission or configuration unavailable',async({page,context})=>{
 await context.grantPermissions(['clipboard-read','clipboard-write']);let saves=0;
 await context.route('https://line.me/**',route=>route.fulfill({body:'OpenChat preview'}));page.on('popup',popup=>void popup.close());
 await page.route('**/aione-instagram/api/rpc',async route=>{if(route.request().postDataJSON().method==='saveMonthlyOutput'){saves++;return route.fulfill({json:{status:'unavailable'}});}return route.fallback();});
 await page.goto('/aione-instagram/monthly-report');await expect(page.locator('#name')).toBeEnabled();await page.locator('#name').fill('検証花子');await expect(page.locator('#workspace')).toBeVisible();await page.locator('#good').fill('投稿を継続できた。');await page.locator('#create').click();await page.locator('#copy').click();await expect(page.locator('#feedback-line')).toBeVisible();await page.locator('#feedback-line').click();expect(saves).toBe(0);
});
