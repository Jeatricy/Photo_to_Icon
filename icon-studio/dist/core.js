(function (root) {
  'use strict';
  function parseSizes(selected, customEnabled = false, custom = '') {
    const entries = selected.map(n => ({ width: Number(n), height: Number(n) }));
    if (customEnabled) {
      if (!custom.trim()) throw new Error('请输入自定义尺寸，例如 30x30, 60x60。');
      for (const value of custom.trim().split(/[,，;；]+/).map(s => s.trim())) {
        const match = /^(\d{1,3})\s*[xX×*]\s*(\d{1,3})$/.exec(value);
        if (!match) throw new Error('“' + value + '”的格式不正确，请使用 宽x高，例如 30x30。');
        entries.push({ width: Number(match[1]), height: Number(match[2]) });
      }
    }
    if (!entries.length) throw new Error('请至少选择一个图标尺寸。');
    const unique = new Map();
    for (const entry of entries) {
      if (![entry.width, entry.height].every(n => Number.isInteger(n) && n >= 16 && n <= 256)) {
        throw new Error('图标的宽度和高度都需要在 16–256 像素之间。');
      }
      unique.set(entry.width + 'x' + entry.height, entry);
    }
    if (unique.size > 32) throw new Error('每次最多可以选择 32 种尺寸。');
    return [...unique.values()].sort((a, b) => a.width * a.height - b.width * b.height || a.width - b.width);
  }
  // Bottom-up BGRA bitmap + DWORD-aligned 1-bit AND transparency mask.
  function encodeDib({ width, height, rgba }) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 256 || height > 256) {
      throw new Error('ICO 尺寸超出范围。');
    }
    if (rgba.length !== width * height * 4) throw new Error('图像像素数据长度不正确。');
    const maskStride = Math.ceil(width / 32) * 4;
    const pixelBytes = width * height * 4;
    const bytes = new Uint8Array(40 + pixelBytes + maskStride * height);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, 40, true);
    view.setInt32(4, width, true);
    view.setInt32(8, height * 2, true);
    view.setUint16(12, 1, true);
    view.setUint16(14, 32, true);
    view.setUint32(20, pixelBytes + maskStride * height, true);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const from = (y * width + x) * 4;
        const to = 40 + ((height - 1 - y) * width + x) * 4;
        bytes[to] = rgba[from + 2];
        bytes[to + 1] = rgba[from + 1];
        bytes[to + 2] = rgba[from];
        bytes[to + 3] = rgba[from + 3];
        if (rgba[from + 3] === 0) {
          const mask = 40 + pixelBytes + (height - 1 - y) * maskStride + Math.floor(x / 8);
          bytes[mask] |= 0x80 >> (x % 8);
        }
      }
    }
    return bytes;
  }
  function encodeIco(frames) {
    if (!frames.length || frames.length > 32) throw new Error('ICO 需要 1–32 个图像。');
    const images = frames.map(encodeDib);
    const directoryBytes = 6 + frames.length * 16;
    const bytes = new Uint8Array(directoryBytes + images.reduce((sum, image) => sum + image.length, 0));
    const view = new DataView(bytes.buffer);
    view.setUint16(2, 1, true);
    view.setUint16(4, frames.length, true);
    let offset = directoryBytes;
    frames.forEach((frame, index) => {
      const entry = 6 + index * 16;
      bytes[entry] = frame.width === 256 ? 0 : frame.width;
      bytes[entry + 1] = frame.height === 256 ? 0 : frame.height;
      view.setUint16(entry + 4, 1, true);
      view.setUint16(entry + 6, 32, true);
      view.setUint32(entry + 8, images[index].length, true);
      view.setUint32(entry + 12, offset, true);
      bytes.set(images[index], offset);
      offset += images[index].length;
    });
    return bytes;
  }
  const crcTable = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let value = i;
    for (let j = 0; j < 8; j++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
    crcTable[i] = value;
  }
  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff];
    return (crc ^ 0xffffffff) >>> 0;
  }
  // Store-only ZIP with UTF-8 filenames and CRC-32.
  function encodeZip(files) {
    if (!files.length || files.length > 65535) throw new Error('ZIP 文件数量超出范围。');
    const encoder = new TextEncoder();
    const parts = [];
    const central = [];
    let offset = 0;
    const now = new Date();
    const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    const date = ((Math.max(1980, now.getFullYear()) - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    for (const file of files) {
      const name = encoder.encode(file.name);
      const data = file.bytes;
      const crc = crc32(data);
      const local = new Uint8Array(30 + name.length);
      const lv = new DataView(local.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true);
      lv.setUint16(6, 0x0800, true);
      lv.setUint16(10, time, true);
      lv.setUint16(12, date, true);
      lv.setUint32(14, crc, true);
      lv.setUint32(18, data.length, true);
      lv.setUint32(22, data.length, true);
      lv.setUint16(26, name.length, true);
      local.set(name, 30);
      parts.push(local, data);
      const entry = new Uint8Array(46 + name.length);
      const cv = new DataView(entry.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true);
      cv.setUint16(12, time, true);
      cv.setUint16(14, date, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, data.length, true);
      cv.setUint32(24, data.length, true);
      cv.setUint16(28, name.length, true);
      cv.setUint32(42, offset, true);
      entry.set(name, 46);
      central.push(entry);
      offset += local.length + data.length;
    }
    const centralSize = central.reduce((sum, entry) => sum + entry.length, 0);
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);
    const zip = new Uint8Array(offset + centralSize + end.length);
    let position = 0;
    for (const part of [...parts, ...central, end]) { zip.set(part, position); position += part.length; }
    return zip;
  }
  function safeBaseName(name) {
    const base = name.replace(/\.[^.]+$/, '').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/, '').trim();
    return (base || 'icon').slice(0, 90);
  }
  const api = { parseSizes, encodeDib, encodeIco, encodeZip, crc32, safeBaseName };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.IconCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
