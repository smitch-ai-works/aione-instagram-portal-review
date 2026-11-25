(function (root, factory) {
  const policy = typeof module === 'object' && module.exports ? require('./ng-rules.js') : root.MonthlyReportNgRules;
  const api = factory(policy);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MonthlyReport = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (policy) {
  'use strict';
  const fields = [
    ['good', '🔥 良かったこと'],
    ['growth', '🌟 伸びしろ'],
    ['action', '🎉 来月の行動目標'],
    ['goal', '🌱 長期目標']
  ];
  const activityFields = [
    ['reelPosts', 'リール投稿数', '本'],
    ['feedPosts', 'フィード投稿数', '件'],
    ['storyDays', 'ストーリーズ投稿日数', '日'],
    ['followersStart', '前月末フォロワー数', '人'],
    ['followersEnd', '当月末フォロワー数', '人']
  ];
  function screeningKey(value){return String(value??'').normalize('NFKC').replace(/[\s\p{Cf}]/gu,'').toLowerCase();}
  let screeningRules=null;
  function setScreeningPolicy(next){
    try{
      policy=next;
      if(!Array.isArray(policy?.rules)||!policy.rules.length)throw new Error('policy');
      screeningRules=policy.rules.map(rule=>{
        if(!rule.id||!rule.reason||!rule.guidance||(!rule.words?.length&&!rule.patterns?.length))throw new Error('rule');
        return {...rule,words:(rule.words||[]).map(word=>{if(typeof word!=='string'||!screeningKey(word))throw new Error('word');return screeningKey(word);}),patterns:(rule.patterns||[]).map(pattern=>{if(typeof pattern!=='string'||!pattern)throw new Error('pattern');return new RegExp(pattern,'iu');})};
      });
    }catch{screeningRules=null;}
    return !!screeningRules;
  }
  setScreeningPolicy(policy);
  function screenDraft(draft={}){
    if(!screeningRules)return {ready:false,valid:false,issues:[],draft:null,removedCount:0};
    const issues=[],cleaned={...draft};let removedCount=0;
    for(const [field,label] of fields){
      const source=String(draft[field]??''),parts=source.match(/(?:[^\r\n。！？!?]+[。！？!?]*[」』）)\]】]*|[。！？!?]+[」』）)\]】]*)(?:\r\n|[\r\n])?|\r\n|[\r\n]/gu)||[];
      const removed=new Set();let firstRule=null;
      // Recheck after each deletion: joining remaining lines must not create a new NG phrase.
      while(true){
        const active=parts.map((part,index)=>({part,index})).filter(item=>!removed.has(item.index));
        function makeView(separateLines){
          const ranges=[];let text='';
          active.forEach(({part,index},position)=>{
            const key=screeningKey(part);ranges.push({index,start:text.length,end:text.length+key.length});text+=key;
            // Join a wrapped phrase, but keep completed neighboring lines out of a pattern match.
            const next=screeningKey(active[position+1]?.part);
            if(separateLines&&/[\r\n]$/.test(part)&&!/(?:に|へ|が|を|の|で|と|は|や|も|:|：)$/.test(key)&&!/^(?:に|へ|が|を|の|で|と|は|や|も|なんて)/.test(next))text+='。';
          });
          return {text,ranges};
        }
        const full=makeView(false),sentences=makeView(true);
        const pending=new Set();
        function mark(view,start,length,rule){
          if(!length)return;
          for(const range of view.ranges)if(range.start<start+length&&range.end>start){pending.add(range.index);if(!firstRule)firstRule=rule;}
        }
        for(const rule of screeningRules){
          for(const word of rule.words){let start=full.text.indexOf(word);while(start!==-1){mark(full,start,word.length,rule);start=full.text.indexOf(word,start+1);}}
          for(const pattern of rule.patterns)for(const match of sentences.text.matchAll(new RegExp(pattern.source,'giu')))mark(sentences,match.index,match[0].length,rule);
        }
        if(!pending.size)break;
        pending.forEach(index=>removed.add(index));
      }
      if(removed.size){
        cleaned[field]=parts.filter((part,index)=>!removed.has(index)).join('').trim();
        const count=[...removed].filter(index=>parts[index].trim()).length;removedCount+=count;
        issues.push({field,label,rule:firstRule.id,reason:firstRule.reason,guidance:firstRule.guidance,removedCount:count});
      }
    }
    return {ready:true,valid:!issues.length,issues,draft:cleaned,removedCount};
  }
  function daysInMonth(month) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return 31;
    const [y,m]=month.split('-').map(Number);
    return m===2 ? (y%4===0&&(y%100!==0||y%400===0)?29:28) : ([4,6,9,11].includes(m)?30:31);
  }
  function activityData(draft = {}, month) {
    const values={};
    for(const [key,label] of activityFields){
      const raw=String(draft[key]??'').trim();
      if(!raw)continue;
      const value=Number(raw),max=key==='storyDays'?daysInMonth(month):999999999;
      if(!/^\d+$/.test(raw)||!Number.isSafeInteger(value)||value<0||value>max)
        return {valid:false,values:{},difference:null,error:`${label}は0〜${max.toLocaleString('ja-JP')}の整数で入力してください。`};
      values[key]=value;
    }
    const difference=values.followersStart!==undefined&&values.followersEnd!==undefined?values.followersEnd-values.followersStart:null;
    return {valid:true,values,difference};
  }
  function signedCount(value) {return (value>0?'+':'')+value.toLocaleString('ja-JP');}
  function normalizeName(value) {
    return String(value || '').normalize('NFKC').replace(/[\s　]/g, '')
      .replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60)).toLowerCase();
  }
  function searchStudents(students, query) {
    const q = normalizeName(query);
    if (!q) return [];
    return students.filter(s => [s.name, s.reading, ...(s.readings || [])].some(n => normalizeName(n).includes(q)));
  }
  function getMonthlyState(student, month) {
    if (!student) return {kind: 'unselected'};
    const item = student.monthly && student.monthly[month];
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !item ||
      !Number.isInteger(item.clients) || item.clients < 0 ||
      !Number.isFinite(item.revenue) || item.revenue < 0) return {kind: 'unknown'};
    return {kind: item.revenue > 0 ? 'revenue' : 'zero', clients: item.clients, revenue: item.revenue};
  }
  function monthLabel(month) {
    const [year, m] = month.split('-');
    return `${year}年${Number(m)}月`;
  }
  function reportMonthOptions(currentYM) {
    if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(currentYM))return [];
    const [year,month]=currentYM.split('-').map(Number),serial=year*12+month-1;
    return [1,2].map(offset=>{const value=serial-offset;return Math.floor(value/12)+'-'+String(value%12+1).padStart(2,'0');});
  }
  function money(value) { return '¥' + value.toLocaleString('ja-JP'); }
  function reportDisplay(state) {
    if (!state || !['zero', 'revenue'].includes(state.kind)) return {ready:false,showLists:false,showRevenue:false};
    // Choose the report fields from verified monthly numbers, not self-reported activity.
    const showRevenue=state.revenue>0;
    return {ready:true,showRevenue,showLists:state.clients>0||showRevenue};
  }
  function reportText(student, month, draft = {}) {
    const state = getMonthlyState(student, month);
    const display=reportDisplay(state);
    const screening=screenDraft(draft);
    if (!display.ready || !screening.ready) return '';
    draft=screening.draft;
    const result = [`📊 ${month} 月報`, student.name];
    if(display.showLists||display.showRevenue)result.push('');
    if (state.kind === 'revenue') result.push(`💰 収益：${money(state.revenue)}`);
    if(display.showLists)result.push(`📋 リスト数：${state.clients.toLocaleString('ja-JP')}件`);
    const activity=activityData(draft,month);
    if(!activity.valid)return '';
    const activityLines=activityFields.filter(([key])=>activity.values[key]!==undefined)
      .map(([key,label,unit])=>`${label}：${activity.values[key].toLocaleString('ja-JP')}${unit}`);
    if(activity.difference!==null)activityLines.push(`フォロワー増減：${signedCount(activity.difference)}人`);
    if(activityLines.length)result.push('','📱 投稿・アカウントの実績',...activityLines);
    if(screening.removedCount&&!display.showLists&&!display.showRevenue&&!activityLines.length&&!fields.some(([key])=>String(draft[key]??'').trim()))return '';
    fields.forEach(([key, title]) => {
      const value=String(draft[key]||'').trim();
      if(!value&&screening.issues.some(issue=>issue.field===key))return;
      result.push('',title,value);
    });
    return result.join('\n').trim();
  }
  return {fields, activityFields, activityData, daysInMonth, signedCount, normalizeName, searchStudents, getMonthlyState, reportDisplay, reportMonthOptions, monthLabel, money, setScreeningPolicy, screenDraft, reportText};
});
