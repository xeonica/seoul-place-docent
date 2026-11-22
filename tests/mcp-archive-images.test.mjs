import assert from 'node:assert/strict';
import test from 'node:test';
import {archiveImageBlocks, MAX_INLINE_IMAGES} from '../lib/mcp-archive-images.ts';

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
