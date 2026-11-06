import test from 'node:test';
import assert from 'node:assert/strict';
import {GET} from '../app/api/archive/video-research/route.ts';
import data from '../data/district-video-research.json';
import legacy from '../data/consolidated-video-research.json';
import pdf from '../data/uploaded-city-history-report-2026-10-20.json';

const search = async params => {
  const url = new URL('https://example.test/api/archive/video-research');
  url.search = new URLSearchParams({catalogue: '1', ...params});
  return GET(new Request(url)).json();
};

test('the imported catalogue preserves source rows and attaches six matches to the existing reports', async () => {
  assert.ok(data.records.length >= 3742);
  assert.equal(new Set(data.records.map(r => r.id)).size, data.records.length);
  assert.equal(new Set(data.records.filter(r => r.district !== '서울 전체').map(r => r.district)).size, 25);
  assert.ok(data.records.every(r => r.sourceId && r.file && r.sheet && r.row > 0 && !r.independentlyVerified));
  assert.equal(pdf.items.length, 215);
  assert.ok(data.references.length >= 2);
  const {catalogue} = await search({});
  assert.ok(catalogue.identified >= 3564);
  const matches = legacy.items.filter(r => data.records.some(v => v.identity === 'youtube:' + r.videoId));
  assert.ok(matches.length >= 6);
  for (const item of matches) {
    const response = await search({group: item.group, q: item.id});
    assert.equal(response.total, 1);
    assert.deepEqual(response.items[0].report, item);
    assert.ok(response.items[0].research.length);
  }
});

test('Samseon records rank before district fallback without asserting a building match', async () => {
  const response = await search({place: '1', district: '성북구', dong: '삼선동1가', administrativeDong: '삼선동'});
  assert.ok(response.items[0].research.some(r => r.broadCandidates?.includes('삼선동')));
  assert.equal(response.items[0].scope, '동네 지명 언급 후보');
  const other = await search({place: '1', district: '성북구', dong: '없는동'});
  assert.equal(other.items[0].scope, '같은 자치구 배경 자료');
});

test('archive filters, candidate separation, and pagination share one catalogue', async () => {
  const filters = {group: 'excel', district: '성북구', administrativeDong: '삼선동', q: '성북천'};
  const filtered = await search(filters);
  assert.ok(filtered.total > 0);
  assert.ok(filtered.items.every(v => v.research.some(r => r.district === '성북구')));
  const first = await search({status: 'candidate'});
  const second = await search({status: 'candidate', page: '2'});
  assert.equal(first.items.length, 12);
  assert.ok(first.items.every(v => !v.identity && !v.report));
  assert.ok(second.items.every(v => !first.items.some(p => p.id === v.id)));
  assert.equal((await search({district: '성북구', dong: '세곡동'})).total, 0);
});

test('publisher chapter notes remain evidence without becoming confirmed scene times', () => {
  const record = data.records.find(r => r.segmentNotes?.some(note => note.includes('화양동 느티나무')));
  assert.ok(record);
  assert.ok(record.segmentNotes.some(note => note.includes('00:21:27')));
  assert.ok((record.segments || []).every(s => s.startSeconds === null));
  assert.equal(record.independentlyVerified, false);
});
