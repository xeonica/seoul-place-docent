import test from 'node:test';
import assert from 'node:assert/strict';
import {getRegionalHistoricalPhotoPreviews,getMaJangHistoricalPhotoHighlights} from '../lib/docent-data.ts';

test('regional photo previews search the indexed dong and preserve source, rights and context',()=>{
 const photos=getRegionalHistoricalPhotoPreviews('성동구','마장동');
 assert.ok(photos.length>0&&photos.length<=8);
 assert.ok(photos.some(p=>p.sourceRecordId==='H-TRNS-49281-379'));
 for(const photo of photos){
  assert.equal(photo.scope,'dong');
  assert.equal(photo.relationType,'dong_context');
  assert.equal(photo.formalEvidenceApproval,'unchanged');
  assert.equal(photo.previewPurpose,'illustration_only');
  assert.ok(photo.imageUrl.startsWith('https://'));
  assert.ok(photo.alternateUrls[0].startsWith('https://'));
  assert.ok(photo.sourceUrl.startsWith('https://'));
  assert.match(photo.terms,/공공누리|제한없음|public domain/i);
  assert.match(photo.relationNote,/직접 사진이나 승인된 직접 역사 근거는 아닙니다/);
 }
});

test('regional photo selection is dynamic across districts and dongs, with district fallback clearly labeled',()=>{
 const seongbuk=getRegionalHistoricalPhotoPreviews('성북구','삼선동3가');
 const gangnam=getRegionalHistoricalPhotoPreviews('강남구','논현동');
 assert.ok(seongbuk.length>0&&gangnam.length>0);
 assert.ok(seongbuk.every(p=>p.scope==='dong'));
 assert.ok(gangnam.every(p=>p.scope==='dong'));
 const administrative=getRegionalHistoricalPhotoPreviews('관악구','행운동');
 assert.ok(administrative.length>0);
 assert.ok(administrative.every(p=>p.scope==='dong'&&/행정동 관할 법정동/.test(p.relationNote)));
 const fallback=getRegionalHistoricalPhotoPreviews('성동구','없는동');
 assert.ok(fallback.length>0);
 assert.ok(fallback.every(p=>p.scope==='district'&&p.relationType==='district_context'));
 assert.ok(fallback.every(p=>/성동구 배경 참고 사진/.test(p.relationNote)));
});

test('legacy MaJang export now delegates to the common regional search',()=>{
 assert.deepEqual(getMaJangHistoricalPhotoHighlights('성동구','마장동'),getRegionalHistoricalPhotoPreviews('성동구','마장동'));
 assert.deepEqual(getRegionalHistoricalPhotoPreviews('성동구','마장동',100).length,8);
});
