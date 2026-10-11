(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const core = window.IconCore;
  const commonSizes = [16, 24, 32, 48, 64, 72, 80, 96, 128, 256];
  const defaults = [32, 48, 256];
  const state = { sources: [], activeId: null, results: [], fit: 'cover', busy: false, demo: null, sequence: 0 };
  const maxFileSize = 20 * 1024 * 1024;
  let decoderPromise = null;
  let previewFrame = 0;

  function icon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('icon');
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#i-' + name);
    svg.append(use);
    return svg;
  }
  function notice(message, type = '') {
    $('notice-text').textContent = message;
    $('notice').className = 'notice' + (type ? ' ' + type : '');
    $('notice').hidden = false;
  }
  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    return bytes < 1024 * 1024 ? (bytes / 1024).toFixed(1) + ' KB' : (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }
  function selectedSizes() {
    return core.parseSizes([...document.querySelectorAll('.size-option input:checked')].map(input => input.value), $('custom-enabled').checked, $('custom-sizes').value);
  }
  function options() {
    return { fit: state.fit, radius: Number($('corner-radius').value), transparent: $('transparent-bg').checked, color: $('background-color').value };
  }
  function currentSource() { return state.sources.find(source => source.id === state.activeId) || state.sources[0]; }

  function updateSummary() {
    const sizeInputs = [...document.querySelectorAll('.size-option input')];
    $('all-sizes').textContent = sizeInputs.every(input => input.checked) ? '清空' : '全选';
    $('convert-button').disabled = state.busy || !state.sources.length;
    $('download-all').disabled = state.busy || !state.results.length;
    if (state.busy) return;
    $('convert-button-text').textContent = '开始转换';
    if (!state.sources.length) { $('convert-summary').textContent = '选择图片后，即可开始转换'; return; }
    try {
      const sizes = selectedSizes();
      const type = $('output-type').value;
      const count = type === 'multi' ? state.sources.length : state.sources.length * sizes.length;
      $('convert-summary').textContent = state.sources.length + ' 张图片 · ' + sizes.length + ' 种尺寸 · 将生成 ' + count + ' 个' + (type === 'png' ? ' PNG' : ' ICO') + ' 文件';
    } catch (error) { $('convert-summary').textContent = error.message; }
  }

  function setBusy(busy, message = '') {
    state.busy = busy;
    const controls = document.querySelectorAll('.workspace input,.workspace select,.workspace button');
    for (const control of controls) control.disabled = busy;
    $('convert-button-text').textContent = message || '开始转换';
    $('convert-button').classList.toggle('busy', busy);
    if (!busy) {
      $('custom-sizes').disabled = !$('custom-enabled').checked;
      $('background-color').disabled = $('transparent-bg').checked;
    }
    updateSummary();
  }

  commonSizes.forEach(size => {
    const label = document.createElement('label');
    label.className = 'size-option';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = String(size);
    input.checked = defaults.includes(size);
    input.setAttribute('aria-label', size + ' × ' + size + ' 像素');
    const text = document.createElement('span');
    text.textContent = size + ' × ' + size;
    label.append(input, text);
    $('size-options').append(label);
  });

  function roundedRect(ctx, width, height, radius) {
    const r = Math.min(width, height) * radius / 100;
    ctx.beginPath();
    ctx.moveTo(r, 0); ctx.lineTo(width - r, 0); ctx.quadraticCurveTo(width, 0, width, r);
    ctx.lineTo(width, height - r); ctx.quadraticCurveTo(width, height, width - r, height);
    ctx.lineTo(r, height); ctx.quadraticCurveTo(0, height, 0, height - r);
    ctx.lineTo(0, r); ctx.quadraticCurveTo(0, 0, r, 0);
    ctx.closePath();
  }

  function renderImage(source, width, height, settings = options(), canvas = document.createElement('canvas')) {
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.clearRect(0, 0, width, height);
    if (!source) return canvas;
    ctx.save();
    roundedRect(ctx, width, height, settings.radius);
    ctx.clip();
    if (!settings.transparent) { ctx.fillStyle = settings.color; ctx.fillRect(0, 0, width, height); }
    const scale = (settings.fit === 'contain' ? Math.min : Math.max)(width / source.width, height / source.height);
    const drawWidth = source.width * scale;
    const drawHeight = source.height * scale;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source.image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
    ctx.restore();
    return canvas;
  }

  function refreshPreview() {
    cancelAnimationFrame(previewFrame);
    previewFrame = requestAnimationFrame(() => {
      const source = currentSource() || state.demo;
      let largest = { width: 256, height: 256 };
      try { const sizes = selectedSizes(); largest = sizes[sizes.length - 1]; } catch {}
      renderImage(source, largest.width, largest.height, options(), $('main-preview'));
      const ratio = largest.width / largest.height;
      $('main-preview').style.width = (ratio >= 1 ? 164 : 164 * ratio) + 'px';
      $('main-preview').style.height = (ratio <= 1 ? 164 : 164 / ratio) + 'px';
      $('preview-dimension').textContent = largest.width + ' × ' + largest.height;
      for (const canvas of document.querySelectorAll('[data-mini-size]')) {
        const size = Number(canvas.dataset.miniSize);
        renderImage(source, size, size, options(), canvas);
      }
      $('preview-chip').textContent = currentSource() ? currentSource().name : '示例图片';
      $('preview-chip').title = currentSource() ? currentSource().name : '点击「试用示例」可以体验转换';
      $('preview-stage-note').textContent = currentSource() ? '所见即所得 · 随设置实时更新' : '上传图片，看看你的图标';
    });
    updateSummary();
  }

  function releaseSource(source) {
    if (typeof source.image?.close === 'function') source.image.close();
    if (source.objectUrl) URL.revokeObjectURL(source.objectUrl);
  }

  function renderSources() {
    $('source-list').replaceChildren();
    document.querySelector('.upload-card').classList.toggle('has-sources', state.sources.length > 0);
    $('queue-count').textContent = state.sources.length ? '已导入 ' + state.sources.length + ' 张图片' : '从一张照片开始';
    for (const source of state.sources) {
      const item = document.createElement('div');
      item.className = 'source-item' + (source.id === state.activeId ? ' active' : '');
      const select = document.createElement('button');
      select.type = 'button'; select.className = 'source-select';
      select.setAttribute('aria-label', '预览 ' + source.name);
      select.setAttribute('aria-pressed', String(source.id === state.activeId));
      const image = document.createElement('img');
      image.src = source.thumbnail; image.alt = '';
      const detail = document.createElement('span'); detail.className = 'source-detail';
      const name = document.createElement('strong'); name.textContent = source.name; name.title = source.name;
      const meta = document.createElement('span'); meta.textContent = source.width + ' × ' + source.height + ' · ' + formatBytes(source.size);
      detail.append(name, meta); select.append(image, detail);
      select.addEventListener('click', () => { state.activeId = source.id; renderSources(); refreshPreview(); });
      const remove = document.createElement('button');
      remove.type = 'button'; remove.className = 'icon-button source-remove';
      remove.setAttribute('aria-label', '移除 ' + source.name); remove.append(icon('x'));
      remove.addEventListener('click', () => {
        if (state.busy) return;
        state.sources = state.sources.filter(entry => entry.id !== source.id);
        releaseSource(source);
        if (state.activeId === source.id) state.activeId = state.sources[0]?.id || null;
        renderSources(); refreshPreview();
      });
      item.append(select, remove); $('source-list').append(item);
    }
  }

  function loadDecoder() {
    if (window.HeicTo) return Promise.resolve(window.HeicTo);
    if (!decoderPromise) decoderPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = './vendor/heic-to.js';
      script.onload = () => window.HeicTo ? resolve(window.HeicTo) : reject(new Error('HEIC 解码器初始化失败。'));
      script.onerror = () => { script.remove(); decoderPromise = null; reject(new Error('HEIC 解码器加载失败，请通过本地服务器打开工具后重试。')); };
      document.head.append(script);
    });
    return decoderPromise;
  }

  async function isHeic(blob, name) {
    if (/\.(heic|heif)$/i.test(name) || /image\/hei[cf]/i.test(blob.type)) return true;
    const header = new TextDecoder('ascii').decode(await blob.slice(0, 80).arrayBuffer());
    return header.slice(4, 8) === 'ftyp' && /heic|heix|hevc|hevx|heim|heis/.test(header);
  }

  async function decodeImage(blob, name) {
    if (!blob.size) throw new Error('文件为空，请选择有效图片。');
    if (blob.size > maxFileSize) throw new Error('单张图片最大 20 MB。');
    let drawable = null;
    let objectUrl = null;
    let decodedBlob = blob;
    if (await isHeic(blob, name)) {
      notice('正在解码 HEIC 图片，首次加载可能需要几秒钟。');
      const decoder = await loadDecoder();
      try { decodedBlob = await decoder({ blob, type: 'image/png', quality: 1 }); }
      catch { throw new Error('这张 HEIC / HEIF 图片无法解码，请导出为 PNG 或 JPG 后重试。'); }
    }
    try {
      if (typeof createImageBitmap === 'function' && !/svg/i.test(decodedBlob.type)) {
        try { drawable = await createImageBitmap(decodedBlob, { imageOrientation: 'from-image' }); } catch {}
      }
      if (!drawable) {
        objectUrl = URL.createObjectURL(decodedBlob);
        drawable = new Image();
        drawable.src = objectUrl;
        await drawable.decode();
        // Freeze animation immediately when a browser cannot use ImageBitmap.
        if (/gif|webp/.test(decodedBlob.type)) {
          const frame = document.createElement('canvas');
          frame.width = drawable.naturalWidth; frame.height = drawable.naturalHeight;
          frame.getContext('2d').drawImage(drawable, 0, 0);
          drawable = frame;
        }
      }
      const width = drawable.naturalWidth || drawable.width;
      const height = drawable.naturalHeight || drawable.height;
      if (!width || !height || width * height > 40000000) throw new Error('图片尺寸过大，请使用不超过 4000 万像素的图片。');
      // Keep a bounded working image: icon exports never exceed 256 px.
      if (Math.max(width, height) > 1024) {
        const working = document.createElement('canvas');
        const factor = 1024 / Math.max(width, height);
        working.width = Math.max(1, Math.round(width * factor));
        working.height = Math.max(1, Math.round(height * factor));
        const context = working.getContext('2d');
        context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
        context.drawImage(drawable, 0, 0, working.width, working.height);
        if (typeof drawable.close === 'function') drawable.close();
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        drawable = working; objectUrl = null;
      }
      const source = { id: ++state.sequence, name, size: blob.size, width, height, image: drawable, objectUrl };
      source.thumbnail = renderImage(source, 64, 64, { fit: 'contain', radius: 0, transparent: true }).toDataURL('image/png');
      return source;
    } catch (error) {
      if (drawable && typeof drawable.close === 'function') drawable.close();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      if (/图片尺寸/.test(error.message)) throw error;
      throw new Error('无法读取图片，请确认它是有效的 JPG、PNG、GIF、WEBP、SVG 或 HEIC 文件。');
    }
  }

  async function importFiles(files) {
    if (state.busy || !files.length) return;
    const capacity = 20 - state.sources.length;
    if (capacity <= 0) { notice('最多同时导入 20 张图片，请先移除部分图片。', 'error'); return; }
    const selected = Array.from(files).slice(0, capacity);
    const errors = [];
    let imported = 0;
    setBusy(true, '正在读取图片…');
    try {
      for (const file of selected) {
        try {
          const source = await decodeImage(file, file.name || 'image.png');
          state.sources.push(source);
          state.activeId = source.id;
          imported++;
        } catch (error) { errors.push(file.name + '：' + error.message); }
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      renderSources(); refreshPreview();
      if (errors.length) notice(errors.join('；'), 'error');
      else notice('已导入 ' + imported + ' 张图片。' + (files.length > capacity ? '超出 20 张的图片未导入。' : '可以调整设置或直接开始转换。'), 'success');
    } finally { $('file-input').value = ''; setBusy(false); }
  }

  async function importUrl() {
    if (state.busy) return;
    const raw = $('image-url').value.trim();
    let url;
    try {
      url = new URL(raw);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
    } catch { notice('请输入以 https:// 或 http:// 开头的完整图片地址。', 'error'); $('image-url').focus(); return; }
    if (state.sources.length >= 20) { notice('最多同时导入 20 张图片，请先移除部分图片。', 'error'); return; }
    setBusy(true, '正在导入链接…');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(url.href, { mode: 'cors', credentials: 'omit', signal: controller.signal });
      if (!response.ok) throw new Error('图片请求失败（HTTP ' + response.status + '）。');
      if (Number(response.headers.get('content-length')) > maxFileSize) throw new Error('图片链接文件超过 20 MB。');
      const mime = (response.headers.get('content-type') || '').split(';')[0].trim();
      if (mime && !mime.startsWith('image/') && mime !== 'application/octet-stream') throw new Error('这个链接返回的不是图片，请使用图片直链。');
      let blob;
      if (response.body?.getReader) {
        const reader = response.body.getReader();
        const chunks = [];
        let size = 0;
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.length;
          if (size > maxFileSize) { await reader.cancel(); throw new Error('图片链接文件超过 20 MB。'); }
          chunks.push(chunk.value);
        }
        blob = new Blob(chunks, { type: mime });
      } else blob = await response.blob();
      const filename = decodeURIComponent(url.pathname.split('/').pop() || 'linked-image.png');
      const source = await decodeImage(blob, filename);
      state.sources.push(source); state.activeId = source.id;
      renderSources(); refreshPreview(); notice('图片链接导入成功。', 'success');
    } catch (error) {
      const message = error.name === 'AbortError' ? '图片请求超时，请检查链接后重试。' : error instanceof TypeError ? '无法读取图片链接：来源网站可能限制跨域访问。请将图片保存到本地，再通过「本地文件」导入。' : error.message;
      notice(message, 'error');
    } finally { clearTimeout(timeout); setBusy(false); }
  }

  function canvasBlob(canvas) {
    return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('图片导出失败，请重试。')), 'image/png'));
  }
  function uniqueFilename(base, extension, used) {
    let name = base + '.' + extension;
    let suffix = 2;
    while (used.has(name.toLowerCase())) name = base + '-' + suffix++ + '.' + extension;
    used.add(name.toLowerCase());
    return name;
  }

  async function convert() {
    if (state.busy || !state.sources.length) return;
    let sizes;
    try { sizes = selectedSizes(); } catch (error) { notice(error.message, 'error'); return; }
    const settings = options();
    const type = $('output-type').value;
    const used = new Set(state.results.map(result => result.name.toLowerCase()));
    const pending = [];
    setBusy(true, '正在转换…');
    try {
      for (const source of state.sources) {
        const frames = [];
        for (const size of sizes) {
          const canvas = renderImage(source, size.width, size.height, settings);
          const rgba = canvas.getContext('2d').getImageData(0, 0, size.width, size.height).data;
          frames.push({ ...size, rgba });
          if (type === 'png' || type === 'single') {
            const blob = type === 'png' ? await canvasBlob(canvas) : new Blob([core.encodeIco([{ ...size, rgba }])], { type: 'image/x-icon' });
            const name = uniqueFilename(core.safeBaseName(source.name) + '-' + size.width + 'x' + size.height, type === 'png' ? 'png' : 'ico', used);
            pending.push({ name, blob, source: source.name, sizes: [size], thumbnail: canvas.toDataURL('image/png') });
          }
        }
        if (type === 'multi') {
          const blob = new Blob([core.encodeIco(frames)], { type: 'image/x-icon' });
          const name = uniqueFilename(core.safeBaseName(source.name), 'ico', used);
          const thumbSize = sizes[sizes.length - 1];
          const thumbnail = renderImage(source, thumbSize.width, thumbSize.height, settings).toDataURL('image/png');
          pending.push({ name, blob, source: source.name, sizes, thumbnail });
        }
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      for (const result of pending) result.url = URL.createObjectURL(result.blob);
      state.results.push(...pending);
      renderResults();
      notice('转换完成，已生成 ' + pending.length + ' 个图标文件。点击下载，或打包带走。', 'success');
      $('results-heading').setAttribute('tabindex', '-1');
      $('results-heading').focus({ preventScroll: true });
      document.querySelector('.results-card').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (error) { notice('转换失败：' + error.message, 'error'); }
    finally { setBusy(false); }
  }

  function renderResults() {
    const tbody = $('results-body');
    tbody.replaceChildren();
    $('result-count').textContent = String(state.results.length);
    $('result-count').classList.toggle('has-results', state.results.length > 0);
    $('results-empty').hidden = !!state.results.length;
    $('results-table-wrap').hidden = !state.results.length;
    $('clear-results').hidden = !state.results.length;
    for (const result of state.results) {
      const row = document.createElement('tr');
      const fileCell = document.createElement('td');
      const file = document.createElement('div'); file.className = 'result-file';
      const thumb = document.createElement('img'); thumb.src = result.thumbnail; thumb.alt = ''; thumb.className = 'result-thumb';
      const detail = document.createElement('div'); detail.className = 'file-detail';
      const name = document.createElement('span'); name.className = 'file-name'; name.textContent = result.name; name.title = result.name;
      const meta = document.createElement('span'); meta.className = 'file-meta'; meta.textContent = result.name.endsWith('.png') ? 'PNG 图标 · 无损图像' : 'ICO 图标 · 32 位颜色';
      detail.append(name, meta); file.append(thumb, detail); fileCell.append(file);
      const sourceCell = document.createElement('td'); sourceCell.className = 'source-name'; sourceCell.textContent = result.source; sourceCell.title = result.source;
      const sizeCell = document.createElement('td');
      const sizeText = document.createElement('span'); sizeText.className = 'dimension-list';
      sizeText.textContent = result.sizes.map(size => size.width + '×' + size.height).join(' · ');
      const bytesText = document.createElement('span'); bytesText.className = 'file-meta'; bytesText.textContent = formatBytes(result.blob.size);
      sizeCell.append(sizeText, bytesText);
      const actionCell = document.createElement('td'); actionCell.className = 'align-right';
      const link = document.createElement('a'); link.href = result.url; link.download = result.name; link.className = 'download-link'; link.setAttribute('aria-label', '下载 ' + result.name);
      link.append(icon('download'), document.createTextNode('下载')); actionCell.append(link);
      row.append(fileCell, sourceCell, sizeCell, actionCell); tbody.append(row);
    }
    updateSummary();
  }

  function clearResults() {
    for (const result of state.results) URL.revokeObjectURL(result.url);
    state.results = []; renderResults();
  }

  async function downloadAll() {
    if (!state.results.length || state.busy) return;
    const snapshot = state.results.slice();
    setBusy(true, '正在打包…');
    try {
      const files = [];
      for (const result of snapshot) files.push({ name: result.name, bytes: new Uint8Array(await result.blob.arrayBuffer()) });
      const zip = new Blob([core.encodeZip(files)], { type: 'application/zip' });
      const url = URL.createObjectURL(zip);
      const link = document.createElement('a'); link.href = url; link.download = 'IconLab-icons.zip'; link.hidden = true;
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      notice('已打包 ' + files.length + ' 个图标，ZIP 下载已开始。', 'success');
    } catch (error) { notice('打包失败：' + error.message, 'error'); }
    finally { setBusy(false); }
  }

  function setSourceTab(mode, focus = false) {
    for (const item of ['file', 'link']) {
      const selected = item === mode;
      $(item + '-tab').classList.toggle('active', selected);
      $(item + '-tab').setAttribute('aria-selected', String(selected));
      $(item + '-tab').tabIndex = selected ? 0 : -1;
      $(item + '-panel').hidden = !selected;
    }
    if (focus) $(mode + '-tab').focus();
  }

  $('drop-zone').addEventListener('click', () => $('file-input').click());
  $('file-input').addEventListener('change', event => importFiles(event.target.files));
  for (const eventName of ['dragenter', 'dragover']) $('drop-zone').addEventListener(eventName, event => { event.preventDefault(); if (!state.busy) $('drop-zone').classList.add('drag-over'); });
  for (const eventName of ['dragleave', 'drop']) $('drop-zone').addEventListener(eventName, event => { event.preventDefault(); $('drop-zone').classList.remove('drag-over'); });
  $('drop-zone').addEventListener('drop', event => importFiles(event.dataTransfer.files));
  document.addEventListener('dragover', event => { if (event.dataTransfer.types.includes('Files')) event.preventDefault(); });
  document.addEventListener('drop', event => { if (event.dataTransfer.types.includes('Files')) event.preventDefault(); });
  $('file-tab').addEventListener('click', () => setSourceTab('file'));
  $('link-tab').addEventListener('click', () => setSourceTab('link'));
  document.querySelector('.source-tabs').addEventListener('keydown', event => {
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); setSourceTab(event.key === 'Home' ? 'file' : event.key === 'End' ? 'link' : $('file-tab').getAttribute('aria-selected') === 'true' ? 'link' : 'file', true);
    }
  });
  $('load-url').addEventListener('click', importUrl);
  $('image-url').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); importUrl(); } });
  $('load-sample').addEventListener('click', async () => {
    if (state.busy || !state.demo) return;
    if (state.sources.length >= 20) { notice('最多同时导入 20 张图片。', 'error'); return; }
    const source = { ...state.demo, id: ++state.sequence, name: '山间日落.svg' };
    source.thumbnail = renderImage(source, 64, 64, { fit: 'contain', radius: 0, transparent: true }).toDataURL('image/png');
    state.sources.push(source); state.activeId = source.id; renderSources(); refreshPreview(); notice('示例图片已就绪，点击「开始转换」体验一下。', 'success');
  });
  $('size-options').addEventListener('change', refreshPreview);
  $('custom-enabled').addEventListener('change', () => { $('custom-sizes').disabled = !$('custom-enabled').checked; if ($('custom-enabled').checked) $('custom-sizes').focus(); refreshPreview(); });
  $('custom-sizes').addEventListener('input', refreshPreview);
  $('output-type').addEventListener('change', updateSummary);
  $('common-sizes').addEventListener('click', () => { for (const input of document.querySelectorAll('.size-option input')) input.checked = [16, 32, 48, 256].includes(Number(input.value)); refreshPreview(); });
  $('all-sizes').addEventListener('click', () => {
    const inputs = [...document.querySelectorAll('.size-option input')];
    const allSelected = inputs.every(input => input.checked);
    for (const input of inputs) input.checked = !allSelected;
    $('all-sizes').textContent = allSelected ? '全选' : '清空';
    refreshPreview();
  });
  for (const button of document.querySelectorAll('[data-fit]')) button.addEventListener('click', () => {
    state.fit = button.dataset.fit;
    for (const item of document.querySelectorAll('[data-fit]')) { item.classList.toggle('active', item === button); item.setAttribute('aria-pressed', String(item === button)); }
    refreshPreview();
  });
  $('corner-radius').addEventListener('input', () => { $('radius-value').textContent = $('corner-radius').value + '%'; refreshPreview(); });
  $('transparent-bg').addEventListener('change', () => { $('background-color').disabled = $('transparent-bg').checked; refreshPreview(); });
  $('background-color').addEventListener('input', refreshPreview);
  for (const button of document.querySelectorAll('[data-preview-bg]')) button.addEventListener('click', () => {
    const mode = button.dataset.previewBg;
    $('preview-stage').className = 'preview-stage ' + (mode === 'transparent' ? 'checkerboard' : mode);
    for (const item of document.querySelectorAll('[data-preview-bg]')) { item.classList.toggle('selected', item === button); item.setAttribute('aria-pressed', String(item === button)); }
  });
  $('convert-button').addEventListener('click', convert);
  $('download-all').addEventListener('click', downloadAll);
  $('clear-results').addEventListener('click', () => { if (!state.busy) { clearResults(); notice('转换结果已清空。'); } });
  $('dismiss-notice').addEventListener('click', () => { $('notice').hidden = true; });
  $('reset-button').addEventListener('click', () => {
    if (state.busy) return;
    for (const source of state.sources) releaseSource(source);
    state.sources = []; state.activeId = null; state.fit = 'cover';
    clearResults();
    for (const input of document.querySelectorAll('.size-option input')) input.checked = defaults.includes(Number(input.value));
    $('all-sizes').textContent = '全选'; $('custom-enabled').checked = false; $('custom-sizes').value = ''; $('custom-sizes').disabled = true;
    $('output-type').value = 'multi'; $('image-url').value = ''; $('file-input').value = '';
    $('corner-radius').value = '0'; $('radius-value').textContent = '0%'; $('transparent-bg').checked = true; $('background-color').value = '#ffffff'; $('background-color').disabled = true;
    document.querySelector('[data-fit="cover"]').click(); document.querySelector('[data-preview-bg="transparent"]').click();
    setSourceTab('file'); $('notice').hidden = true; renderSources(); refreshPreview();
  });
  const dialog = $('help-dialog');
  for (const button of document.querySelectorAll('[data-open-help]')) button.addEventListener('click', () => dialog.showModal());
  $('close-help').addEventListener('click', () => dialog.close());
  $('help-done').addEventListener('click', () => { dialog.close(); $('drop-zone').focus(); });
  dialog.addEventListener('click', event => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); } });

  const demoImage = new Image();
  demoImage.onload = () => {
    state.demo = { image: demoImage, width: 512, height: 512, size: 1300, name: '山间日落.svg' };
    refreshPreview();
  };
  demoImage.src = './sample.svg';
  refreshPreview();
})();
