'use strict';

/* ===== State ===== */
let files = [];
let results = [];
let selectedSize = 1024;
let isCustom = false;
let noResize = false;
let selectedFormat = 'original';
let saveMethod = 'folder';
let processing = false;

/* ===== DOM ===== */
const dropZone    = document.getElementById('dropZone');
const fileInput   = document.getElementById('fileInput');
const fileListCard = document.getElementById('fileListCard');
const actionCard  = document.getElementById('actionCard');
const fileListEl  = document.getElementById('fileList');
const fileCountEl = document.getElementById('fileCount');
const clearBtn    = document.getElementById('clearBtn');
const processBtn  = document.getElementById('processBtn');
const downloadBtn = document.getElementById('downloadBtn');
const zipRow      = document.getElementById('zipRow');
const progressWrap = document.getElementById('progressWrap');
const progressBar  = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
const qualityRange = document.getElementById('qualityRange');
const qualityVal   = document.getElementById('qualityVal');
const qualityGroup = document.getElementById('qualityGroup');
const customBtn   = document.getElementById('customBtn');
const noResizeBtn = document.getElementById('noResizeBtn');
const customWrap  = document.getElementById('customWrap');
const customSizeIn = document.getElementById('customSize');
const folderNameIn = document.getElementById('folderName');
const prefixIn    = document.getElementById('prefixText');
const suffixIn    = document.getElementById('suffixText');

/* ===== Size selector ===== */
document.getElementById('sizeButtons').addEventListener('click', e => {
  const btn = e.target.closest('.size-btn');
  if (!btn) return;

  document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  isCustom = false;
  noResize = false;
  customWrap.classList.remove('visible');

  if (btn === noResizeBtn) {
    noResize = true;
    return;
  }

  if (btn === customBtn) {
    customWrap.classList.add('visible');
    isCustom = true;
    const v = parseInt(customSizeIn.value, 10);
    if (v > 0) selectedSize = v;
    return;
  }

  const size = parseInt(btn.dataset.size, 10);
  if (!isNaN(size)) selectedSize = size;
});

customSizeIn.addEventListener('input', () => {
  const v = parseInt(customSizeIn.value, 10);
  if (v > 0) selectedSize = v;
});

/* ===== Format selector ===== */
document.getElementById('formatButtons').addEventListener('click', e => {
  const btn = e.target.closest('.format-btn');
  if (!btn) return;
  document.querySelectorAll('.format-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  selectedFormat = btn.dataset.fmt;
  const isPng = selectedFormat === 'png';
  qualityGroup.style.display = '';
  document.getElementById('qualityLabel').textContent =
    isPng ? 'PNG 色数（品質）' : '品質（JPG / WebP）';
  const qualityNote = document.getElementById('qualityNote');
  isPng ? qualityNote.classList.add('visible') : qualityNote.classList.remove('visible');
});

/* ===== Quality ===== */
qualityRange.addEventListener('input', () => { qualityVal.textContent = qualityRange.value; });

/* ===== Save method ===== */
document.querySelectorAll('input[name="saveMethod"]').forEach(r => {
  r.addEventListener('change', () => {
    saveMethod = r.value;
    document.querySelectorAll('.save-option').forEach(o => o.classList.remove('active'));
    r.closest('.save-option').classList.add('active');
    refreshActionButtons();
  });
});

/* ===== Drop Zone ===== */
dropZone.addEventListener('click', () => fileInput.click());

dropZone.addEventListener('dragover', e => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});
dropZone.addEventListener('dragleave', e => {
  if (!dropZone.contains(e.relatedTarget)) dropZone.classList.remove('drag-over');
});
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  addFiles([...e.dataTransfer.files].filter(isImage));
});

fileInput.addEventListener('change', () => {
  addFiles([...fileInput.files].filter(isImage));
  fileInput.value = '';
});

function isImage(f) {
  return f.type.startsWith('image/') || /\.(heic|heif|jpe?g|png|gif|webp|bmp|tiff?)$/i.test(f.name);
}

