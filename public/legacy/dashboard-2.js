
(()=>{
 const byId=id=>document.getElementById(id);
 const normalize=name=>String(name||'').normalize('NFKC').replace(/\s/g,'');
 let selectedName='',revision=0,currentUrl='';
 function setStatus(text){byId('dashboard-line-link-status').textContent=text;}
 function clearLink(){currentUrl='';byId('dashboard-line-link-url').value='';byId('dashboard-line-link-tools').hidden=true;byId('dashboard-line-link-copy').disabled=true;}
 function load(){
  if(!selectedName)return;
  const request=++revision,name=selectedName;clearLink();setStatus('リンクを確認しています…');
  byId('dashboard-line-link-refresh').disabled=true;
  const current=()=>request===revision&&name===selectedName;
  const failed=()=>{if(!current())return;byId('dashboard-line-link-refresh').disabled=false;setStatus('リンクを取得できませんでした。「更新する」で再確認してください。');};
  window.PortalRpc('getDashboardLineLink',[name]).then(result=>{
   if(!current())return;byId('dashboard-line-link-refresh').disabled=false;
   byId('dashboard-line-link-panel').hidden=result?.enabled!==true;
   if(result?.enabled!==true){setStatus('');return;}
   if(result&&result.enabled&&result.status==='ready'&&typeof result.url==='string'&&/^https:\/\/sub\.aione\.co\.jp\/line\/open\/[A-Za-z0-9_-]+\?mtid=[A-Za-z0-9_-]+$/.test(result.url)){
    currentUrl=result.url;byId('dashboard-line-link-url').value=currentUrl;byId('dashboard-line-link-tools').hidden=false;byId('dashboard-line-link-copy').disabled=false;setStatus('現在登録されているリンクです。');
   }else if(result?.status==='multiple'){setStatus('複数のLINEリンクが登録されています。担当者に確認してください。');}
   else if(result?.status==='not_found'){setStatus('LINEリンクはまだ登録されていません。');}
   else failed();
  }).catch(failed);
 }
 window.syncDashboardLineLink=name=>{
  const next=normalize(name);if(next===selectedName)return;
  selectedName=next;++revision;clearLink();byId('dashboard-line-link-panel').hidden=true;byId('dashboard-line-link-refresh').disabled=false;setStatus('');
  if(next)load();
 };
 byId('dashboard-line-link-refresh').addEventListener('click',load);
 byId('dashboard-line-link-copy').addEventListener('click',async()=>{
  const url=currentUrl,copyRevision=revision;if(!url)return;
  try{await navigator.clipboard.writeText(url);if(copyRevision===revision)setStatus('コピーしました。');}
  catch(error){if(copyRevision!==revision)return;const input=byId('dashboard-line-link-url');input.focus();input.select();input.setSelectionRange(0,input.value.length);try{if(document.execCommand('copy')){setStatus('コピーしました。');return;}}catch(ignored){}setStatus('リンクを選択しました。長押しなどでコピーしてください。');}
 });
})();
