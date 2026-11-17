import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {normalizeVideoCandidate, searchAddressHistory} from '../lib/history-search.ts';
import {clearDistrictResearchIndexCacheForTests} from '../lib/district-history-index.ts';
import {GET as getDocumentResearch} from '../app/api/archive/document-research/route.ts';
import {GET as getPhotoResearch} from '../app/api/archive/photo-research/route.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  const match = url.pathname.match(/\/shards\/(articles|photos)\/([^/]+)\.json\.gz$/);
  if (!match) return originalFetch(input, init);
  const filename = path.join(root, 'public/research/seoul-district-collection/shards', match[1], `${decodeURIComponent(match[2])}.json.gz`);
  try { return new Response(await readFile(filename), {headers: {'Content-Type': 'application/gzip'}}); }
  catch { return new Response(null, {status: 404}); }
};

function address({district, dong, road, name = '', buildingId = ''}) {
  return {roadAddr: road, jibunAddr: '', siNm: '서울특별시', sggNm: district, emdNm: dong, admCd: '1120010100', bdMgtSn: buildingId, bdNm: name, lnbrMnnm: '16', lnbrSlno: '0', mtYn: '0', zipNo: ''};
}

test('actual district shards return bounded article/photo candidates for the five requested locations', async () => {
  clearDistrictResearchIndexCacheForTests();
  const places = [
    address({district: '성동구', dong: '마장동', road: '서울특별시 성동구 마장로42길 16'}),
    address({district: '성동구', dong: '성수동2가', road: '서울특별시 성동구 성수이로 101-3'}),
    address({district: '성북구', dong: '삼선동2가', road: '서울특별시 성북구 삼선교로16길 116', name: '한성대학교'}),
    address({district: '용산구', dong: '한강로동', road: '서울특별시 용산구 한강대로 405', name: '서울역'}),
    address({district: '종로구', dong: '종로1·2·3·4가동', road: '서울특별시 종로구 청계천로 1', name: '청계천'}),
  ];
  const results = await Promise.all(places.map((place) => searchAddressHistory({baseUrl: 'https://example.test', address: place, question: place.bdNm || place.emdNm})));
  assert.equal(results.length, 5);
  for (const result of results) {
    assert.ok(result.counts.articleRegisteredInDistrict > 0);
    assert.ok(result.counts.photoRegisteredInDistrict > 0);
    assert.ok(result.articles.length <= result.counts.pageSize);
    assert.ok(result.photos.length <= result.counts.pageSize);
    assert.ok([...result.articles, ...result.photos].every((candidate) => candidate.citationEligible === false));
    assert.ok([...result.articles, ...result.photos].every((candidate) => ['C', 'D', 'U'].includes(candidate.locationRelation.code)));
  }
  assert.ok(results.every((result) => result.counts.indexes.includes('district-articles') && result.counts.indexes.includes('district-photos')));
  assert.ok(results.every((result) => result.articles.every((candidate) => candidate.sourceInstitution !== undefined && candidate.sourceUrl !== undefined)));
});

test('same explicit legal-dong text remains a candidate and never becomes a verified citation', async () => {
  const addressRow = address({district: '성동구', dong: '성수동1가', road: '서울특별시 성동구 성수이로'});
  const result = await searchAddressHistory({baseUrl: 'https://example.test', address: addressRow, question: '성수동1가'});
  assert.ok(result.articles.length || result.photos.length);
  assert.ok([...result.articles, ...result.photos].every((item) => item.verificationStatus.startsWith('후보')));
  assert.ok([...result.articles, ...result.photos].every((item) => item.locationRelation.code !== 'A' && item.locationRelation.code !== 'B'));
});

test('the existing video catalog maps to the shared candidate shape without asserting place facts', () => {
  const video = normalizeVideoCandidate({id: 'VID-1', title: '기록 영상', url: 'https://video.example/watch?v=1', provider: '기록기관', historicalPeriods: ['1960년대'], relation: 'legal_dong_candidate', independentlyVerified: false, date: '1965', dateType: '제작연도', sources: [{id: 'SRC-1', url: 'https://archive.example/1', rights: '원문 확인 필요'}]}, address({district: '성동구', dong: '성수동1가', road: '성수이로'}));
  assert.equal(video.mediaType, 'video');
  assert.equal(video.locationRelation.code, 'C');
  assert.equal(video.citationEligible, false);
  assert.match(video.verificationStatus, /후보/);
});

test('the archive article and photo APIs read the same district shards used by MCP', async () => {
  clearDistrictResearchIndexCacheForTests();
  const articles = await getDocumentResearch(new Request('https://example.test/api/archive/document-research?table=articles&district=%EC%84%B1%EB%8F%99%EA%B5%AC&page=1'));
  const articleData = await articles.json();
  assert.equal(articles.status, 200);
  assert.equal(articleData.rows.length, 20);
  assert.ok(articleData.total > 0);
  assert.ok(articleData.rows.every((row) => row.district === '성동구'));

  const photos = await getPhotoResearch(new Request('https://example.test/api/archive/photo-research?district=%EC%84%B1%EB%8F%99%EA%B5%AC&page=1'));
  const photoData = await photos.json();
  assert.equal(photos.status, 200);
  assert.equal(photoData.rows.length, 20);
  assert.ok(photoData.total > 0);
  assert.ok(photoData.rows.every((row) => row.district === '성동구'));
});

test('all 50 compressed district shards match their manifest and preserve 50,745 source rows', async () => {
  const manifest = JSON.parse(await readFile(path.join(root, 'public/research/seoul-district-collection/shards/manifest.json'), 'utf8'));
  assert.equal(manifest.districts.length, 25);
  assert.equal(manifest.articleCount, 25535);
  assert.equal(manifest.photoCount, 25210);
  let articleRows = 0;
  let photoRows = 0;
  for (const district of manifest.districts) {
    for (const [kind, expected, key] of [['articles', district.articles, 'rows'], ['photos', district.photos, 'items']]) {
      const bytes = await readFile(path.join(root, 'public/research/seoul-district-collection/shards', kind, `${district.slug}.json.gz`));
      assert.equal(bytes.length, expected.bytes);
      assert.equal(createHash('sha256').update(bytes).digest('hex'), expected.sha256);
      const data = JSON.parse(gunzipSync(bytes).toString('utf8'));
      assert.equal(data[key].length, expected.count);
      assert.ok(data[key].every((row) => row.district === district.name));
      if (kind === 'articles') articleRows += data[key].length;
      else photoRows += data[key].length;
    }
  }
  assert.equal(articleRows + photoRows, 50745);
});