/* ===== File management ===== */
function addFiles(newFiles) {
  const existingKeys = new Set(files.map(f => f.name + f.size));
  files.push(...newFiles.filter(f => !existingKeys.has(f.name + f.size)));
  results = [];
  renderFileList();
  updateUI();
}

clearBtn.addEventListener('click', () => {
  files = [];
  results = [];
  renderFileList();
  updateUI();
});

function formatBytes(b) {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1048576).toFixed(1) + ' MB';
}

function buildSizeMeta(origSize, outSize) {
  const pct = Math.round((1 - outSize / origSize) * 100);
  const isReduced = pct >= 0;
  const arrow = isReduced ? '▼' : '▲';
  const cls   = isReduced ? 'size-reduced' : 'size-increased';
  return `${formatBytes(origSize)} → ${formatBytes(outSize)} `
       + `<span class="${cls}">${arrow}${Math.abs(pct)}%</span>`;
}

function renderFileList() {
  fileListEl.innerHTML = '';
  if (files.length === 0) {
    fileListEl.innerHTML = '<div class="empty-state">ファイルがありません</div>';
    fileCountEl.textContent = '0';
    return;
  }

  fileCountEl.textContent = files.length;

  files.forEach((f, i) => {
    const res = results[i];
    const isHeic = /\.(heic|heif)$/i.test(f.name);
    const statusClass = !res ? 'status-pending' : res.error ? 'status-error' : 'status-done';
    const statusText  = !res ? '待機中' : res.error ? 'エラー' : res.dimensions;
    const metaText    = (res && !res.error) ? buildSizeMeta(f.size, res.size) : formatBytes(f.size);
    // 処理済みのときだけダウンロードボタンを出力する
    const dlButton    = (res && !res.error)
      ? `<button class="file-dl btn btn-secondary btn-sm" data-idx="${i}" type="button">⬇ ダウンロード</button>`
      : '';

    const item = document.createElement('div');
    item.className = 'file-item';
    // ファイル名はテキストとして安全に扱う（XSS対策）
    item.innerHTML = `
      <div class="file-thumb-placeholder">${isHeic ? '📷' : '🖼'}</div>
      <div class="file-info">
        <div class="file-name"></div>
        <div class="file-meta">${metaText}</div>
      </div>
      <span class="file-status ${statusClass}">${statusText}</span>
      ${dlButton}
      <button class="file-remove" data-idx="${i}" type="button" title="削除">✕</button>
    `;
    // ファイル名はtextContentで設定してXSSを防ぐ
    item.querySelector('.file-name').textContent = f.name;
    fileListEl.appendChild(item);

    // サムネイル（HEIC以外）
    if (!isHeic && f.type.startsWith('image/')) {
      const url = URL.createObjectURL(f);
      const ph = item.querySelector('.file-thumb-placeholder');
      const img = document.createElement('img');
      img.className = 'file-thumb';
      img.alt = f.name;
      img.src = url;
      img.onload = () => URL.revokeObjectURL(url);
      img.onerror = () => URL.revokeObjectURL(url);
      ph.replaceWith(img);
    }
  });

  fileListEl.querySelectorAll('.file-dl').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const r = results[+btn.dataset.idx];
      if (!r || r.error) return;
      const url = URL.createObjectURL(r.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = r.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    });
  });

  fileListEl.querySelectorAll('.file-remove').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      files.splice(+btn.dataset.idx, 1);
      results = [];
      renderFileList();
      updateUI();
    });
  });
}

function updateUI() {
  const has = files.length > 0;
  fileListCard.classList.toggle('hidden', !has);
  actionCard.classList.toggle('visible', has);
  if (!has) actionCard.classList.remove('visible');
  refreshActionButtons();
}

function refreshActionButtons() {
  const hasResults = results.length > 0 && results.some(r => r && !r.error);
  zipRow.classList.toggle('visible', hasResults);
}

/* ===== Image processing helpers ===== */
function loadImage(blob) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload  = () => { URL.revokeObjectURL(url); res(img); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('画像の読み込みに失敗しました')); };
    img.src = url;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise(res => canvas.toBlob(res, type, quality));
}

