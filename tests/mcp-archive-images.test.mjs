import assert from 'node:assert/strict';
import test from 'node:test';
import {archiveImageBlocks, MAX_INLINE_IMAGES, stripJpegMetadata} from '../lib/mcp-archive-images.ts';

const jpeg = size => {const b = new Uint8Array(size); b.set([255, 216, 255, 224]); return b;};
const png = () => new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const photo = i => ({imageUrl: `https://seoul-place-docent-mcp.vercel.app/img?u=${encodeURIComponent(`https://archives-files.seoul.go.kr/p${i}.jpg`)}`, title: `사진${i}`, date: '1970', evidenceId: `e${i}`});
const sizeOf = url => Number(new URL(url).pathname.match(/p(\d+)/)[1]);

test('every photo up to eight is sent inline with a caption before it', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response(jpeg(1000), {headers: {'Content-Type': 'image/jpeg'}}));
  const blocks = await archiveImageBlocks(Array.from({length: 10}, (_, i) => photo(i)));
  assert.equal(MAX_INLINE_IMAGES, 8);
  assert.equal(blocks.filter(b => b.type === 'image').length, 8);
  assert.deepEqual(blocks.slice(0, 2).map(b => b.type), ['text', 'image']);
  assert.match(blocks[0].text, /^사진 1: 1970 · 사진0 \(evidenceId: e0\)$/);
});

test('PNG previews are kept with their real type and mislabeled or broken bytes are skipped', async t => {
  let n = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    n += 1;
    if (n === 1) return new Response(png(), {headers: {'Content-Type': 'image/png'}});
    return new Response(new TextEncoder().encode('<html>'), {headers: {'Content-Type': 'image/jpeg'}});
  });
  const blocks = await archiveImageBlocks([photo(0), photo(1)]);
  const images = blocks.filter(b => b.type === 'image');
  assert.equal(images.length, 1);
  assert.equal(images[0].mimeType, 'image/png');
});

test('oversized images and anything past the total budget are left as links', async t => {
  // p0..p7 sized by index: index 0 is over the per-image cap, the rest are 290 KiB each.
  t.mock.method(globalThis, 'fetch', async url => {
    const i = sizeOf(String(url));
    return new Response(jpeg(i === 0 ? 400 * 1024 : 290 * 1024), {headers: {'Content-Type': 'image/jpeg'}});
  });
  const blocks = await archiveImageBlocks(Array.from({length: 8}, (_, i) => photo(i)));
  const images = blocks.filter(b => b.type === 'image');
  // 1.5 MiB budget fits five 290 KiB images.
  assert.equal(images.length, 5);
  assert.match(blocks[0].text, /사진1/);
});

// SOI, APP0, a large APP2 (ICC profile), APP14 (Adobe), DQT, SOS + scan data, EOI.
const segment = (marker, payloadLength) => {
  const b = new Uint8Array(4 + payloadLength);
  b.set([0xff, marker, (payloadLength + 2) >> 8, (payloadLength + 2) & 0xff]);
  return b;
};
const concat = parts => {const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) {out.set(p, o); o += p.length;} return out;};
const iccHeavyJpeg = () => concat([
  new Uint8Array([0xff, 0xd8]), segment(0xe0, 14),
  ...Array.from({length: 7}, () => segment(0xe2, 65533)), segment(0xee, 12), segment(0xdb, 65),
  segment(0xda, 10), new Uint8Array(50 * 1024).fill(0x11), new Uint8Array([0xff, 0xd9]),
]);

test('JPEG metadata stripping keeps JFIF, Adobe and image segments', () => {
  const input = iccHeavyJpeg();
  const out = stripJpegMetadata(input);
  assert.ok(input.length > 400 * 1024);
  assert.ok(out.length < 60 * 1024);
  const markers = [];
  for (let i = 2; out[i + 1] !== 0xda; i += 2 + ((out[i + 2] << 8) | out[i + 3])) markers.push(out[i + 1]);
  assert.deepEqual(markers, [0xe0, 0xee, 0xdb]);
  assert.deepEqual([...out.subarray(-2)], [0xff, 0xd9]);
});

test('malformed JPEGs are returned unchanged by the stripper', () => {
  const broken = new Uint8Array([0xff, 0xd8, 0xff, 0xe2, 0xff, 0xff, 1, 2]);
  assert.equal(stripJpegMetadata(broken), broken);
});

test('an ICC-heavy JPEG over the cap is sent inline after stripping', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response(iccHeavyJpeg(), {headers: {'Content-Type': 'image/jpeg'}}));
  const blocks = await archiveImageBlocks([photo(0)]);
  const images = blocks.filter(b => b.type === 'image');
  assert.equal(images.length, 1);
  assert.ok(Buffer.from(images[0].data, 'base64').length < 60 * 1024);
});
