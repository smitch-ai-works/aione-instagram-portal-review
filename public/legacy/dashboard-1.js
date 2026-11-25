
let appData = null;

  // 初期化
  let dashboardLoading=false;
  async function refreshDashboard(){
    if(dashboardLoading||document.hidden)return;dashboardLoading=true;
    try{const data=await window.PortalRpc('getData');if(!Array.isArray(data.students)||!Array.isArray(data.months))throw new Error('data');onDataLoaded(data);}
    catch{if(appData)document.getElementById('updated-at').textContent='最新の実績を確認できませんでした。表示中の数値は前回取得したものです。';else document.getElementById('loading').textContent='読み込めませんでした。ページを再読み込みしてください。';}
    finally{dashboardLoading=false;}
  }
  window.PortalStartDashboard=refreshDashboard;
  setInterval(refreshDashboard,60000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refreshDashboard();});

  let periodMonths = [];
  let periodYears = [];

  function parseMonthKey(value) {
    const raw = String(value || '').trim();
    let m = raw.match(/^(\d{2,4})年(\d{1,2})月$/) || raw.match(/^(\d{4})[-\/](\d{1,2})$/);
    if (!m) return null;
    let year = Number(m[1]);
    if (year < 100) year += 2000;
    const month = Number(m[2]);
    if (month < 1 || month > 12) return null;
    return { key: value, year, month, label: String(year).slice(-2) + '年' + String(month).padStart(2, '0') + '月' };
  }

  function onDataLoaded(data) {
    const previous=appData?{name:appData.students[document.getElementById('student-select').value]?.name,student:getSelectedPeriod('student'),ranking:getSelectedPeriod('ranking')}:null;
    appData = data;
    document.getElementById('loading').style.display = 'none';
    document.getElementById('app').style.display = 'block';
    document.getElementById('updated-at').textContent = '最終取得：' + new Date(data.checkedAt||Date.now()).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });

    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit' }).formatToParts(new Date());
    const nowYear = Number(parts.find(p => p.type === 'year').value);
    const nowMonth = Number(parts.find(p => p.type === 'month').value);
    periodMonths = data.months.map(parseMonthKey).filter(Boolean).filter(p => p.year < nowYear || (p.year === nowYear && p.month <= nowMonth)).sort((a, b) => a.year - b.year || a.month - b.month);
    periodYears = [...new Set(periodMonths.map(p => p.year))].sort((a, b) => b - a);

    if (!periodYears.length) {
      const current = { key: String(nowYear).slice(-2) + '年' + String(nowMonth).padStart(2, '0') + '月', year: nowYear, month: nowMonth, label: String(nowYear).slice(-2) + '年' + String(nowMonth).padStart(2, '0') + '月' };
      periodMonths = [current];
      periodYears = [nowYear];
    }

    setupPeriodControls('student', 'all', nowYear, nowMonth);
    setupPeriodControls('ranking', 'month', nowYear, nowMonth);
    if(previous)for(const owner of ['student','ranking']){const period=previous[owner];if(periodYears.includes(period.year)){document.getElementById(owner+'-year-select').value=period.year;refreshMonthOptions(owner);if(period.key&&[...document.getElementById(owner+'-month-select').options].some(o=>o.value===period.key))document.getElementById(owner+'-month-select').value=period.key;}setPeriodMode(owner,period.mode,false);}
    filterStudents();
    if(previous?.name){const selected=data.students.findIndex(s=>s.name===previous.name);if([...document.getElementById('student-select').options].some(o=>o.value===String(selected))){document.getElementById('student-select').value=selected;renderUI();}}
    buildRanking();
  }

  function setupPeriodControls(owner, initialMode, nowYear, nowMonth) {
    const yearSelect = document.getElementById(owner + '-year-select');
    yearSelect.replaceChildren();
    periodYears.forEach(year => {
      const option = document.createElement('option');
      option.value = year;
      option.textContent = year + '年';
      yearSelect.appendChild(option);
    });
    yearSelect.value = periodYears.includes(nowYear) ? nowYear : periodYears[0];
    refreshMonthOptions(owner, nowMonth);
    setPeriodMode(owner, initialMode, false);
  }

  function refreshMonthOptions(owner, preferredMonth) {
    const year = Number(document.getElementById(owner + '-year-select').value);
    const monthSelect = document.getElementById(owner + '-month-select');
    const previous = monthSelect.value;
    monthSelect.replaceChildren();
    const months = periodMonths.filter(p => p.year === year).sort((a, b) => a.month - b.month);
    months.forEach(item => {
      const option = document.createElement('option');
      option.value = item.key;
      option.textContent = item.month + '月';
      monthSelect.appendChild(option);
    });
    const preferred = months.find(p => p.month === Number(preferredMonth));
    if (preferred) monthSelect.value = preferred.key;
    else if (months.some(p => String(p.key) === previous)) monthSelect.value = previous;
    else if (months.length) monthSelect.value = months[months.length - 1].key;
  }

  function setPeriodMode(owner, mode, shouldRender = true) {
    document.querySelectorAll('[data-period-owner="' + owner + '"]').forEach(button => {
      const active = button.dataset.periodMode === mode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    document.getElementById(owner + '-year-group').hidden = mode === 'all';
    document.getElementById(owner + '-month-group').hidden = mode !== 'month';
    if (shouldRender) renderPeriod(owner);
  }

  function getPeriodMode(owner) {
    return document.querySelector('[data-period-owner="' + owner + '"].active')?.dataset.periodMode || 'all';
  }

  function getSelectedPeriod(owner) {
    const mode = getPeriodMode(owner);
    if (mode === 'all') return { mode, label: '全期間' };
    const year = Number(document.getElementById(owner + '-year-select').value);
    if (mode === 'year') return { mode, year, label: year + '年' };
    const key = document.getElementById(owner + '-month-select').value;
    const item = periodMonths.find(p => String(p.key) === String(key));
    return { mode, year, key, label: item?.label || key };
  }

  function renderPeriod(owner) {
    if (owner === 'student') renderUI();
    else buildRanking();
  }

  function getStudentTotals(student, period) {
    if (period.mode === 'all') return { clients: student.totalClients || 0, revenue: student.totalRevenue || 0 };
    if (period.mode === 'month') {
      const data = student.monthly[period.key] || { clients: 0, revenue: 0 };
      return { clients: data.clients || 0, revenue: data.revenue || 0 };
    }
    return periodMonths.filter(p => p.year === period.year).reduce((total, item) => {
      const data = student.monthly[item.key] || { clients: 0, revenue: 0 };
      total.clients += data.clients || 0;
      total.revenue += data.revenue || 0;
      return total;
    }, { clients: 0, revenue: 0 });
  }

  function filterStudents() {
    if (!appData) return;
    const normalize = s => String(s || '').normalize('NFKC').replace(/\s/g, '').toLowerCase();
    const term = normalize(document.getElementById('student-search').value);
    const sel = document.getElementById('student-select');
    sel.replaceChildren();
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '選択してください';
    sel.appendChild(placeholder);
    const matches = term ? appData.students.map((s, i) => ({ s, i })).filter(({ s }) => normalize(s.name).includes(term) || normalize(s.hiragana).includes(term)) : [];
    matches.forEach(({ s, i }) => {
      const option = document.createElement('option');
      option.value = i;
      option.textContent = s.name;
      sel.appendChild(option);
    });
    const exact = matches.filter(({ s }) => normalize(s.name) === term || normalize(s.hiragana) === term);
    if (matches.length === 1) sel.value = matches[0].i;
    else if (exact.length === 1) sel.value = exact[0].i;
    document.getElementById('student-choice').hidden = matches.length < 2;
    document.getElementById('search-status').textContent = !term ? '' : matches.length === 0 ? '該当する名前が見つかりません' : sel.value === '' ? '候補から対象者を選択してください' : '';
    renderUI();
  }


function updateDownloadPreviews(student,period,totals){
 const shared=document.getElementById('shared-preview');
 shared.src=createSharedReportCanvases(student,period)[0].toDataURL('image/png');
 const periodText=period.mode==='all'?'— 全期間 累計実績 —':period.mode==='year'?'— '+period.label+' 年間実績 —':'— '+period.label+' 成果実績 —';
 document.getElementById('internal-preview-period').textContent=periodText;
 const previewValue=document.getElementById('internal-preview-value');
 previewValue.textContent='¥'+totals.revenue.toLocaleString('ja-JP');
 const measure=document.createElement('canvas').getContext('2d');
 const available=(previewValue.parentElement.clientWidth||240)*0.88;
 let fontSize=38;
 do{measure.font='700 '+fontSize+'px Georgia,serif';if(measure.measureText(previewValue.textContent).width<=available)break;fontSize--;}while(fontSize>16);
 previewValue.style.fontSize=fontSize+'px';
}
function moveDownloadCard(index){
 const rail=document.getElementById('download-area'),cards=rail.querySelectorAll('.download-option');
 rail.scrollTo({left:cards[index].offsetLeft-cards[0].offsetLeft,behavior:'smooth'});
}
function syncDownloadNav(){
 const rail=document.getElementById('download-area'),cards=rail.querySelectorAll('.download-option');
 const index=rail.scrollLeft>(cards[1].offsetLeft-cards[0].offsetLeft)/2?1:0;
 document.getElementById('download-prev').disabled=index===0;
 document.getElementById('download-next').disabled=index===1;
 document.getElementById('download-position').textContent=(index+1)+' / 2';
}
document.getElementById('download-area').addEventListener('scroll',syncDownloadNav,{passive:true});
syncDownloadNav();
function renderUI() {
    const sIdx = document.getElementById('student-select').value;
    const period = getSelectedPeriod('student');
    const valid = sIdx !== '' && !!appData.students[sIdx];
    document.getElementById('student-results').hidden = !valid;
    syncDashboardLineLink(valid ? appData.students[sIdx].name : '');
    if (!valid) return;

    const student = appData.students[sIdx];
    const totals = getStudentTotals(student, period);
    document.getElementById('selected-name').textContent = student.name + ' さん';
    document.getElementById('summary-label-clients').textContent = period.mode === 'all' ? '全期間 累計登録数' : period.mode === 'year' ? period.label + ' 年間登録数' : period.label + ' 登録数';
    document.getElementById('summary-label-revenue').textContent = period.mode === 'all' ? '全期間 累計収益' : period.mode === 'year' ? period.label + ' 年間収益' : period.label + ' 収益';
    document.getElementById('val-clients').textContent = totals.clients.toLocaleString() + ' 件';
    document.getElementById('val-revenue').textContent = '¥' + totals.revenue.toLocaleString();

    updateDownloadPreviews(student, period, totals);
    const visibleMonths = getReportMonthItems(period);
    const tbody = document.getElementById('history-tbody');
    tbody.replaceChildren();
    visibleMonths.forEach(item => {
      const data = item.key == null ? { clients: 0, revenue: 0 } : student.monthly[item.key] || { clients: 0, revenue: 0 };
      const tr = document.createElement('tr');
      tr.innerHTML = '<td>' + item.label + '</td><td class="num">' + (data.clients || 0).toLocaleString() + '</td><td class="num">¥' + (data.revenue || 0).toLocaleString() + '</td>';
      tbody.appendChild(tr);
    });
  }

  function buildRanking() {
    const period = getSelectedPeriod('ranking');
    const ul = document.getElementById('ranking-list');
    const titleEl = document.getElementById('ranking-title');
    ul.replaceChildren();
    titleEl.textContent = period.mode === 'all' ? '全期間 累計収益ランキング' : period.mode === 'year' ? period.label + ' 年間収益ランキング' : period.label + ' 収益ランキング';

    const rankedStudents = appData.students.map(student => {
      const totals = getStudentTotals(student, period);
      return { name: student.name, revenue: totals.revenue, clients: totals.clients };
    }).filter(item => item.revenue > 5000).sort((a, b) => b.revenue - a.revenue);
    const ranking = rankedStudents;

    if (!ranking.length) {
      ul.innerHTML = '<li class="state-msg">収益データがありません</li>';
      return;
    }

    ranking.forEach((item, index) => {
      const rank = index + 1;
      const badgeClass = rank <= 3 ? 'rank-' + rank : 'rank-other';
      const li = document.createElement('li');
      li.className = 'ranking-item';
      li.innerHTML = '<div class="rank-badge ' + badgeClass + '">' + rank + '</div><div class="ranking-name">' + item.name + '</div><div class="ranking-clients">' + item.clients.toLocaleString() + ' 件</div><div class="ranking-revenue">¥' + item.revenue.toLocaleString() + '</div>';
      ul.appendChild(li);
    });
  }

  // タブ切り替えロジック
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    });
  });



