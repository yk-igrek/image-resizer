'use strict';

/* ===== State ===== */
let files = [];
let results = [];
let selectedSize = 1024;
let isCustom = false;
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
const customWrap  = document.getElementById('customWrap');
const customSizeIn = document.getElementById('customSize');
const folderNameIn = document.getElementById('folderName');
const prefixIn    = document.getElementById('prefixText');
const suffixIn    = document.getElementById('suffixText');

/* ===== Size selector ===== */
document.getElementById('sizeButtons').addEventListener('click', e => {
  const btn = e.target.closest('.size-btn');
  if (!btn) return;

  if (btn === customBtn) {
    document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
    customBtn.classList.add('active');
    customWrap.classList.add('visible');
    isCustom = true;
    const v = parseInt(customSizeIn.value, 10);
    if (v > 0) selectedSize = v;
    return;
  }

  const size = parseInt(btn.dataset.size, 10);
  if (isNaN(size)) return;
  document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  selectedSize = size;
  isCustom = false;
  customWrap.classList.remove('visible');
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
    const dlClass     = (res && !res.error) ? 'file-dl btn btn-secondary btn-sm visible' : 'file-dl btn btn-secondary btn-sm';
    const metaText    = (res && !res.error) ? buildSizeMeta(f.size, res.size) : formatBytes(f.size);

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
      <button class="${dlClass}" data-idx="${i}" type="button">⬇ ダウンロード</button>
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

async function processOneFile(file, settings) {
  const isHeic = /\.(heic|heif)$/i.test(file.name) ||
                 file.type === 'image/heic' || file.type === 'image/heif';
  let blob = file;
  const baseName = file.name.replace(/\.[^.]+$/, '');

  /* --- HEIC conversion --- */
  if (isHeic) {
    const toType = settings.format === 'png'  ? 'image/png'  :
                   settings.format === 'webp' ? 'image/webp' : 'image/jpeg';
    const conv = await heic2any({ blob: file, toType, quality: settings.quality / 100 });
    blob = Array.isArray(conv) ? conv[0] : conv;
  }

  /* --- Load on canvas --- */
  const img = await loadImage(blob);
  const maxPx = settings.maxSize;
  const scale = Math.min(maxPx / img.naturalWidth, maxPx / img.naturalHeight);
  const newW = scale < 1 ? Math.round(img.naturalWidth  * scale) : img.naturalWidth;
  const newH = scale < 1 ? Math.round(img.naturalHeight * scale) : img.naturalHeight;

  const canvas = document.createElement('canvas');
  canvas.width  = newW;
  canvas.height = newH;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, newW, newH);

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

  const maxSize = isCustom ? parseInt(customSizeIn.value, 10) : selectedSize;
  if (!maxSize || maxSize < 10) {
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
    if (statusEl) {
      statusEl.className = 'file-status status-processing';
      statusEl.textContent = '処理中...';
    }

    try {
      results[i] = await processOneFile(files[i], settings);
      if (statusEl) {
        statusEl.className = 'file-status status-done';
        statusEl.textContent = results[i].dimensions;
      }
      const metaEl = items[i]?.querySelector('.file-meta');
      if (metaEl) metaEl.innerHTML = buildSizeMeta(files[i].size, results[i].size);
      const dlBtn = items[i]?.querySelector('.file-dl');
      if (dlBtn) dlBtn.classList.add('visible');
    } catch (err) {
      console.error(err);
      results[i] = { error: err.message };
      if (statusEl) {
        statusEl.className = 'file-status status-error';
        statusEl.textContent = 'エラー';
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