// libheif-js を使った HEIC デコード（iOS 最新 HEIC 対応）
let _libheifModule = null;
async function getLibheifModule() {
  if (_libheifModule) return _libheifModule;
  if (typeof libheif === 'undefined') throw new Error('libheif not loaded');

  // ブラウザは WASM の同期 fetch を禁止しているため、先に fetch してバイナリを渡す
  const wasmUrl = 'https://cdn.jsdelivr.net/npm/libheif-js@1.18.2/libheif-wasm/libheif.wasm';
  const res = await fetch(wasmUrl);
  if (!res.ok) throw new Error(`WASM fetch failed: ${res.status}`);
  const wasmBinary = await res.arrayBuffer();

  // wasmBinary を渡すと WASM が同期的に初期化されるため、await するだけでよい
  _libheifModule = await libheif({ wasmBinary });
  if (!_libheifModule || !_libheifModule.HeifDecoder) throw new Error('libheif init failed');
  return _libheifModule;
}

async function decodeWithLibheif(file) {
  const lib = await getLibheifModule();
  const decoder = new lib.HeifDecoder();
  const uint8 = new Uint8Array(await file.arrayBuffer());
  const images = decoder.decode(uint8);
  if (!images || images.length === 0) throw new Error('No HEIC image data decoded');
  const image = images[0];
  const width  = image.get_width();
  const height = image.get_height();
  const canvas = document.createElement('canvas');
  canvas.width  = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  // display() に渡す ImageData を作成。コールバックでピクセルが書き込まれる
  const imageData = ctx.createImageData(width, height);
  await new Promise((resolve, reject) => {
    image.display(imageData, (result) => {
      if (!result) { reject(new Error('libheif display failed')); return; }
      try {
        if (result instanceof ImageData) {
          ctx.putImageData(result, 0, 0);
        } else {
          // display が plain object を返す場合（{data, width, height}）
          ctx.putImageData(new ImageData(new Uint8ClampedArray(result.data.buffer), result.width, result.height), 0, 0);
        }
        resolve();
      } catch (e) { reject(e); }
    });
  });
  return canvas;
}

// HEIC デコード（4段階フォールバック）
async function loadHeic(file, quality) {
  // 1. ImageDecoder API (Chrome 94+ / Safari 16.4+) ― ライブラリ不要・最速
  //    isTypeSupported のチェックは省略し、直接試みる（Windows Chrome では false でも動作する場合あり）
  if ('ImageDecoder' in window) {
    for (const type of ['image/heic', 'image/heif']) {
      try {
        const ab = await file.arrayBuffer();
        const decoder = new ImageDecoder({ data: ab, type });
        const { image } = await decoder.decode({ frameIndex: 0 });
        return { drawable: image, dw: image.width, dh: image.height };
      } catch (e) {
        console.warn(`ImageDecoder(${type}) failed:`, e.message ?? e);
      }
    }
  }

  // 2. ネイティブ <img> ロード（5秒タイムアウト）
  try {
    const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000));
    const img = await Promise.race([loadImage(file), timeout]);
    if (img.naturalWidth > 0) return { drawable: img, dw: img.naturalWidth, dh: img.naturalHeight };
  } catch {}

  // 3. libheif-js（新しい libheif — iOS 最新 HEIC・HEVC コーデック対応）
  try {
    const canvas = await decodeWithLibheif(file);
    console.log('libheif-js: decode succeeded');
    return { drawable: canvas, dw: canvas.width, dh: canvas.height };
  } catch (e) {
    console.warn('libheif-js failed:', e.message ?? e);
  }

  // 4. heic2any フォールバック
  if (typeof heic2any === 'undefined') {
    throw new Error('HEICの変換に失敗しました。ChromeまたはSafariをお試しください。');
  }
  const timeout = new Promise((_, rej) =>
    setTimeout(() => rej(new Error('HEIC変換がタイムアウトしました。')), 60_000)
  );
  try {
    const conv = await Promise.race([
      heic2any({ blob: file, toType: 'image/jpeg', quality }),
      timeout,
    ]);
    const blob = Array.isArray(conv) ? conv[0] : conv;
    const img = await loadImage(blob);
    return { drawable: img, dw: img.naturalWidth, dh: img.naturalHeight };
  } catch (e) {
    throw new Error(`HEIC変換失敗: ${e.message ?? e}`);
  }
}

