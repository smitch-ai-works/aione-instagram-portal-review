'use strict';
const Core=window.MonthlyReport,Data=window.MonthlyData,$=id=>document.getElementById(id);
let students=[],selected=null,monthly=null,requestVersion=0,buildVersion=0,activeKey='',built=null,imageUrl='',candidateIndex=-1,isComposing=false;
const draftFields=[...Core.fields,...Core.activityFields];
const drafts=new Map(),readDraft=()=>Object.fromEntries(draftFields.map(([k])=>[k,$(k).value]));
async function refreshPolicy(version){
  const policy=await Data.policy();if(version!==buildVersion)return false;
  if(!Core.setScreeningPolicy(policy))throw new Error('policy');return true;
}
function screeningError(check){
  $('form-status').textContent=!check.ready?'文章チェックの設定を読み込めませんでした。ページを再読み込みしてください。':'共有できる内容が残っていません。ご自身の取り組みや次の行動を追加してください。';
  $('form-status').classList.add('error');if(check.ready&&check.issues.length)$(check.issues[0].field).focus();
}
function showReportText(snapshot){
  $('report').textContent=snapshot.text;
}
function renderActivity(){
  $('storyDays').max=Core.daysInMonth($('month').value);
  const activity=Core.activityData(readDraft(),$('month').value),difference=activity.difference;
  $('followers-difference').textContent=difference===null?'両月末の人数を入力すると、増減が表示されます。':`フォロワー増減：${Core.signedCount(difference)}人`;
  $('followers-difference').classList.toggle('has-value',difference!==null);
}
function canCreate(){return monthly&&Core.reportDisplay(monthly).ready&&Core.screenDraft().ready;}
function stash(){if(activeKey)drafts.set(activeKey,readDraft());}
function clearResult(){++buildVersion;built=null;if($('action-feedback').open)$('action-feedback').close();if($('result').open)$('result').close();if($('image-dialog').open)$('image-dialog').close();if(imageUrl)URL.revokeObjectURL(imageUrl);imageUrl='';$('save-image').removeAttribute('src');$('report').textContent='';$('status').textContent='';$('copy-fallback').value='';$('fallback').hidden=true;$('copy').disabled=true;$('copy').removeAttribute('aria-busy');$('create').disabled=!canCreate();$('create').textContent='月報を作成する';}
function hideCandidates(){$('candidates').hidden=true;$('name').setAttribute('aria-expanded','false');$('name').removeAttribute('aria-activedescendant');candidateIndex=-1;}
function showCandidates(){
  const query=$('name').value,host=$('candidates');host.replaceChildren();candidateIndex=-1;if(!query.trim()){hideCandidates();return;}
  const matches=Core.searchStudents(students,query);if(!matches.length){const el=document.createElement('div');el.className='no-match';el.textContent='候補がありません。名前を確認するか、担当者にお知らせください。';host.append(el);}
  matches.forEach((s,i)=>{const b=document.createElement('button');b.type='button';b.id=`candidate-${i}`;b.className='candidate';b.setAttribute('role','option');b.setAttribute('aria-selected','false');const n=document.createElement('strong');n.textContent=s.name;const r=document.createElement('small');r.textContent=(s.readings||[]).join(' / ');b.append(n,r);b.addEventListener('click',()=>choose(s));host.append(b);});host.hidden=false;$('name').setAttribute('aria-expanded','true');
}
function empty(title,description){$('workspace').hidden=true;$('empty').hidden=false;$('empty-title').textContent=title;$('empty-description').textContent=description;}
function fitMetrics(){
  $('metrics').classList.toggle('long-values',$('revenue').textContent.length>11||$('clients').textContent.length>8);
  document.querySelectorAll('.metric>strong').forEach(el=>{el.style.fontSize='';let size=parseFloat(getComputedStyle(el).fontSize);while(el.scrollWidth>el.clientWidth&&size>16){size-=1;el.style.fontSize=size+'px';}});
}
function renderMonthly(){
  if(!monthly)return;
  const display=Core.reportDisplay(monthly);
  $('form-title').textContent=`${Core.monthLabel(monthly.month)}の${display.showLists||display.showRevenue?'実績':'月報'}`;
  $('clients-card').hidden=!display.showLists;$('revenue-card').hidden=!display.showRevenue;
  $('metrics').hidden=!display.showLists&&!display.showRevenue;$('metrics').classList.toggle('single',!display.showRevenue);
  $('clients').textContent=display.showLists?monthly.clients.toLocaleString('ja-JP'):'';$('revenue').textContent=display.showRevenue?Core.money(monthly.revenue):'';
  $('auto-note').textContent=display.showLists||display.showRevenue?'実績は反映済みです。投稿の記録と振り返りを入力してください。':'投稿の記録と振り返りを入力してください。';
  $('create').disabled=!canCreate();if(!Core.screenDraft().ready)screeningError(Core.screenDraft());fitMetrics();
}
async function loadMonth(){
  const version=++requestVersion;clearResult();monthly=null;$('clients').textContent='';$('revenue').textContent='';$('form-status').textContent='';$('form-status').classList.remove('error');$('create').disabled=true;$('create').textContent='月報を作成する';
  activeKey=selected?`${selected.id}:${$('month').value}`:'';const draft=drafts.get(activeKey)||{};draftFields.forEach(([k])=>$(k).value=draft[k]??'');renderActivity();$('selected-name').textContent=selected?`${selected.name} を選択中`:'';
  if(!selected){empty('名前を選ぶと、月報を作れます','漢字でも、ひらがなでも検索できます。');return;}
  const identity=selected,month=$('month').value;empty('この月の実績を確認しています','少しお待ちください。');
  try{
    const response=await Data.monthly(identity.name,month);if(version!==requestVersion)return;
    const s={monthly:{[month]:{clients:response.clients,revenue:response.revenue}}},state=Core.getMonthlyState(s,month);
    if(response.status!=='ready'||response.name!==identity.name||response.month!==month||!['revenue','zero'].includes(state.kind)){empty('この月の実績を確認できません','別の月を選ぶか、担当者に確認してください。0円とは判定していません。');return;}
    monthly={...state,month,name:identity.name};$('empty').hidden=true;$('workspace').hidden=false;renderMonthly();
  }catch{if(version===requestVersion)empty('実績を読み込めませんでした','通信を確認して、名前や報告月を選び直してください。');}
}
function choose(s){stash();selected=s;$('name').value=s.name;hideCandidates();return loadMonth();}
function onNameInput(){
  if(isComposing)return;if(selected&&Core.normalizeName($('name').value)!==Core.normalizeName(selected.name)){stash();selected=null;void loadMonth();}
  const q=Core.normalizeName($('name').value),exact=q?students.filter(s=>[s.name,...(s.readings||[])].some(n=>Core.normalizeName(n)===q)):[];
  if(exact.length===1){void choose(exact[0]);return;}showCandidates();
}
$('name').addEventListener('compositionstart',()=>{isComposing=true;});$('name').addEventListener('compositionend',()=>{isComposing=false;onNameInput();});$('name').addEventListener('input',onNameInput);$('name').addEventListener('focus',showCandidates);
$('name').addEventListener('keydown',e=>{
  if(isComposing||e.isComposing)return;if(e.key==='Escape'){hideCandidates();return;}const buttons=[...$('candidates').querySelectorAll('.candidate')];if($('candidates').hidden||!buttons.length)return;
  if(e.key==='Enter'){e.preventDefault();buttons[candidateIndex<0?0:candidateIndex].click();return;}
  if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();candidateIndex=(candidateIndex+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;buttons.forEach((b,i)=>b.setAttribute('aria-selected',String(i===candidateIndex)));$('name').setAttribute('aria-activedescendant',buttons[candidateIndex].id);}
});
document.addEventListener('click',e=>{if(!e.target.closest('.name-wrap'))hideCandidates();});$('month').addEventListener('change',()=>{stash();void loadMonth();});$('refresh').addEventListener('click',()=>{stash();void loadMonth();});draftFields.forEach(([k])=>$(k).addEventListener('input',()=>{stash();clearResult();renderActivity();$('form-status').textContent='';$('form-status').classList.remove('error');}));
window.addEventListener('resize',()=>{if(monthly)fitMetrics();});
$('reflection-form').addEventListener('submit',async e=>{
  e.preventDefault();if(!canCreate()||!selected)return;stash();clearResult();const version=buildVersion,snapshot={...monthly,draft:readDraft()},s={name:monthly.name,monthly:{[monthly.month]:monthly}};
  $('create').disabled=true;$('create').textContent='月報を準備しています…';
  try{if(!await refreshPolicy(version))return;}catch{if(version===buildVersion){screeningError({ready:false,issues:[]});$('create').disabled=!canCreate();$('create').textContent='月報を作成する';}return;}
  const check=Core.screenDraft(snapshot.draft);if(!check.ready){screeningError(check);return;}
  const activity=Core.activityData(snapshot.draft,snapshot.month);
  if(!activity.valid){$('form-status').textContent=activity.error;$('form-status').classList.add('error');$('create').disabled=!canCreate();$('create').textContent='月報を作成する';return;}
  snapshot.text=Core.reportText(s,snapshot.month,snapshot.draft);if(!snapshot.text){screeningError(check);$('create').disabled=!canCreate();$('create').textContent='月報を作成する';return;}$('form-status').textContent='';
  try{
    if(snapshot.kind==='revenue'){window.drawInternalReport($('image'),snapshot.revenue,snapshot.month,Data.preview);snapshot.blob=await new Promise((resolve,reject)=>$('image').toBlob(b=>b?resolve(b):reject(new Error('image')),'image/png'));}
    if(version!==buildVersion)return;built=snapshot;if(snapshot.blob)imageUrl=URL.createObjectURL(snapshot.blob);
    showReportText(snapshot);$('result-person').textContent=`${snapshot.name} · ${Core.monthLabel(snapshot.month)}`;$('image-area').hidden=snapshot.kind!=='revenue';$('copy-image-label').hidden=!snapshot.blob;$('copy-note').textContent='内容を確認したら、下のボタンを押してください。';$('copy').disabled=false;$('result').showModal();$('result-title').focus();
  }catch{if(version===buildVersion){$('form-status').textContent='画像を準備できませんでした。もう一度「月報を作成する」を押してください。';$('form-status').classList.add('error');}}
  finally{if(version===buildVersion){$('create').disabled=!canCreate();$('create').textContent='月報を作成する';}}
});
function downloadImage(){if(!built||!imageUrl)return false;const a=document.createElement('a');a.href=imageUrl;a.download=`${Data.preview?'DEMO_':''}Report_${built.name}_${built.month}.png`;document.body.append(a);try{a.click();return true;}catch{return false;}finally{a.remove();}}
function copyUsingSelection(text){
  const input=document.createElement('textarea');input.value=text;input.readOnly=true;input.style.cssText='position:fixed;left:-9999px;top:0;font-size:16px';$('result').append(input);
  try{input.focus();input.select();input.setSelectionRange(0,text.length);return document.execCommand('copy')===true;}catch{return false;}finally{input.remove();$('copy').focus();}
}
let feedbackTarget='copy';
function showActionFeedback(copied,imageStarted,hasImage,origin){
  feedbackTarget=copied===false?'copy-fallback':origin;
  const warning=copied===false||(copied===null&&!imageStarted);
  const title=copied===true?'文章をコピーしました！':copied===false?'コピーできませんでした':imageStarted?'画像の保存を開始しました':'画像を開いて保存してください';
  const description=copied===true?'文章はすべてコピーできています。':copied===false?'月報はできています。下のボタンで文章を選んで、コピーしてください。':imageStarted?'保存した画像を、オプチャで月報と一緒に送ってください。':'「画像が保存できなかったとき」を開くと、別の方法で保存できます。';
  $('feedback-title').textContent=title;$('feedback-description').textContent=description;
  $('feedback-icon').textContent=warning?'!':copied===null?'↓':'✓';$('action-feedback').classList.toggle('feedback-warning',warning);
  $('feedback-image').hidden=!hasImage||copied===null;$('feedback-image-title').textContent=imageStarted?'実績画像の保存も開始しました':'実績画像も保存してください';
  $('feedback-save-help').hidden=!hasImage;$('feedback-save-help').open=hasImage&&!imageStarted;$('feedback-ok').textContent=copied===false?'月報を選んでコピーする':'月報を見直す';
  $('feedback-line').hidden=copied!==true;$('feedback-line-note').hidden=copied!==true;$('feedback-ok').classList.toggle('quiet',copied===true);$('feedback-ok').classList.toggle('primary',copied!==true);
  $('status').classList.toggle('error',warning);$('status').textContent=(copied===true?'月報の文章をすべてコピーしました。':title)+(hasImage&&copied!==null?' '+$('feedback-image-title').textContent:'');
  $('action-feedback').showModal();$('feedback-title').focus();
}
$('action-feedback').addEventListener('close',()=>{
  const target=$(feedbackTarget);if(!$('result').open||!target)return;target.focus();if(feedbackTarget==='copy-fallback'){target.select();target.setSelectionRange(0,target.value.length);}
});
$('feedback-ok').addEventListener('click',()=>$('action-feedback').close());
function openImage(){if(imageUrl){$('save-image').src=imageUrl;$('image-dialog').showModal();}}
$('feedback-open-image').addEventListener('click',()=>{$('action-feedback').close();openImage();});
$('copy').addEventListener('click',async()=>{
  if(!built||$('copy').disabled)return;
  const version=buildVersion;$('copy').disabled=true;$('copy').setAttribute('aria-busy','true');$('status').textContent='文章を確認しています…';
  try{if(!await refreshPolicy(version))return;}catch{if(version===buildVersion){clearResult();screeningError({ready:false,issues:[]});}return;}
  const draft=readDraft(),check=Core.screenDraft(draft),s={name:built.name,monthly:{[built.month]:built}},text=Core.reportText(s,built.month,draft);
  if(!check.ready||!text){clearResult();screeningError(check);return;}
  const changed=text!==built.text;built={...built,draft,text};showReportText(built);$('fallback').hidden=true;$('copy-fallback').value='';
  if(changed){$('status').textContent='内容が変わったため、月報を更新しました。確認して、もう一度「文章をコピーする」を押してください。';$('status').classList.remove('error');$('copy').disabled=false;$('copy').removeAttribute('aria-busy');return;}
  const snapshot=built;$('status').textContent='文章をコピーしています…';$('status').classList.remove('error');
  // Keep the existing clipboard fallback; do not wait for clipboard before download.
  let task;try{task=navigator.clipboard.writeText(snapshot.text);}catch{task=Promise.reject(new Error('clipboard'));}let initiated=false;if(snapshot.blob)initiated=downloadImage();
  let copied=false;
  try{await task;copied=true;}catch{if(version===buildVersion)copied=copyUsingSelection(snapshot.text);}
  finally{if(version===buildVersion){$('copy').disabled=false;$('copy').removeAttribute('aria-busy');}}
  if(version!==buildVersion)return;
  if(!copied){$('fallback').hidden=false;$('copy-fallback').value=snapshot.text;}
  showActionFeedback(copied,initiated,!!snapshot.blob,'copy');
});
$('download').addEventListener('click',()=>{if(built&&imageUrl)showActionFeedback(null,downloadImage(),true,'download');});$('open-image').addEventListener('click',openImage);$('close-image').addEventListener('click',()=>$('image-dialog').close());for(const id of ['close','edit'])$(id).addEventListener('click',()=>{$('result').close();$('create').focus();});
async function init(){
  $('retry').hidden=true;$('name').disabled=true;$('month').disabled=true;$('create').disabled=true;empty('名前と報告月を読み込んでいます','少しお待ちください。');
  try{const [data,policy]=await Promise.all([Data.init(),Data.policy()]);outputNotice.hidden=!Data.outputEnabled;if(!Core.setScreeningPolicy(policy))throw new Error('policy');if(data.error||!Array.isArray(data.students)||!Array.isArray(data.months)||!data.months.length)throw new Error('init');students=data.students;$('month').replaceChildren(...data.months.map(m=>{const o=document.createElement('option');o.value=m;o.textContent=Core.monthLabel(m);return o;}));$('month').value=data.months.includes(data.defaultMonth)?data.defaultMonth:data.months[0];$('name').disabled=false;$('month').disabled=false;void loadMonth();}
  catch{empty('名前と報告月を読み込めませんでした','通信を確認して、もう一度お試しください。');$('retry').hidden=false;}
}
let monthlyOutputPending=null,monthlyOutputInFlight=false,monthlyOutputSource=null;
const outputLink=$('feedback-line');
const outputNotice=document.createElement('p');outputNotice.hidden=true;
outputNotice.textContent='アウトプットを押すと、氏名・実績・振り返りが、リンクを知っている人が閲覧できる月報ログに保存されます。LINEにはオプチャで貼り付けて送信してください。';
const outputStatus=document.createElement('p');outputStatus.setAttribute('role','status');
const outputRetry=document.createElement('button');outputRetry.type='button';outputRetry.hidden=true;
outputRetry.textContent='台帳への保存を再試行';outputRetry.className='quiet';
outputLink.parentNode.insertAdjacentElement('beforebegin',outputNotice);
outputLink.parentNode.insertAdjacentElement('afterend',outputStatus);
outputStatus.insertAdjacentElement('afterend',outputRetry);
function monthlyOutputId(){
 if(typeof crypto.randomUUID==='function')return crypto.randomUUID();
 const b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;
 const h=Array.from(b,x=>('0'+x.toString(16)).slice(-2)).join('');
 return [h.slice(0,8),h.slice(8,12),h.slice(12,16),h.slice(16,20),h.slice(20)].join('-');
}
async function sendMonthlyOutput(){
 if(!monthlyOutputPending||monthlyOutputInFlight)return;
 monthlyOutputInFlight=true;outputRetry.hidden=true;outputStatus.textContent='台帳に保存しています…';
 try{
   const ack=await Data.saveOutput(monthlyOutputPending);
   if(ack?.status==='saved'){monthlyOutputPending=null;outputStatus.textContent='台帳に保存しました。LINEの投稿はオプチャで送信してください。';}
   else if(ack?.status==='unavailable'){outputStatus.textContent='台帳は現在利用できません。LINEへの投稿は通常どおり行えます。';outputRetry.hidden=false;}
   else throw Error('retry');
 }catch{outputStatus.textContent='台帳に保存できませんでした。LINEへの投稿とは別です。';outputRetry.hidden=false;}
 finally{monthlyOutputInFlight=false;}
}
outputLink.addEventListener('click',()=>{
 if(!Data.outputEnabled||!built||monthlyOutputInFlight||monthlyOutputSource===built)return;
 try{
   const checked=Core.screenDraft(built.draft);
   if(!checked.ready||!checked.draft)return;
   monthlyOutputPending={id:monthlyOutputId(),name:built.name,month:built.month,draft:checked.draft};
   monthlyOutputSource=built;void sendMonthlyOutput();
 }catch{/* Leave the native anchor untouched, including in browsers lacking crypto. */}
});
outputRetry.addEventListener('click',()=>void sendMonthlyOutput());
$('retry').addEventListener('click',init);
void init();
let backgroundLoading=false;
async function refreshBackground(){
  if(backgroundLoading||document.hidden||document.querySelector('dialog[open]')||$('name').disabled)return; backgroundLoading=true;
  const identity=selected,month=$('month').value,version=requestVersion;
  try{
    const data=await Data.init();if(version!==requestVersion)return;
    if(data.error||!Array.isArray(data.students)||!data.months?.length)throw new Error('init');students=data.students;outputNotice.hidden=!Data.outputEnabled;
    if(!data.months.includes(month)){stash();$('month').replaceChildren(...data.months.map(m=>{const o=document.createElement('option');o.value=m;o.textContent=Core.monthLabel(m);return o;}));$('month').value=data.defaultMonth;await loadMonth();return;}
    if(!identity)return;
    const response=await Data.monthly(identity.name,month);if(version!==requestVersion||selected?.id!==identity.id)return;
    if(response.status!=='ready'||response.name!==identity.name||response.month!==month)throw new Error('monthly');
    const state=Core.getMonthlyState({monthly:{[month]:{clients:response.clients,revenue:response.revenue}}},month);if(!['revenue','zero'].includes(state.kind))throw new Error('monthly');
    if(!monthly||monthly.clients!==response.clients||monthly.revenue!==response.revenue){monthly={...state,month,name:identity.name};clearResult();renderMonthly();}
  }catch{if(version===requestVersion&&identity){monthly=null;clearResult();$('form-status').textContent='最新の実績を確認できませんでした。再取得してから月報を作成してください。';$('form-status').classList.add('error');}}
  finally{backgroundLoading=false;}
}
setInterval(refreshBackground,60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refreshBackground();});
