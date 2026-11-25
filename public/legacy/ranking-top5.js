(function (root) {
  'use strict';
  const font = '"Yu Gothic", "Meiryo", sans-serif';

  function currentMonth(now) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit'
    }).formatToParts(now);
    return {
      year: Number(parts.find(p => p.type === 'year').value),
      month: Number(parts.find(p => p.type === 'month').value)
    };
  }

  function makeModel(data, now = new Date()) {
    if (!data || !Array.isArray(data.students) || !Array.isArray(data.months)) {
      throw new Error('データを読み込んでから、もう一度押してください。');
    }
    const current = currentMonth(now);
    const keys = data.months.filter(key => {
      const match = String(key).match(/^(\d{2,4})年(\d{1,2})月$/) ||
        String(key).match(/^(\d{4})[-/](\d{1,2})$/);
      return match && (Number(match[1]) < 100 ? 2000 + Number(match[1]) : Number(match[1])) === current.year &&
        Number(match[2]) === current.month;
    });
    if (keys.length !== 1) throw new Error('今月の集計データを確認できません。');
    const key = keys[0];
    const rows = data.students.map(student => {
      const value = student.monthly && student.monthly[key];
      if (!value || !Number.isSafeInteger(value.clients) || value.clients < 0 ||
          !Number.isSafeInteger(value.revenue) || typeof student.name !== 'string' || !student.name.trim()) {
        throw new Error('今月の集計データに確認が必要な値があります。');
      }
      return { name: student.name, clients: value.clients, revenue: value.revenue };
    }).filter(row => row.revenue > 0).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
    if (!rows.length) throw new Error('今月は収益のあるデータがまだありません。');
    return {
      year: current.year, month: current.month, rows,
      dateLabel: new Intl.DateTimeFormat('ja-JP', {
        timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric'
      }).format(now),
      filename: 'Instagram_Revenue_TOP5_' + current.year + '-' + String(current.month).padStart(2, '0') + '.png'
    };
  }

  function createCanvas(model) {
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1080;
    const ctx = canvas.getContext('2d');
    const format = number => number.toLocaleString('ja-JP');
    function text(value, x, y, size, color, align = 'left', weight = 600, maxWidth) {
      ctx.textAlign = align;
      ctx.textBaseline = 'middle';
      ctx.fillStyle = color;
      let fitted = size;
      ctx.font = weight + ' ' + fitted + 'px ' + font;
      while (maxWidth && ctx.measureText(value).width > maxWidth && fitted > 24) {
        ctx.font = weight + ' ' + (--fitted) + 'px ' + font;
      }
      ctx.fillText(value, x, y);
    }
    function box(x, y, width, height, color, radius = 0) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(x, y, width, height, radius);
      ctx.fill();
    }
    function border(x, y, width, height, color, radius = 0, lineWidth = 1) {
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      ctx.roundRect(x, y, width, height, radius);
      ctx.stroke();
    }
    function gradient(x, y, width, height, stops) {
      const result = ctx.createLinearGradient(x, y, x + width, y + height);
      stops.forEach((color, index) => result.addColorStop(index / (stops.length - 1), color));
      return result;
    }
    function laurel(x, y, scale, color) {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(scale, scale);
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 1.5;
      [-1, 1].forEach(side => {
        ctx.beginPath();
        ctx.moveTo(side * 15, 52);
        ctx.quadraticCurveTo(side * 61, 17, side * 29, -45);
        ctx.stroke();
        for (let index = 0; index < 7; index++) {
          const angle = (-65 + index * 18) * Math.PI / 180;
          const px = side * (25 + 19 * Math.cos(angle));
          const py = -33 + index * 11;
          ctx.beginPath();
          ctx.ellipse(px, py, 5, 11, side * (.35 + index * .12), 0, Math.PI * 2);
          ctx.fill();
        }
      });
      ctx.restore();
    }
    function trophy(x, y) {
      const gold = gradient(x, y, 65, 80, ['#FFF0AF', '#D5A340', '#F5D67B']);
      ctx.fillStyle = gold;
      ctx.strokeStyle = gold;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(x + 13, y + 12);
      ctx.lineTo(x + 1, y + 12);
      ctx.quadraticCurveTo(x - 2, y + 41, x + 24, y + 45);
      ctx.moveTo(x + 52, y + 12);
      ctx.lineTo(x + 64, y + 12);
      ctx.quadraticCurveTo(x + 67, y + 41, x + 43, y + 45);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + 10, y + 3);
      ctx.lineTo(x + 55, y + 3);
      ctx.lineTo(x + 51, y + 35);
      ctx.quadraticCurveTo(x + 33, y + 65, x + 14, y + 35);
      ctx.closePath();
      ctx.fill();
      box(x + 29, y + 49, 8, 22, gold, 2);
      box(x + 13, y + 71, 40, 8, gold, 2);
      box(x + 8, y + 80, 50, 8, gold, 2);
    }
    function medal(x, y, rank) {
      const colors = rank === 1 ? ['#FFF1B2', '#D5A340', '#F9DA79', '#BA8425'] :
        rank === 2 ? ['#F3F6F9', '#9AAABA', '#DBE3EB', '#8193A3'] :
        rank === 3 ? ['#F9D5B6', '#BF8057', '#EDB68D', '#A76945'] :
        ['#BCD7ED', '#4A80AE', '#83B1D7', '#34668F'];
      const radius = 35;
      ctx.fillStyle = colors[1];
      ctx.beginPath();
      ctx.moveTo(x - 21, y + radius - 8);
      ctx.lineTo(x - 25, y + radius + 22);
      ctx.lineTo(x, y + radius + 9);
      ctx.lineTo(x + 25, y + radius + 22);
      ctx.lineTo(x + 21, y + radius - 8);
      ctx.fill();
      ctx.fillStyle = gradient(x - radius, y - radius, radius * 2, radius * 2, colors);
      ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#FFFFFFB0'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, radius - 6, 0, Math.PI * 2); ctx.stroke();
      text(String(rank), x, y - 2, 38, rank === 1 ? '#725014' : rank === 2 ? '#3D4650' : rank === 3 ? '#6A3B20' : '#FFFFFF', 'center', 800);
    }
    box(0, 0, 1080, 1080, '#F5F8FC');
    box(0, 0, 1080, 218, gradient(0, 0, 1080, 218, ['#174972', '#0D2D4D']));
    box(0, 214, 1080, 4, gradient(0, 0, 1080, 0, ['#A37829', '#FFF0B8', '#BB8D32']));
    trophy(57, 69);
    text(String(model.year).slice(-2) + '年' + String(model.month).padStart(2, '0') + '月', 160, 60, 31, '#D6E5F2', 'left', 500);
    text('収益ランキング', 155, 132, 57, '#FFFFFF', 'left', 800, 700);
    text('インスタ部門', 1024, 51, 27, '#D6E5F2', 'right', 600);
    laurel(951, 133, .88, '#D6B661');
    text('TOP', 951, 112, 19, '#F0D995', 'center', 600);
    text('5', 951, 149, 48, '#F9E6A8', 'center', 700);
    text('名前', 181, 259, 28, '#617A8E');
    text('リスト数', 680, 259, 28, '#617A8E', 'right');
    text('収益', 1018, 259, 28, '#617A8E', 'right');
    box(34, 292, 1012, 680, '#FFFFFF', 16);
    border(34, 292, 1012, 680, '#D8BD78', 16, 1.5);
    const maxRevenue = model.rows[0].revenue;
    model.rows.forEach((row, index) => {
      const top = 292 + index * 140;
      const height = 120;
      const y = top + 47;
      medal(106, y + 2, index + 1);
      text(row.name, 181, y, 42, '#142F47', 'left', 700, 322);
      text(format(row.clients) + '件', 680, y, 37, '#506B80', 'right', 500, 170);
      text('¥' + format(row.revenue), 1018, y, 44, '#183B59', 'right', 700, 312);
      const barY = top + height - 24;
      box(181, barY, 837, 8, '#E6EEF5', 4);
      box(181, barY, Math.max(3, 837 * row.revenue / maxRevenue), 8,
        '#3A82BE', 4);
      if (index < model.rows.length - 1) box(60, top + 130, 960, 1, '#E4EBF3');
    });
    box(34, 1020, 1012, 1, '#DDE6EF');
    text(model.month + '月1日〜' + model.dateLabel + 'の当月累計', 540, 1049, 26, '#617A8E', 'center', 500);
    return canvas;
  }

  function showImage(canvas, message) {
    const panel = document.getElementById('ranking-top5-recovery');
    const image = document.getElementById('ranking-top5-image');
    image.src = canvas.toDataURL('image/png');
    panel.hidden = false;
    document.getElementById('ranking-top5-status').textContent = message;
  }

  function bindButton() {
    const button = document.getElementById('ranking-top5-download');
    if (!button) return;
    button.addEventListener('click', async function () {
      const status = document.getElementById('ranking-top5-status');
      const panel = document.getElementById('ranking-top5-recovery');
      button.disabled = true;
      button.textContent = '画像を準備中…';
      status.textContent = '';
      panel.hidden = true;
      try {
        const model = makeModel(typeof appData === 'undefined' ? null : appData);
        const canvas = createCanvas(model);
        const mobile = /Android|iPad|iPhone|iPod|Line\/|FBAN|FBAV|Instagram|MicroMessenger/i.test(navigator.userAgent);
        if (mobile) {
          // Canvas conversion is synchronous, preserving the original tap for the share sheet.
          const data = atob(canvas.toDataURL('image/png').split(',')[1]);
          const bytes = Uint8Array.from(data, character => character.charCodeAt(0));
          const file = new File([bytes], model.filename, { type: 'image/png' });
          if (navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
            try {
              await navigator.share({ files: [file], title: '今月の収益TOP5' });
              status.textContent = '共有画面で保存先を選んでください。';
              return;
            } catch (error) {
              if (error.name === 'AbortError') {
                status.textContent = '保存をキャンセルしました。';
                return;
              }
            }
          }
          showImage(canvas, '画像を表示しました。画像を長押しして保存してください。');
          return;
        }
        const blob = await new Promise((resolve, reject) => canvas.toBlob(
          value => value ? resolve(value) : reject(new Error('画像を作成できませんでした。')), 'image/png'));
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = model.filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        status.textContent = '画像のダウンロードを開始しました。';
      } catch (error) {
        status.textContent = error.message || '画像を保存できませんでした。もう一度押してください。';
      } finally {
        button.disabled = false;
        button.textContent = '収益TOP5を保存';
      }
    });
  }

  const api = { makeModel, createCanvas };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else {
    root.RankingTop5Image = api;
    bindButton();
  }
})(typeof window !== 'undefined' ? window : this);