async function processOneFile(file, settings) {
  const isHeic = /\.(heic|heif)$/i.test(file.name) ||
                 file.type === 'image/heic' || file.type === 'image/heif';
  const baseName = file.name.replace(/\.[^.]+$/, '');

  /* --- 画像ソース取得 --- */
  // drawable: ctx.drawImage() に渡せる HTMLImageElement または ImageBitmap
  // dw / dh:  元の幅・高さ
  let drawable, dw, dh;

  if (isHeic) {
    ({ drawable, dw, dh } = await loadHeic(file, settings.quality / 100));
  } else {
    const img = await loadImage(file);
    drawable = img;
    dw = img.naturalWidth;
    dh = img.naturalHeight;
  }
  let newW, newH;
  if (settings.maxSize === null) {
    newW = dw;
    newH = dh;
  } else {
    const scale = Math.min(settings.maxSize / dw, settings.maxSize / dh);
    newW = scale < 1 ? Math.round(dw * scale) : dw;
    newH = scale < 1 ? Math.round(dh * scale) : dh;
  }

  const canvas = document.createElement('canvas');
  canvas.width  = newW;
  canvas.height = newH;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(drawable, 0, 0, newW, newH);

  /* --- Output format --- */
  let mimeType, ext;
  const origExt = file.name.split('.').pop().toLowerCase();

  if (settings.format === 'original') {
    if (isHeic)                                        { mimeType = 'image/jpeg'; ext = 'jpg';    }
    else if (origExt === 'png')                        { mimeType = 'image/png';  ext = 'png';    }
    else if (origExt === 'webp')                       { mimeType = 'image/webp'; ext = 'webp';   }
    else if (origExt === 'gif')                        { mimeType = 'image/png';  ext = 'png';    }
    else if (origExt === 'jpg' || origExt === 'jpeg')  { mimeType = 'image/jpeg'; ext = origExt;  }
    else                                               { mimeType = 'image/jpeg'; ext = 'jpg';    }
  } else {
    const map = { jpg: ['image/jpeg','jpg'], png: ['image/png','png'], webp: ['image/webp','webp'] };
    [mimeType, ext] = map[settings.format] || ['image/jpeg','jpg'];
  }

  /* --- Encode --- */
  let outBlob;
  if (mimeType === 'image/png' && typeof UPNG !== 'undefined') {
    try {
      // 色数: 100% → 0（フルカラー無劣化）、未満 → 最大256色まで削減
      const colorCount = settings.quality >= 100 ? 0 : Math.max(2, Math.round(settings.quality / 100 * 256));
      const imageData = ctx.getImageData(0, 0, newW, newH);
      const buf = imageData.data.buffer.slice(0); // SharedArrayBuffer 対策
      const pngBuf = UPNG.encode([buf], newW, newH, colorCount);
      outBlob = new Blob([pngBuf], { type: 'image/png' });
    } catch (e) {
      console.warn('UPNG encode failed, fallback to canvas:', e);
      outBlob = await canvasToBlob(canvas, 'image/png');
    }
  } else {
    const quality = mimeType === 'image/png' ? undefined : settings.quality / 100;
    outBlob = await canvasToBlob(canvas, mimeType, quality);
  }

  /* --- Output filename --- */
  let filename;
  if (settings.saveMethod === 'prefix') {
    filename = `${settings.prefix}${baseName}.${ext}`;
  } else if (settings.saveMethod === 'suffix') {
    filename = `${baseName}${settings.suffix}.${ext}`;
  } else {
    filename = `${baseName}.${ext}`;
  }

  return { blob: outBlob, filename, dimensions: `${newW}×${newH}`, size: outBlob.size };
}

