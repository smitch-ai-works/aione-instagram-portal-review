// Pure logic ported from the live GAS source.
const InterviewFlex=(function () {
  'use strict';
  var colors = { header:'#176358', bar:'#218575', ink:'#1F2937', muted:'#5F6E77', track:'#E6EFEB', footer:'#F3F8F5', medals:['#BF8D22','#7D8DA1','#AA6846'] };
  function bytes(value) {
    var count = 0;
    for (var character of JSON.stringify(value)) {
      var point = character.codePointAt(0);
      count += point <= 127 ? 1 : point <= 2047 ? 2 : point <= 65535 ? 3 : 4;
    }
    return count;
  }
  function build(report) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(report.month)) throw new Error('Invalid target month');
    var students = report.students.map(function (student) { return {name:String(student.name),count:Number(student.count)}; });
    if (students.some(function (student) { return !student.name || !Number.isSafeInteger(student.count) || student.count <= 0; })) throw new Error('Invalid confirmed student count');
    if (new Set(students.map(function (student) { return student.name; })).size !== students.length) throw new Error('Duplicate student');
    students.sort(function (a,b) { return b.count-a.count; });
    var total = students.reduce(function (sum,student) { return sum+student.count; },0);
    if (total !== report.decisions.counted) throw new Error('Confirmed total does not match student counts');
    var parts = report.month.split('-').map(Number), year=parts[0], month=parts[1];
    var monthLabel = year+'年'+month+'月';
    var groups=[];
    students.forEach(function (student,index) {
      var last=groups[groups.length-1];
      if (last && last.count===student.count) {last.names.push(student.name);last.endRank=index+1;}
      else groups.push({rank:index+1,endRank:index+1,count:student.count,names:[student.name]});
    });
    function text(value,extra) { return Object.assign({type:'text',text:value},extra || {}); }
    function bubble(chunk) {
      var rows=chunk.map(function (group) {return {type:'box',layout:'vertical',margin:'lg',contents:[
        {type:'box',layout:'horizontal',alignItems:'flex-start',contents:[
          {type:'box',layout:'vertical',width:'42px',flex:0,paddingAll:'3px',backgroundColor:group.rank<=3?colors.medals[group.rank-1]:colors.header,cornerRadius:'6px',contents:[
            text(group.rank+'位',{size:'sm',weight:'bold',color:'#FFFFFF',align:'center'})]},
          text(group.names.join('・'),{size:'md',weight:'bold',color:colors.ink,margin:'sm',flex:1,wrap:true}),
          text((group.endRank>group.rank?'各':'')+group.count.toLocaleString('ja-JP')+'件',{size:'md',weight:'bold',color:colors.ink,align:'end',flex:0})]},
        {type:'box',layout:'horizontal',height:'6px',margin:'sm',backgroundColor:colors.track,contents:[
          {type:'box',layout:'vertical',contents:[],width:Math.max(3,Math.round(group.count/students[0].count*100))+'%',backgroundColor:colors.bar}]}]};});
      if (!rows.length) rows.push(text('今月の確認済み面談予定はありません',{size:'md',color:colors.muted,wrap:true}));
      return {type:'bubble',size:'giga',header:{type:'box',layout:'vertical',backgroundColor:colors.header,paddingAll:'20px',contents:[
        text('📅 '+monthLabel+' 面談予定数',{size:'lg',weight:'bold',color:'#FFFFFF',wrap:true}),
        text('合計 '+total.toLocaleString('ja-JP')+'件  ｜  '+students.length+'人',{size:'sm',color:'#E4F4EB',margin:'md'}),
        text(chunk.length?chunk[0].rank+'～'+chunk[chunk.length-1].endRank+'位':'対象者なし',{size:'sm',weight:'bold',color:'#FFFFFF',margin:'sm'})]},
        body:{type:'box',layout:'vertical',backgroundColor:'#FFFFFF',paddingAll:'20px',contents:rows}};
    }
    var pending=[];
    groups.forEach(function (group) {
      var names=[];
      group.names.forEach(function (name) {
        if (name.length>1000) throw new Error('Student name is too long');
        if (names.concat([name]).join('・').length>1000) {
          pending.push(Object.assign({},group,{names:names}));names=[];
        }
        names.push(name);
      });
      pending.push(Object.assign({},group,{names:names}));
    });
    var chunks=[],current=[];
    pending.forEach(function (group) {
      if (bytes(bubble(current.concat([group])))<=29000) current.push(group);
      else {
        if (!current.length) throw new Error('A single group exceeds the bubble size limit');
        chunks.push(current);current=[group];
        if (bytes(bubble(current))>29000) throw new Error('A single group exceeds the bubble size limit');
      }
    });
    if (current.length || !chunks.length) chunks.push(current);
    if (chunks.length>12) throw new Error('Report exceeds the reviewed one-message carousel capacity');
    var bubbles=chunks.map(bubble);
    return {type:'flex',altText:'📅 '+monthLabel+' 面談予定数｜合計'+total.toLocaleString('ja-JP')+'件・'+students.length+'人',
      contents:bubbles.length===1?bubbles[0]:{type:'carousel',contents:bubbles}};
  }
  return {build:build,bytes:bytes,colors:colors};
})();
export default InterviewFlex;
