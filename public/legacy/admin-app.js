'use strict';
(()=>{
  const $=id=>document.getElementById(id);let token='',revision=0,busy=false,pendingEdit=null;
  function words(){return $('words').value.split(/\r?\n/).map(word=>word.trim()).filter(Boolean);}
  function count(){$('word-count').textContent=words().length+'語';}
  function message(id,text,error=false){$(id).textContent=text;$(id).classList.toggle('error',error);}
  function setBusy(value){busy=value;for(const id of ['login','save','reload','logout','try','words'])$(id).disabled=value;}
  function signedOut(text){token='';$('manager').hidden=true;$('logout').hidden=true;$('login-panel').hidden=false;message('login-status',text,!!text);$('password').focus();}
  function rpc(method,...args){return window.PortalRpc(method,args);}
  function requireSession(response){if(response.status==='unauthorized'){if(!$('manager').hidden)pendingEdit={words:$('words').value,revision};signedOut('もう一度パスワードを入力してください。編集中のリストは残しています。');return false;}return true;}
  function render(response){revision=response.revision;$('words').value=response.words.join('\n');count();$('pattern-list').replaceChildren(...response.patterns.map(rule=>{const item=document.createElement('li');item.textContent=rule.reason;return item;}));}
  async function load(){const response=await rpc('adminGetRules',token);if(!requireSession(response))return false;if(response.status!=='ok')throw new Error('load');render(response);return true;}
  $('login-form').addEventListener('submit',async event=>{
    event.preventDefault();if(busy)return;const password=$('password').value;$('password').value='';setBusy(true);message('login-status','確認しています…');
    try{const response=await rpc('adminLogin',password);if(response.status!=='ok'){
      const text=response.status==='locked'?'入力の失敗が続いたため、しばらくログインできません。10分ほど置いてから試してください。':response.status==='not_configured'?'管理者パスワードがまだ設定されていません。初期設定を完了してから開いてください。':response.status==='invalid_password'?'パスワードが違います。もう一度入力してください。':'ログインできませんでした。少し待ってから試してください。';message('login-status',text,true);return;
    }
    token=response.token;if(!await load())return;$('login-panel').hidden=true;$('manager').hidden=false;$('logout').hidden=false;
    if(pendingEdit){$('words').value=pendingEdit.words;revision=pendingEdit.revision;pendingEdit=null;count();message('save-status','編集中のリストを戻しました。まだ保存されていません。内容を確認して保存してください。');}else message('save-status','');$('words').focus();
    }catch{message('login-status','読み込めませんでした。通信を確認して、もう一度試してください。',true);}finally{setBusy(false);}
  });
  $('words').addEventListener('input',()=>{count();message('save-status','変更内容はまだ保存されていません。');$('try-result').hidden=true;});
  $('save').addEventListener('click',async()=>{
    if(busy||!token)return;setBusy(true);message('save-status','保存しています…');
    try{const response=await rpc('adminSaveRules',token,words(),revision);if(!requireSession(response))return;
      if(response.status==='ok'){revision=response.revision;$('words').value=response.words.join('\n');count();message('save-status','保存しました。次に月報を作る時から、このリストで判定します。');}
      else message('save-status',response.status==='conflict'?'別の画面で設定が変わっています。入力は残っています。最新の設定を読み直してから編集してください。':response.status==='invalid_words'?'保存できませんでした。1語の長さや、登録する言葉の数を減らしてください。':'保存できませんでした。通信を確認して、もう一度試してください。',true);
    }catch{message('save-status','保存できませんでした。入力は残っています。通信を確認して、もう一度試してください。',true);}finally{setBusy(false);}
  });
  $('reload').addEventListener('click',async()=>{if(busy)return;setBusy(true);try{if(await load())message('save-status','最新の設定を読み込みました。');}catch{message('save-status','読み込めませんでした。通信を確認して、もう一度試してください。',true);}finally{setBusy(false);}});
  $('logout').addEventListener('click',async()=>{if(busy)return;setBusy(true);try{await rpc('adminLogout',token);pendingEdit=null;signedOut('ログアウトしました。');}catch{message('save-status','ログアウトできませんでした。通信を確認して、もう一度試してください。',true);}finally{setBusy(false);}});
  $('try').addEventListener('click',()=>{
    const policy=JSON.parse(JSON.stringify(window.MonthlyReportNgRules));policy.rules.forEach(rule=>rule.words=[]);
    const list=words();if(list.length)policy.rules.unshift({id:'test-words',reason:'NGワード',guidance:'入力例',words:list});
    if(!window.MonthlyReport.setScreeningPolicy(policy))return;const check=window.MonthlyReport.screenDraft({good:$('sample').value});
    $('sample-output').textContent=check.draft.good||'残る文章はありません。';$('try-result').hidden=false;
  });
  window.addEventListener('beforeunload',()=>{token='';});
})();
