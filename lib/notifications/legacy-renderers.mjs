// Pure Flex renderers ported from the live GAS source.
const Utilities={newBlob:value=>({getBytes:()=>Buffer.from(value)})};
function formatToJPYearMonth(ymStr) {
  if (!ymStr || ymStr.length < 7) return "";
  // ハイフン(-)とスラッシュ(/)の両方を区切り文字として分割
  const parts = ymStr.split(/[-/]/);
  if (parts.length < 2) return "";

  // 年の後半2桁 + "年" + 月を2桁(0埋め)にして "月"
  const year = parts[0].substring(2);
  const month = parts[1].padStart(2, '0');
  return year + "年" + month + "月";
}
function groupRankingEntries_(entries) {
  const groups = [];
  entries.forEach(function(entry, index) {
    const count = Number(entry[1]);
    const last = groups[groups.length - 1];
    if (last && last.count === count) last.names.push(String(entry[0]));
    else groups.push({rank:index + 1, count:count, names:[String(entry[0])]});
  });
  return groups;
}
function rankingTier_(rank, people) {
  const third = Math.ceil(people / 3);
  return rank <= third ? 0 : rank <= third * 2 ? 1 : 2;
}
function makeRankingBubble_(targetYM, entries, allGroups, chunk, isFinal) {
  const colors = ['#1F5BB5', '#0D8984', '#765CA2'];
  const medals = ['#BF8D22', '#7D8DA1', '#AA6846'];
  const total = entries.reduce(function(sum, entry) { return sum + Number(entry[1]); }, 0);
  const maxCount = Math.max.apply(null, entries.map(function(entry) { return Number(entry[1]); }).concat([1]));
  const bounds = [null, null, null];
  allGroups.forEach(function(group) {
    const tier = rankingTier_(group.rank, entries.length);
    if (!bounds[tier]) bounds[tier] = {first:group.rank, last:group.rank};
    else bounds[tier].last = group.rank;
  });
  const rows = [];
  let previousTier = -1;
  chunk.forEach(function(group, index) {
    const tier = rankingTier_(group.rank, entries.length);
    if (tier !== previousTier) {
      const range = bounds[tier];
      rows.push({type:'text', text:range.first + '位～' + range.last + '位',
        size:'sm', weight:'bold', color:colors[tier], margin:index === 0 ? 'none' : 'xl'});
      rows.push({type:'separator', margin:'sm', color:'#E5E7EB'});
      previousTier = tier;
    }
    const badgeColor = group.rank <= 3 ? medals[group.rank - 1] : colors[tier];
    const width = Math.max(3, Math.round(group.count / maxCount * 100));
    rows.push({type:'box', layout:'vertical', margin:'lg', contents:[
      {type:'box', layout:'horizontal', contents:[
        {type:'box', layout:'vertical', width:'42px', flex:0, paddingAll:'3px',
          backgroundColor:badgeColor, cornerRadius:'6px', contents:[
            {type:'text', text:group.rank + '位', size:'sm', weight:'bold', color:'#FFFFFF', align:'center'}
          ]},
        {type:'text', text:group.names.join('・'), size:'md', weight:'bold',
          color:'#1F2937', margin:'sm', flex:1, wrap:true},
        {type:'text', text:group.count.toLocaleString('ja-JP') + '件',
          size:'md', weight:'bold', color:'#111827', align:'end', flex:0}
      ]},
      {type:'box', layout:'horizontal', height:'6px', margin:'sm',
        backgroundColor:'#E5E7EB', contents:[
          {type:'box', layout:'vertical', contents:[], width:width + '%',
            backgroundColor:colors[tier]}
        ]}
    ]});
  });
  if (rows.length === 0) {
    rows.push({type:'text', text:'この月の対象データはありません',
      size:'md', color:'#4B5563', wrap:true});
  }
  const first = chunk.length ? chunk[0].rank : 0;
  const last = chunk.length ? chunk[chunk.length - 1].rank : 0;
  return {
    type:'bubble', size:'giga',
    header:{type:'box', layout:'vertical', backgroundColor:isFinal ? '#164E63' : '#183C73',
      paddingAll:'20px', contents:[
        {type:'text', text:formatToJPYearMonth(targetYM) +
          (isFinal ? ' 月間最終リスト数' : ' リスト数'),
          size:'lg', weight:'bold', color:'#FFFFFF', wrap:true},
        {type:'text', text:'合計 ' + total.toLocaleString('ja-JP') +
          '件  ｜  ' + entries.length + '人',
          size:'sm', color:'#DBEAFE', margin:'md'},
        {type:'text', text:chunk.length ? first + '～' + last + '位' : '対象者なし',
          size:'sm', weight:'bold', color:'#FFFFFF', margin:'sm'}
      ]},
    body:{type:'box', layout:'vertical', paddingAll:'20px', contents:rows},
    footer:{type:'box', layout:'vertical', contents:[
      {type:'text', text:targetYM + '-01 ～ ' + (isFinal ? '月末（確定）' : '現在'),
        size:'xs', color:'#6B7280', align:'end'}
    ]}
  };
}
function buildRankingFlexMessages_(targetYM, entries, isFinal) {
  const maxBubbleBytes = 29000;
  const allGroups = groupRankingEntries_(entries);
  const pending = [];
  allGroups.forEach(function(group) {
    let names = [];
    let chars = 0;
    group.names.forEach(function(name) {
      const nextChars = String(name).length + (names.length ? 1 : 0);
      if (chars + nextChars > 1000 && names.length) {
        pending.push({rank:group.rank, count:group.count, names:names});
        names = [];
        chars = 0;
      }
      names.push(name);
      chars += String(name).length + (names.length > 1 ? 1 : 0);
    });
    if (names.length) pending.push({rank:group.rank, count:group.count, names:names});
  });
  const chunks = [];
  let current = [];
  while (pending.length) {
    const group = pending.shift();
    const candidate = current.concat([group]);
    const bubble = makeRankingBubble_(targetYM, entries, allGroups, candidate, isFinal);
    const bytes = Utilities.newBlob(JSON.stringify(bubble)).getBytes().length;
    if (bytes <= maxBubbleBytes) current = candidate;
    else if (current.length) {
      chunks.push(current);
      current = [];
      pending.unshift(group);
    } else if (group.names.length > 1) {
      const half = Math.ceil(group.names.length / 2);
      pending.unshift(
        {rank:group.rank, count:group.count, names:group.names.slice(0, half)},
        {rank:group.rank, count:group.count, names:group.names.slice(half)}
      );
    } else throw new Error('1人分の表示がFlexカードのサイズ上限を超えました');
  }
  if (current.length || chunks.length === 0) chunks.push(current);
  const total = entries.reduce(function(sum, entry) { return sum + Number(entry[1]); }, 0);
  return chunks.map(function(chunk, index) {
    const page = chunks.length > 1 ? ' (' + (index + 1) + '/' + chunks.length + ')' : '';
    return {
      type:'flex',
      altText:formatToJPYearMonth(targetYM) + (isFinal ? ' 月間最終' : '') +
        ' リスト数｜' + entries.length + '人・' + total.toLocaleString('ja-JP') + '件' + page,
      contents:makeRankingBubble_(targetYM, entries, allGroups, chunk, isFinal)
    };
  });
}
function makeRevenueRankingBubble_(targetYM, entries, allGroups, chunk) {
  const maxAmount = Math.max.apply(null, entries.map(function(entry) { return Number(entry[1]); }).concat([1]));
  const medalColors = ['#D8A62B', '#A7B0BC', '#BC7448'];
  const rows = [];

  chunk.forEach(function(group) {
    const badgeColor = group.rank <= 3 ? medalColors[group.rank - 1] : '#4F86B8';
    const width = Math.max(3, Math.round(group.count / maxAmount * 100));
    rows.push({
      type: 'box', layout: 'vertical', margin: 'lg', contents: [
        {type: 'box', layout: 'horizontal', alignItems: 'center', contents: [
          {type: 'box', layout: 'vertical', width: '42px', flex: 0, paddingAll: '3px',
            backgroundColor: badgeColor, cornerRadius: '6px', contents: [
              {type: 'text', text: group.rank + '位', size: 'sm', weight: 'bold', color: '#FFFFFF', align: 'center'}
            ]},
          {type: 'text', text: group.names.join('・'), size: 'md', weight: 'bold',
            color: '#17212B', margin: 'sm', flex: 1, wrap: true},
          {type: 'text', text: '¥' + group.count.toLocaleString('ja-JP'), size: 'md',
            weight: 'bold', color: '#17212B', align: 'end', flex: 0}
        ]},
        {type: 'box', layout: 'horizontal', height: '6px', margin: 'sm',
          backgroundColor: '#E3EDF4', contents: [
            {type: 'box', layout: 'vertical', contents: [], width: width + '%', backgroundColor: '#2F80C9'}
          ]}
      ]
    });
  });

  return {
    type: 'bubble', size: 'giga',
    header: {type: 'box', layout: 'vertical', backgroundColor: '#EAF4FF', paddingAll: '20px', contents: [
      {type: 'text', text: '🏆 ' + formatToJPYearMonth(targetYM) + ' 収益ランキング',
        size: 'lg', weight: 'bold', color: '#123E63', wrap: true},
    ]},
    body: {type: 'box', layout: 'vertical', backgroundColor: '#FFFFFF', paddingAll: '20px', contents: rows},
    footer: {type: 'box', layout: 'vertical', backgroundColor: '#F7FAFC', contents: [
      {type: 'text', text: '毎朝9:00更新', size: 'xs', color: '#6B7280', align: 'end'}
    ]}
  };
}
function buildRevenueFlexMessages_(targetYM, entries) {
  const maxBubbleBytes = 29000;
  const allGroups = groupRankingEntries_(entries);
  const pending = allGroups.map(function(group) {
    return {rank: group.rank, count: group.count, names: group.names.slice()};
  });
  const chunks = [];
  let current = [];

  while (pending.length) {
    const group = pending.shift();
    const candidate = current.concat([group]);
    const bubble = makeRevenueRankingBubble_(targetYM, entries, allGroups, candidate);
    const bytes = Utilities.newBlob(JSON.stringify(bubble)).getBytes().length;
    if (bytes <= maxBubbleBytes) {
      current = candidate;
    } else if (current.length) {
      chunks.push(current);
      current = [];
      pending.unshift(group);
    } else if (group.names.length > 1) {
      const half = Math.ceil(group.names.length / 2);
      pending.unshift(
        {rank: group.rank, count: group.count, names: group.names.slice(0, half)},
        {rank: group.rank, count: group.count, names: group.names.slice(half)}
      );
    } else {
      throw new Error('1人分の収益表示がFlexカードのサイズ上限を超えました');
    }
  }
  if (current.length) chunks.push(current);

  return chunks.map(function(chunk, index) {
    const page = chunks.length > 1 ? ' (' + (index + 1) + '/' + chunks.length + ')' : '';
    return {
      type: 'flex',
      altText: formatToJPYearMonth(targetYM) + ' 収益ランキング' + page,
      contents: makeRevenueRankingBubble_(targetYM, entries, allGroups, chunk)
    };
  });
}
export {buildRankingFlexMessages_ as buildListMessages,buildRevenueFlexMessages_ as buildRevenueMessages};
