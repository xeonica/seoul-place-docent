import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../lib/docent-gallery.ts',import.meta.url),'utf8');
test('gallery permits the photo hosts returned by Seoul archives and Seoul research',()=>{
  assert.match(source,/https:\/\/archives-files\.seoul\.go\.kr/);
  assert.match(source,/https:\/\/data\.si\.re\.kr/);
});
test('failed images have a visible source-link fallback rather than silently disappearing',()=>{
  assert.match(source,/image\.onerror/);
  assert.match(source,/role','status/);
  assert.match(source,/사진을 불러오지 못했습니다/);
  assert.match(source,/사진 원문 보기/);
});
