const test = require('node:test');
const assert = require('node:assert/strict');
const { parseSizes, encodeIco, encodeDib, encodeZip, crc32, safeBaseName } = require('../dist/core.js');

function frame(width, height) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const offset = (y * width + x) * 4;
    rgba.set([x % 256, y % 256, 73, x === 0 ? 0 : x === 1 ? 128 : 255], offset);
  }
  return { width, height, rgba };
}

test('size selection merges, sorts and deduplicates custom rectangular dimensions', () => {
  assert.deepEqual(parseSizes([32, 256], true, '30 x 60，32x32,16×16'), [
    { width:16,height:16 }, { width:32,height:32 }, { width:30,height:60 }, { width:256,height:256 }
  ]);
});
test('empty selection, malformed custom size and out-of-range dimensions are rejected', () => {
  assert.throws(() => parseSizes([]), /至少/);
  for (const input of ['0x0', '15x32', '257x128', '1024x1024', '30', '30x30,']) assert.throws(() => parseSizes([], true, input));
  assert.throws(() => parseSizes([], true, ''), /请输入/);
});
test('ICO directory has independent sizes, exact payload boundaries and correct 256 encoding', () => {
  const bytes = encodeIco([frame(16,16),frame(30,60),frame(256,256)]);
  const view = new DataView(bytes.buffer);
  assert.equal(view.getUint16(0,true),0);
  assert.equal(view.getUint16(2,true),1);
  assert.equal(view.getUint16(4,true),3);
  assert.equal(bytes[38],0); assert.equal(bytes[39],0);
  let expected = 54;
  for(let index=0;index<3;index++){
    const entry=6+index*16;
    assert.equal(view.getUint16(entry+4,true),1);
    assert.equal(view.getUint16(entry+6,true),32);
    assert.equal(view.getUint32(entry+12,true),expected);
    const payloadSize=view.getUint32(entry+8,true);
    const payload=new DataView(bytes.buffer,expected,payloadSize);
    assert.equal(payload.getUint32(0,true),40);
    assert.equal(payload.getInt32(8,true),[32,120,512][index]);
    expected+=payloadSize;
  }
  assert.equal(expected,bytes.length);
});
test('DIB maps top-left RGBA to bottom-up BGRA and retains partial alpha', () => {
  const source=frame(16,16); const bytes=encodeDib(source);
  assert.deepEqual([...bytes.slice(40,44)],[73,15,0,0]);
  const topRow=40+15*16*4;
  assert.deepEqual([...bytes.slice(topRow+4,topRow+8)],[73,0,1,128]);
  assert.deepEqual([...bytes.slice(topRow+8,topRow+12)],[73,0,2,255]);
});
test('non-multiple-of-32 widths have a padded AND mask with transparent pixels set', () => {
  const source=frame(30,17); const bytes=encodeDib(source);
  assert.equal(bytes.length,40+30*17*4+4*17);
  const mask=40+30*17*4;
  for(let row=0;row<17;row++){
    assert.equal(bytes[mask+row*4],0x80);
    assert.equal(bytes[mask+row*4+1],0);
    assert.equal(bytes[mask+row*4+2],0);
    assert.equal(bytes[mask+row*4+3],0);
  }
});
test('invalid ICO dimensions and incomplete pixel data fail explicitly', () => {
  assert.throws(() => encodeIco([]));
  assert.throws(() => encodeDib({width:300,height:16,rgba:[]}));
  assert.throws(() => encodeDib({width:16,height:16,rgba:[]}));
});
test('CRC-32 matches the published standard test vector', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')),0xcbf43926);
});
test('ZIP central directory points to intact UTF-8 entries and standard CRC values', () => {
  const files=[{name:'图标.ico',bytes:new Uint8Array([0,1,2,3])},{name:'second.png',bytes:new TextEncoder().encode('123456789')}];
  const bytes=encodeZip(files); const view=new DataView(bytes.buffer);
  const end=bytes.length-22;
  assert.equal(view.getUint32(end,true),0x06054b50);
  assert.equal(view.getUint16(end+10,true),2);
  let central=view.getUint32(end+16,true);
  const decoder=new TextDecoder();
  for(const file of files){
    assert.equal(view.getUint32(central,true),0x02014b50);
    const nameLength=view.getUint16(central+28,true);
    assert.equal(decoder.decode(bytes.slice(central+46,central+46+nameLength)),file.name);
    assert.equal(view.getUint16(central+8,true),0x0800);
    const local=view.getUint32(central+42,true);
    assert.equal(view.getUint32(local,true),0x04034b50);
    const localNameLength=view.getUint16(local+26,true);
    const payload=bytes.slice(local+30+localNameLength,local+30+localNameLength+file.bytes.length);
    assert.deepEqual(payload,file.bytes);
    assert.equal(view.getUint32(central+16,true),crc32(payload));
    central+=46+nameLength;
  }
  assert.equal(central,end);
});
test('filenames remove unsafe paths and preserve Chinese names', () => {
  assert.equal(safeBaseName('山间日落.svg'),'山间日落');
  assert.equal(safeBaseName('../icons:test.png'),'.._icons_test');
  assert.equal(safeBaseName('.png'),'icon');
});
