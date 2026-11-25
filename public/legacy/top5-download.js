(function () {
  'use strict';
  const status = document.getElementById('download-status');
  const retry = document.getElementById('download-retry');
  const image = document.getElementById('download-image');
  const manualPhotoSave = /iPad|iPhone|iPod|Line\/|FBAN|FBAV|Instagram|MicroMessenger/i.test(navigator.userAgent);
  let initialized = false;

  function failed() {
    status.textContent = '画像を準備できませんでした。このページを再読み込みしてください。';
    retry.hidden = true;
    image.hidden = true;
  }

  async function loaded(data) {
    if (initialized) return;
    initialized = true;
    try {
      const model = RankingTop5Image.makeModel(data);
      const canvas = RankingTop5Image.createCanvas(model);
      image.src = canvas.toDataURL('image/png');
      image.hidden = false;
      const blob = await new Promise((resolve, reject) => canvas.toBlob(
        value => value ? resolve(value) : reject(new Error('image_unavailable')), 'image/png'));
      const url = URL.createObjectURL(blob);
      retry.href = url;
      retry.download = model.filename;
      retry.hidden = false;
      if (manualPhotoSave) {
        status.textContent = '画像を長押しして保存してください。';
        const file = new File([blob], model.filename, { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
          retry.textContent = '共有画面から保存する';
          retry.addEventListener('click', async event => {
            event.preventDefault();
            try {
              await navigator.share({ files: [file], title: '今月の収益TOP5' });
            } catch (error) {
              if (error.name !== 'AbortError') status.textContent = '画像を長押しして保存してください。';
            }
          });
        } else {
          retry.textContent = '画像ファイルを開く';
          retry.removeAttribute('download');
          retry.target = '_blank';
          retry.rel = 'noopener noreferrer';
        }
        return;
      }
      retry.click();
      status.textContent = '画像のダウンロードを開始しました。始まらない場合は下のリンクを押してください。';
    } catch (_) {
      failed();
    }
  }

  window.PortalRpc('getData').then(loaded).catch(failed);
})();