function getReportMonthItems(period) {
 if(period.mode==='month') return periodMonths.filter(p=>String(p.key)===String(period.key));
 if(period.mode==='all') return periodMonths;
 const nowParts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Tokyo',year:'numeric',month:'numeric'}).formatToParts(new Date());
 const currentYear=Number(nowParts.find(p=>p.type==='year').value),currentMonth=Number(nowParts.find(p=>p.type==='month').value);
 const months=period.year<currentYear?12:period.year===currentYear?currentMonth:0;
 return Array.from({length:months},(_,i)=>periodMonths.find(p=>p.year===period.year&&p.month===i+1)||{key:null,year:period.year,month:i+1,label:String(period.year).slice(-2)+'年'+String(i+1).padStart(2,'0')+'月'});
}
function createSharedReportCanvases(student,period) {
 const totals=getStudentTotals(student,period),items=getReportMonthItems(period);
 const rows=items.map(item=>({label:item.label,...(item.key==null?{clients:0,revenue:0}:student.monthly[item.key]||{clients:0,revenue:0})}));
 const pages=Math.max(1,Math.ceil(rows.length/12)),label=period.mode==='all'?'全期間 累計':period.label+(period.mode==='year'?' 年間':'');
 const format=n=>Number(n||0).toLocaleString('ja-JP');
 return Array.from({length:pages},(_,page)=>{
  const canvas=document.createElement('canvas');canvas.width=canvas.height=1080;const ctx=canvas.getContext('2d'),pageRows=rows.slice(page*12,(page+1)*12);
  function box(x,y,w,h,fill,radius=0,border){ctx.beginPath();ctx.roundRect(x,y,w,h,radius);ctx.fillStyle=fill;ctx.fill();if(border){ctx.strokeStyle=border;ctx.lineWidth=1;ctx.stroke();}}
  function text(value,x,y,size,color,align='left',weight=400,maxWidth){let fontSize=size;ctx.font=weight+' '+fontSize+'px -apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans JP",sans-serif';while(maxWidth&&ctx.measureText(value).width>maxWidth&&fontSize>12){fontSize--;ctx.font=weight+' '+fontSize+'px -apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans JP",sans-serif';}ctx.fillStyle=color;ctx.textAlign=align;ctx.textBaseline='middle';ctx.fillText(value,x,y);}
  if(period.mode==='month') {
   const top=144;box(0,0,1080,1080,'#f1f6f6');box(54,top,470,370,'#fff',27,'#e8eded');box(546,top,480,370,'#143e40',27);
   text(label+' 登録数',86,top+76,29,'#587278','left',600,406);text(format(totals.clients)+' 件',86,top+234,78,'#1b5c56','left',700,406);
   text(label+' 収益',578,top+76,29,'#b9d6d5','left',600,416);text('¥'+format(totals.revenue),578,top+234,78,'#fff','left',700,416);
   const y=546;box(54,y,972,390,'#fff',27,'#e8eded');text('月別実績',86,y+66,35,'#18343d','left',650);box(86,y+124,908,72,'#f3f7f7');
   text('月',102,y+160,29,'#60787e','left',600);text('登録数',663,y+160,29,'#60787e','right',600);text('収益',978,y+160,29,'#60787e','right',600);
   pageRows.forEach(row=>{text(row.label,102,y+272,34,'#18343d');text(format(row.clients),663,y+272,34,'#18343d','right');text('¥'+format(row.revenue),978,y+272,34,'#18343d','right',400,285);});return canvas;
  }
  const rowGap=period.mode==='year'?Math.min(63,Math.floor(588/Math.max(1,pageRows.length))):49;
  const tableHeight=(period.mode==='year'?143:126)+pageRows.length*rowGap,contentHeight=190+32+tableHeight,top=Math.max(54,(1080-contentHeight)/2);
  box(0,0,1080,1080,'#f1f6f6');box(54,top,470,190,'#fff',27,'#e8eded');box(546,top,480,190,'#143e40',27);
  text(label+' 登録数',86,top+47,24,'#587278','left',600,406);text(format(totals.clients)+' 件',86,top+119,57,'#1b5c56','left',700,406);
  text(label+' 収益',578,top+47,24,'#b9d6d5','left',600,416);text('¥'+format(totals.revenue),578,top+119,57,'#fff','left',700,416);
  const y=top+222;box(54,y,972,tableHeight,'#fff',27,'#e8eded');
  text('月別実績'+(pages>1?'（'+(page+1)+'/'+pages+'）':''),86,y+43,29,'#18343d','left',650);box(86,y+78,908,48,'#f3f7f7');
  text('月',102,y+102,24,'#60787e','left',600);text('登録数',663,y+102,24,'#60787e','right',600);text('収益',978,y+102,24,'#60787e','right',600);
  pageRows.forEach((row,i)=>{const rowY=y+(period.mode==='year'?156:150)+i*rowGap;text(row.label,102,rowY,25,'#18343d');text(format(row.clients),663,rowY,25,'#18343d','right');text('¥'+format(row.revenue),978,rowY,25,'#18343d','right',400,285);if(i<pageRows.length-1)box(86,rowY+rowGap/2,908,1,'#edf1f1');});return canvas;
 });
}
async function downloadSharedReportImage(){
 const index=document.getElementById('student-select').value;
 if(index===''||!appData?.students[index]){alert('名前を入力してください');return;}
 const button=document.getElementById('download-shared-button'),period=getSelectedPeriod('student'),canvases=createSharedReportCanvases(appData.students[index],period);
 button.disabled=true;button.textContent='画像を準備中…';
 try{
  const blobs=await Promise.all(canvases.map(canvas=>new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('画像を生成できませんでした')),'image/png'))));
  const filenames=blobs.map((_,i)=>'SNS_Report_'+period.label+(blobs.length>1?'_'+(i+1):'')+'.png');
  const files=blobs.map((blob,i)=>new File([blob],filenames[i],{type:'image/png'}));
  const preferShare=/iPad|iPhone|iPod|Line\/|FBAN|FBAV|Instagram|MicroMessenger/i.test(navigator.userAgent);
  if(preferShare){
   if(navigator.canShare&&navigator.canShare({files})){try{await navigator.share({files,title:'実績画像'});return;}catch(error){if(error.name==='AbortError')return;}}
   const tab=window.open();if(!tab){alert('外部ブラウザで開いてから、もう一度お試しください。');return;}
   tab.document.title='画像を長押しして保存してください';tab.document.body.style.cssText='margin:0;background:#f1f6f6;text-align:center';
   canvases.forEach(canvas=>{const img=tab.document.createElement('img');img.src=canvas.toDataURL('image/png');img.alt='実績画像';img.style.cssText='display:block;width:100%;max-width:1080px;margin:0 auto 16px';tab.document.body.appendChild(img);});return;
  }
  for(let i=0;i<blobs.length;i++){const url=URL.createObjectURL(blobs[i]),link=document.createElement('a');link.download=filenames[i];link.href=url;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);if(i+1<blobs.length)await new Promise(resolve=>setTimeout(resolve,250));}
 }catch(error){console.error(error);alert('画像を保存できませんでした。もう一度お試しください。');}
 finally{button.disabled=false;button.textContent='↓ SNS用に保存';}
}

  async function downloadReportImage() {
      const sIdx = document.getElementById('student-select').value;
      const period = getSelectedPeriod('student');
      if (sIdx === '') { alert('名前を入力してください'); return; }

      const student = appData.students[sIdx];
      const displayRevenue = getStudentTotals(student, period).revenue;

      // 1. Canvas設定（1080x1080の正方形）
      const canvas = document.createElement('canvas');
      canvas.width = 1080;
      canvas.height = 1080;
      const ctx = canvas.getContext('2d');

      // ゴールドグラデーション定義
      function getGoldGradient(x1, y1, x2, y2) {
        const g = ctx.createLinearGradient(x1, y1, x2, y2);
        g.addColorStop(0, '#d4af37');
        g.addColorStop(0.2, '#fcf6ba');
        g.addColorStop(0.4, '#b8860b');
        g.addColorStop(0.7, '#fbf5b7');
        g.addColorStop(1, '#aa771c');
        return g;
      }

      // 光の効果
      function drawSpotlight(x, y, radius, color) {
        const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
        g.addColorStop(0, color);
        g.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
      }

      // 2. 背景描画
      const bgGrad = ctx.createRadialGradient(540, 540, 100, 540, 540, 800);
      bgGrad.addColorStop(0, '#001f3f');
      bgGrad.addColorStop(1, '#000b1a');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, 1080, 1080);

      // 背景装飾：四隅の金パネル（正方形に合わせて配置）
      [ [850, 0, 1080, 200, 0], [850, 1080, 1080, 880, 1080] ].forEach(p => {
        ctx.save();
        ctx.beginPath(); ctx.moveTo(p[0], p[4]); ctx.lineTo(p[2], p[3]); ctx.lineTo(p[2], p[4]); ctx.closePath();
        ctx.clip();
        ctx.fillStyle = getGoldGradient(p[0], Math.min(p[3], p[4]), p[2], Math.max(p[3], p[4]));
        ctx.fillRect(p[0], Math.min(p[3], p[4]), 230, 200);
        ctx.strokeStyle = '#fbf5b7'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(p[0], p[4]); ctx.lineTo(p[2], p[3]); ctx.stroke();
        ctx.restore();
      });

      // スパークル（粒子）
      for (let i = 0; i < 100; i++) {
        ctx.fillStyle = `rgba(212, 175, 55, ${Math.random() * 0.7})`;
        ctx.beginPath(); ctx.arc(Math.random()*1080, Math.random()*1080, Math.random()*2, 0, Math.PI*2); ctx.fill();
      }

      // 3. 上部テキスト（生徒名・期間）
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // 期間表示（メインヘッダー）
      const nameGold = getGoldGradient(400, 80, 680, 80);
      ctx.fillStyle = nameGold;
      ctx.font = '500 70px sans-serif';
      const periodText = period.mode === 'all' ? '— 全期間 累計実績 —' : period.mode === 'year' ? '— ' + period.label + ' 年間実績 —' : '— ' + period.label + ' 成果実績 —';
      ctx.fillText(periodText, 540, 180);
      drawSpotlight(540, 180, 300, 'rgba(212, 175, 55, 0.25)');

      // 4. メインパネル描画（収益のみ）
      function drawSinglePanel(y, title, value) {
        const pX = 60, pW = 960, pH = 650;
        const gold = getGoldGradient(pX, y, pX + pW, y + pH);

        ctx.strokeStyle = gold; ctx.lineWidth = 5; ctx.strokeRect(pX, y, pW, pH);
        ctx.lineWidth = 1; ctx.strokeRect(pX + 18, y + 18, pW - 36, pH - 36);

        [ [pX, y], [pX+pW, y], [pX, y+pH], [pX+pW, y+pH] ].forEach(pos => {
          ctx.save(); ctx.translate(pos[0], pos[1]); ctx.rotate(Math.PI/4);
          ctx.fillStyle = gold; ctx.fillRect(-10, -10, 20, 20); ctx.restore();
        });

        ctx.fillStyle = '#000b1a'; ctx.fillRect(pX + 22, y + 22, pW - 44, pH - 44);

        ctx.textAlign = 'center';
        ctx.fillStyle = '#fcf6ba';
        ctx.font = 'bold 65px sans-serif';
        ctx.fillText(title, 540, y + 130);
        const tw = ctx.measureText(title).width;
        ctx.strokeStyle = '#fcf6ba'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(pX+100, y+130); ctx.lineTo(540-tw/2-60, y+130); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(540+tw/2+60, y+130); ctx.lineTo(pX+pW-100, y+130); ctx.stroke();

        const valStr = value.toLocaleString();
        let fs = 240;
        ctx.font = `bold ${fs}px serif`;
        while (ctx.measureText('¥' + valStr).width > pW - 100) {
          fs -= 10; ctx.font = `bold ${fs}px serif`;
        }

        ctx.fillStyle = getGoldGradient(pX, y + 300, pX + pW, y + 550);
        const numW = ctx.measureText(valStr).width;
        ctx.font = `bold ${fs * 0.5}px serif`;
        const symW = ctx.measureText('¥').width;
        const startX = 540 - (numW + symW + 35) / 2;

        ctx.textAlign = 'left';
        ctx.fillText('¥', startX, y + 420);
        ctx.font = `bold ${fs}px serif`;
        ctx.fillText(valStr, startX + symW + 35, y + 400);
      }

      // 中央に配置
      drawSinglePanel(300, "発生収益 (合計)", displayRevenue);

      // ==========================================
      // 5. 保存処理（自動ダウンロード優先版）
      // ==========================================
      const filename = 'Report_' + student.name + '_' + period.label + '.png';
      const ua = navigator.userAgent;
      const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
      const isInAppBrowser = /Line\/|FBAN|FBAV|Instagram|MicroMessenger/i.test(ua);
      // iOSやLINE等のアプリ内ブラウザは<a download>で自動保存できないため、共有シートを先に使う
      const preferShareFirst = isIOS || isInAppBrowser;

      console.log('UA判定: isIOS=' + isIOS + ' isInAppBrowser=' + isInAppBrowser + ' preferShareFirst=' + preferShareFirst);

      canvas.toBlob(async (blob) => {
        if (!blob) {
          alert("画像の生成に失敗しました。もう一度お試しください。");
          return;
        }

        const file = new File([blob], filename, { type: 'image/png' });

        // 共有シートを使う（成功可否を返す）
        async function tryShare() {
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            try {
              await navigator.share({ files: [file], title: '成果レポート' });
              return true;
            } catch (e) {
              if (e.name === 'AbortError') return true; // ユーザーがキャンセル＝これ以上何もしない
              console.log('share失敗: ' + e.message);
              return false;
            }
          }
          return false;
        }

        // 自動ダウンロードを試す（成功可否を返す）
        function tryDownload() {
          try {
            const blobUrl = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.download = filename;
            link.href = blobUrl;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(() => URL.revokeObjectURL(blobUrl), 3000);
            return true;
          } catch (e) {
            console.log('download失敗: ' + e.message);
            return false;
          }
        }

        // 最終手段：新規タブに表示して長押し保存を促す
        function openFallbackTab() {
          const dataUrl = canvas.toDataURL('image/png');
          const newTab = window.open();
          if (newTab) {
            newTab.document.write(`
              <body style="margin:0;background:#000;display:flex;align-items:center;justify-content:center;height:100vh;">
                <img src="${dataUrl}" style="max-width:100%;height:auto;">
              </body>
            `);
            newTab.document.title = "画像を長押しして保存してください";
          } else {
            alert("この画面では保存できない場合があります。画面右上のメニューから「外部ブラウザで開く」を選んでから、もう一度お試しください。");
          }
        }

        if (preferShareFirst) {
          // iOS / LINE内蔵ブラウザ：共有シート優先（download属性は信頼できないため）
          const shared = await tryShare();
          if (shared) return;
          openFallbackTab();
        } else {
          // Android Chrome / PC：自動ダウンロードを優先
          const downloaded = tryDownload();
          if (downloaded) return;
          const shared = await tryShare();
          if (shared) return;
          openFallbackTab();
        }
      }, 'image/png');
    }

  // /**
  //  * 成果レポート生成：正方形(1:1)・収益特化・完全トレース版
  //  */
  // function downloadReportImage() {
  //   const sIdx = document.getElementById('student-select').value;
  //   const month = document.getElementById('month-select').value;
  //   if (sIdx === "" || !month) { alert("生徒と月を選択してください"); return; }

  //   const student = appData.students[sIdx];
  //   let displayRevenue;

  //   // 収益データのみ取得
  //   if (month === "累計") {
  //     displayRevenue = student.totalRevenue;
  //   } else {
  //     const mData = student.monthly[month] || { revenue: 0 };
  //     displayRevenue = mData.revenue;
  //   }

  //   // 1. Canvas設定（1080x1080の正方形）
  //   const canvas = document.createElement('canvas');
  //   canvas.width = 1080;
  //   canvas.height = 1080;
  //   const ctx = canvas.getContext('2d');

  //   // ゴールドグラデーション定義
  //   function getGoldGradient(x1, y1, x2, y2) {
  //     const g = ctx.createLinearGradient(x1, y1, x2, y2);
  //     g.addColorStop(0, '#d4af37');
  //     g.addColorStop(0.2, '#fcf6ba');
  //     g.addColorStop(0.4, '#b8860b');
  //     g.addColorStop(0.7, '#fbf5b7');
  //     g.addColorStop(1, '#aa771c');
  //     return g;
  //   }

  //   // 光の効果
  //   function drawSpotlight(x, y, radius, color) {
  //     const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
  //     g.addColorStop(0, color);
  //     g.addColorStop(1, 'rgba(0, 0, 0, 0)');
  //     ctx.fillStyle = g;
  //     ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
  //   }

  //   // 2. 背景描画
  //   const bgGrad = ctx.createRadialGradient(540, 540, 100, 540, 540, 800);
  //   bgGrad.addColorStop(0, '#001f3f');
  //   bgGrad.addColorStop(1, '#000b1a');
  //   ctx.fillStyle = bgGrad;
  //   ctx.fillRect(0, 0, 1080, 1080);

  //   // 背景装飾：四隅の金パネル（正方形に合わせて配置）
  //   [ [850, 0, 1080, 200, 0], [850, 1080, 1080, 880, 1080] ].forEach(p => {
  //     ctx.save();
  //     ctx.beginPath(); ctx.moveTo(p[0], p[4]); ctx.lineTo(p[2], p[3]); ctx.lineTo(p[2], p[4]); ctx.closePath();
  //     ctx.clip();
  //     ctx.fillStyle = getGoldGradient(p[0], Math.min(p[3], p[4]), p[2], Math.max(p[3], p[4]));
  //     ctx.fillRect(p[0], Math.min(p[3], p[4]), 230, 200);
  //     ctx.strokeStyle = '#fbf5b7'; ctx.lineWidth = 4;
  //     ctx.beginPath(); ctx.moveTo(p[0], p[4]); ctx.lineTo(p[2], p[3]); ctx.stroke();
  //     ctx.restore();
  //   });

  //   // スパークル（粒子）
  //   for (let i = 0; i < 100; i++) {
  //     ctx.fillStyle = `rgba(212, 175, 55, ${Math.random() * 0.7})`;
  //     ctx.beginPath(); ctx.arc(Math.random()*1080, Math.random()*1080, Math.random()*2, 0, Math.PI*2); ctx.fill();
  //   }

  //   // 3. 上部テキスト（生徒名・期間）
  //   ctx.textAlign = 'center';
  //   ctx.textBaseline = 'middle';

  //   // // 生徒名（上部に配置）
  //   // ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  //   // ctx.font = 'bold 100px serif';
  //   // ctx.fillText(student.name, 540, 80);

  //   // 期間表示（メインヘッダー）
  //   const nameGold = getGoldGradient(400, 80, 680, 80);
  //   ctx.fillStyle = nameGold;
  //   ctx.font = '500 70px sans-serif';
  //   const periodText = month === "累計" ? `— 全期間 累計実績 —` : `— ${month} 成果実績 —`;
  //   ctx.fillText(periodText, 540, 180);
  //   drawSpotlight(540, 180, 300, 'rgba(212, 175, 55, 0.25)');

  //   // 4. メインパネル描画（収益のみ）
  //   function drawSinglePanel(y, title, value) {
  //     const pX = 60, pW = 960, pH = 650; // 正方形に合わせて高さを調整
  //     const gold = getGoldGradient(pX, y, pX + pW, y + pH);

  //     // 二重枠線
  //     ctx.strokeStyle = gold; ctx.lineWidth = 5; ctx.strokeRect(pX, y, pW, pH);
  //     ctx.lineWidth = 1; ctx.strokeRect(pX + 18, y + 18, pW - 36, pH - 36);

  //     // 四隅のダイヤ
  //     [ [pX, y], [pX+pW, y], [pX, y+pH], [pX+pW, y+pH] ].forEach(pos => {
  //       ctx.save(); ctx.translate(pos[0], pos[1]); ctx.rotate(Math.PI/4);
  //       ctx.fillStyle = gold; ctx.fillRect(-10, -10, 20, 20); ctx.restore();
  //     });

  //     // パネル背景
  //     ctx.fillStyle = '#000b1a'; ctx.fillRect(pX + 22, y + 22, pW - 44, pH - 44);

  //     // タイトル
  //     ctx.textAlign = 'center';
  //     ctx.fillStyle = '#fcf6ba';
  //     ctx.font = 'bold 65px sans-serif';
  //     ctx.fillText(title, 540, y + 130);
  //     const tw = ctx.measureText(title).width;
  //     ctx.strokeStyle = '#fcf6ba'; ctx.lineWidth = 2;
  //     ctx.beginPath(); ctx.moveTo(pX+100, y+130); ctx.lineTo(540-tw/2-60, y+130); ctx.stroke();
  //     ctx.beginPath(); ctx.moveTo(540+tw/2+60, y+130); ctx.lineTo(pX+pW-100, y+130); ctx.stroke();

  //     // 数値描画
  //     const valStr = value.toLocaleString();
  //     let fs = 240;
  //     ctx.font = `bold ${fs}px serif`;
  //     while (ctx.measureText('¥' + valStr).width > pW - 100) {
  //       fs -= 10; ctx.font = `bold ${fs}px serif`;
  //     }

  //     ctx.fillStyle = getGoldGradient(pX, y + 300, pX + pW, y + 550);
  //     const numW = ctx.measureText(valStr).width;
  //     ctx.font = `bold ${fs * 0.5}px serif`;
  //     const symW = ctx.measureText('¥').width;
  //     const startX = 540 - (numW + symW + 35) / 2;

  //     ctx.textAlign = 'left';
  //     ctx.fillText('¥', startX, y + 420);
  //     ctx.font = `bold ${fs}px serif`;
  //     ctx.fillText(valStr, startX + symW + 35, y + 400);

  //     // drawSpotlight(540, y + 350, 350, 'rgba(212, 175, 55, 0.35)');
  //   }

  //   // 中央に配置
  //   drawSinglePanel(300, "発生収益 (合計)", displayRevenue);

  //   // 5. ダウンロード
  //   const link = document.createElement('a');
  //   link.download = `Report_${student.name}_${month}.png`;
  //   link.href = canvas.toDataURL('image/png');
  //   link.click();
  // }
