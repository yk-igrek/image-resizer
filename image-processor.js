/* =====================================================================
 * image-processor.js — 画像のデコード・エンコード・変換処理
 * UI（app.js）から processOneFile() を呼び出して使う
 * ===================================================================== */

/* ===== 基本ヘルパー ===== */
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

/* ===== WASM エンコーダー（jSquash = Squoosh のコーデック移植） =====
 * canvas.toBlob() の JPEG/WebP エンコードは圧縮効率が低く、
 * 「変更なし」設定では元ファイルより大きくなり軽量化できないことが多い。
 * MozJPEG / libwebp (WASM) なら同品質で 3〜5 割小さくなる。 */
const CODEC_CDN = 'https://cdn.jsdelivr.net/npm';
const codecImporters = {
  'image/jpeg': () => import(`${CODEC_CDN}/@jsquash/jpeg@1/+esm`),
  'image/webp': () => import(`${CODEC_CDN}/@jsquash/webp@1/+esm`),
};
const codecCache = new Map();

function loadCodec(mimeType) {
  if (!codecCache.has(mimeType)) {
    codecCache.set(mimeType, codecImporters[mimeType]());
  }
  return codecCache.get(mimeType);
}

/**
 * canvas の内容を指定形式でエンコードする。
 * 優先順: WASM（MozJPEG / WebP）→ UPNG（PNG 減色）→ canvas.toBlob
 * @param {number} quality 1〜100
 */
async function encodeCanvas(canvas, ctx, mimeType, quality) {
  if (codecImporters[mimeType]) {
    try {
      const codec = await loadCodec(mimeType);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const buf = await codec.encode(imageData, { quality });
      return new Blob([buf], { type: mimeType });
    } catch (e) {
      console.warn(`WASM encode failed (${mimeType}), fallback to canvas:`, e);
    }
  }

  if (mimeType === 'image/png' && typeof UPNG !== 'undefined') {
    try {
      // 色数: 100% → 0（フルカラー無劣化）、未満 → 最大256色まで削減
      const colorCount = quality >= 100 ? 0 : Math.max(2, Math.round(quality / 100 * 256));
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const buf = imageData.data.buffer.slice(0); // SharedArrayBuffer 対策
      const pngBuf = UPNG.encode([buf], canvas.width, canvas.height, colorCount);
      return new Blob([pngBuf], { type: 'image/png' });
    } catch (e) {
      console.warn('UPNG encode failed, fallback to canvas:', e);
    }
  }

  return canvasToBlob(canvas, mimeType, mimeType === 'image/png' ? undefined : quality / 100);
}

/* ===== HEIC デコード ===== */

// libheif-js を使った HEIC デコード（iOS 最新 HEIC 対応）
let _libheifModule = null;
async function getLibheifModule() {
  if (_libheifModule) return _libheifModule;
  if (typeof libheif === 'undefined') throw new Error('libheif not loaded');

  // ブラウザは WASM の同期 fetch を禁止しているため、先に fetch してバイナリを渡す
  const wasmUrl = 'https://cdn.jsdelivr.net/npm/libheif-js@1.19.8/libheif-wasm/libheif.wasm';
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

/* ===== 変換のメイン処理 ===== */

/**
 * 1ファイルを設定に従って変換する
 * @param {File} file
 * @param {{maxSize: number|null, format: string, quality: number,
 *          saveMethod: string, prefix: string, suffix: string}} settings
 * @returns {Promise<{blob: Blob, filename: string, dimensions: string, size: number}>}
 */
export async function processOneFile(file, settings) {
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

  /* --- リサイズ寸法（maxSize === null は「変更なし」） --- */
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

  /* --- 出力形式の決定 --- */
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

  /* --- エンコード --- */
  let outBlob = await encodeCanvas(canvas, ctx, mimeType, settings.quality);

  /* --- サイズ比較: 出力が元より大きくなってしまった場合のみ元ファイルを使用 --- */
  if (!isHeic && outBlob.size > file.size) {
    // 「変更なし」選択時: 形式に関わらず元ファイルを使用し拡張子も戻す
    if (settings.maxSize === null) {
      outBlob = new Blob([file], { type: file.type });
      ext = origExt;
    // リサイズなし・形式変換なしの場合も元ファイルを使用
    } else if (settings.format === 'original' && newW === dw && newH === dh) {
      outBlob = new Blob([file], { type: file.type });
    }
  }

  /* --- 出力ファイル名 --- */
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