/* ===== Process button ===== */
processBtn.addEventListener('click', async () => {
  if (processing || files.length === 0) return;

  const maxSize = noResize ? null : (isCustom ? parseInt(customSizeIn.value, 10) : selectedSize);
  if (!noResize && (!maxSize || maxSize < 10)) {
    alert('リサイズサイズを正しく入力してください。');
    return;
  }

  const settings = {
    maxSize,
    format:     selectedFormat,
    quality:    parseInt(qualityRange.value, 10),
    saveMethod,
    prefix:     prefixIn.value,
    suffix:     suffixIn.value,
  };

  processing = true;
  processBtn.disabled = true;
  processBtn.textContent = '処理中...';
  progressWrap.classList.add('visible');
  zipRow.classList.remove('visible');
  results = new Array(files.length);

  const items = fileListEl.querySelectorAll('.file-item');

  for (let i = 0; i < files.length; i++) {
    progressText.textContent = `変換中: ${i + 1} / ${files.length}`;
    progressBar.style.width  = `${(i / files.length) * 100}%`;

    const statusEl = items[i]?.querySelector('.file-status');
    const isHeicFile = /\.(heic|heif)$/i.test(files[i].name);
    if (statusEl) {
      statusEl.className = 'file-status status-processing';
      statusEl.textContent = isHeicFile ? 'HEIC変換中…' : '処理中...';
    }

    try {
      results[i] = await processOneFile(files[i], settings);
      if (statusEl) {
        statusEl.className = 'file-status status-done';
        statusEl.textContent = results[i].dimensions;
      }
      const metaEl = items[i]?.querySelector('.file-meta');
      if (metaEl) metaEl.innerHTML = buildSizeMeta(files[i].size, results[i].size);
      // 処理完了後にダウンロードボタンを挿入（削除ボタンの直前）
      const removeBtn = items[i]?.querySelector('.file-remove');
      if (removeBtn && !items[i].querySelector('.file-dl')) {
        const dlBtn = document.createElement('button');
        dlBtn.className = 'file-dl btn btn-secondary btn-sm';
        dlBtn.dataset.idx = String(i);
        dlBtn.type = 'button';
        dlBtn.textContent = '⬇ ダウンロード';
        dlBtn.addEventListener('click', e => {
          e.stopPropagation();
          const r = results[+dlBtn.dataset.idx];
          if (!r || r.error) return;
          const url = URL.createObjectURL(r.blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = r.filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(url), 2000);
        });
        removeBtn.before(dlBtn);
      }
    } catch (err) {
      console.error(err);
      results[i] = { error: err.message };
      if (statusEl) {
        statusEl.className = 'file-status status-error';
        statusEl.title = err.message;
        statusEl.textContent = `エラー: ${err.message.slice(0, 40)}`;
      }
    }
  }

  const ok = results.filter(r => r && !r.error).length;
  progressBar.style.width  = '100%';
  progressText.textContent = `完了: ${ok} 枚成功 / ${files.length} 枚`;

  processing = false;
  processBtn.disabled = false;
  processBtn.textContent = '▶ リサイズ開始';
  refreshActionButtons();
});

/* ===== Download (ZIP) ===== */
downloadBtn.addEventListener('click', async () => {
  const good = results.filter(r => r && !r.error);
  if (!good.length) return;

  downloadBtn.disabled = true;
  downloadBtn.textContent = 'ZIP 作成中...';

  try {
    const zip  = new JSZip();
    const name = folderNameIn.value.trim() || 'resized';

    if (saveMethod === 'folder') {
      const folder = zip.folder(name);
      good.forEach(r => folder.file(r.filename, r.blob));
    } else {
      good.forEach(r => zip.file(r.filename, r.blob));
    }

    const content = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(content);
    a.download = saveMethod === 'folder' ? `${name}.zip` : 'resized_images.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  } finally {
    downloadBtn.disabled = false;
    downloadBtn.textContent = '⬇ まとめて ZIP でダウンロード';
  }
});
