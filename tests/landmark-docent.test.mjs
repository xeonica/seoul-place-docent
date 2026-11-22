import assert from 'node:assert/strict';
import test from 'node:test';
import {landmarkStory} from '../lib/landmark-docent.ts';
import {generatePlaceAnswer} from '../lib/place-answer.ts';
import {buildPlaceDocentTourV2} from '../lib/docent-tour-integration.ts';
import {docentTourInstructions} from '../lib/docent-tour-builder.ts';
import {validateDocentTourV2} from '../lib/docent-tour-schema.ts';

test('a bridge without a road address builds a seven-part tour from research records', async () => {
  const {story, address, research} = landmarkStory('성수대교');
  assert.ok(research.total > 0);
  assert.ok(story.scenes.length > 0);
  assert.equal(address.bdNm, '성수대교');
  assert.ok(story.scenes.every(scene => scene.evidence[0].url));
  const years = story.scenes.map(scene => scene.year ?? 9999);
  assert.deepEqual(years, [...years].sort((a, b) => a - b));
  const packet = await generatePlaceAnswer({address, story, question: '성수대교의 역사를 도슨트로 안내해 주세요.'});
  assert.equal(packet.status, 'ready');
  const tour = buildPlaceDocentTourV2({packet: {...packet, place: {name: '성수대교', records: []}}, placeRecords: [], photos: [], videos: {records: []}, placeEvidenceLinks: {items: []}, regionalHistoryFacts: {records: []}});
  assert.equal(tour.sections.length, 7);
  assert.equal(validateDocentTourV2(tour).valid, true);
  assert.ok(tour.sections.some(section => section.evidenceIds.length > 0));
  const sceneSources = tour.sources.filter(source => source.mediaType === 'scene');
  assert.ok(sceneSources.length > 0);
  assert.ok(sceneSources.every(source => source.sourceUrl && source.institution));
  const instructions = docentTourInstructions(tour);
  assert.match(instructions, /도입부.*1부.*7부/s);
  assert.match(instructions, /검토 전 자료로 해설에 사용할 수 있습니다/);
  assert.doesNotMatch(instructions, /확정 사실로 쓰지 마세요/);
});

test('an unknown name yields no scenes so the address flow can report not found', () => {
  assert.equal(landmarkStory('존재하지않는장소이름xyz').story.scenes.length, 0);
});

test('Kakao keyword search picks the exact Seoul landmark and ignores other cities and nearby facilities', async t => {
  const {searchKakaoPlace} = await import('../lib/kakao-place.ts');
  assert.equal(await searchKakaoPlace('성수대교', {}), null);
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(new URL(String(url)).pathname, '/v2/local/search/keyword.json');
    assert.equal(init.headers.Authorization, 'KakaoAK key');
    return Response.json({documents: [
      {place_name: '성수대교', x: '129.0', y: '35.1', address_name: '부산 해운대구'},
      {place_name: '성수대교 북단 주차장', x: '127.0300', y: '37.5410', address_name: '서울 성동구 성수동1가 1'},
      {place_name: '성수대교', x: '127.0349', y: '37.5375', address_name: '서울 성동구 성수동1가', category_name: '교량', place_url: 'http://place.map.kakao.com/1'},
    ]});
  });
  const place = await searchKakaoPlace('성수대교', {KAKAO_REST_API_KEY: 'key'});
  assert.deepEqual({name: place.name, x: place.x, y: place.y}, {name: '성수대교', x: 127.0349, y: 37.5375});
});

test('Kakao failures fall back to the research catalog instead of throwing', async t => {
  const {searchKakaoPlace} = await import('../lib/kakao-place.ts');
  t.mock.method(globalThis, 'fetch', async () => new Response(null, {status: 429}));
  assert.equal(await searchKakaoPlace('성수대교', {KAKAO_REST_API_KEY: 'key'}), null);
});

test('a resolved legal dong adds neighborhood scenes after the landmark records', () => {
  const location = {x: 127.0349, y: 37.5375, precision: 'dong', administrativeDong: '', address: {roadAddr: '', jibunAddr: '서울특별시 성동구 성수동1가', siNm: '서울특별시', sggNm: '성동구', emdNm: '성수동1가', admCd: '1120011400', bdMgtSn: '', bdNm: '', lnbrMnnm: '', lnbrSlno: '', mtYn: '0', zipNo: ''}};
  const result = landmarkStory('성수대교', location);
  assert.equal(result.story.district, '성동구');
  assert.equal(result.story.dong, '성수동1가');
  assert.equal(result.address.bdNm, '성수대교');
  assert.ok(result.neighborhoodSceneCount > 0);
  assert.ok(result.story.scenes.slice(0, result.landmarkSceneCount).every(scene => scene.title.includes('성수대교') || scene.evidence[0].note.startsWith('조사자료')));
  assert.equal(new Set(result.story.scenes.map(scene => scene.id)).size, result.story.scenes.length);
});
