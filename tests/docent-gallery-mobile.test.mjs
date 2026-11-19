import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {galleryResource} from '../lib/docent-gallery.ts';
import {IMAGE_RESOURCE_DOMAINS, imageProxyOrigin} from '../lib/image-proxy.ts';
const source=readFileSync(new URL('../lib/docent-gallery.ts',import.meta.url),'utf8');
test('gallery permits the photo hosts returned by Seoul archives and Seoul research',()=>{
  const {resourceDomains}=galleryResource._meta.ui.csp;
  assert.deepEqual(resourceDomains,[...IMAGE_RESOURCE_DOMAINS,imageProxyOrigin()]);
  assert.ok(resourceDomains.includes('https://archives-files.seoul.go.kr'));
  assert.ok(resourceDomains.includes('https://data.si.re.kr'));
});
test('failed images have a visible source-link fallback rather than silently disappearing',()=>{
  assert.match(source,/image\.onerror/);
  assert.match(source,/role','status/);
  assert.match(source,/사진을 불러오지 못했습니다/);
  assert.match(source,/사진 원문 보기/);
});
