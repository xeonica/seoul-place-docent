import test from 'node:test';
import assert from 'node:assert/strict';
import {getMaJangHistoricalPhotoHighlights} from '../lib/docent-data.ts';

test('MaJang photo cards bind the four requested IDs to the exact Seoul Museum source and image',()=>{
 const photos=getMaJangHistoricalPhotoHighlights('성동구','마장동');
 assert.deepEqual(photos.map(p=>p.evidenceId),['seoul-museum-1178','seoul-museum-1183','SEOUL-GU-016-DONG-006-B001-P001','seoul-museum-1188']);
 const files=['H-TRNS-54699-373','H-TRNS-49281-379','H-TRNS-54700-373','H-TRNS-80335-373'];
 for(const [index,photo] of photos.entries()){
  const original=new URL(photo.alternateUrls[0]);
  assert.equal(original.searchParams.get('fileId'),files[index]);
  assert.equal(new URL(photo.sourceUrl).searchParams.get('fileId'),files[index]);
  assert.match(photo.imageUrl,/^https:\/\/seoul-place-docent-mcp\.vercel\.app\/img\?u=/);
  assert.match(photo.terms,/공공누리 제1유형/);
  assert.equal(photo.credit,'서울역사박물관 · 서울생활문화자료조사');
  assert.equal(photo.verificationStatus,'source_metadata_only');
  assert.equal(photo.formalEvidenceApproval,'unchanged');
 }
 assert.match(photos[0].relationNote,/종로구 숭인동/);
 assert.match(photos[1].relationNote,/마장동/);
 assert.match(photos[2].relationNote,/마장동/);
 assert.match(photos[3].relationNote,/서울시 축산물 공급망/);
 assert.deepEqual(getMaJangHistoricalPhotoHighlights('성동구','성수동'),[]);
});
