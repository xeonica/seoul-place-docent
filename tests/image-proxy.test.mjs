import assert from 'node:assert/strict';
import test from 'node:test';
import {IMAGE_RESOURCE_DOMAINS, isAllowedImageUrl, toProxyUrl} from '../lib/image-proxy.ts';
import {handleImageProxy} from '../lib/image-proxy-handler.ts';
import {guidePhotos, presentGuidePhoto, preparePlaceAnswer} from '../lib/place-answer.ts';

const origin = 'https://seoul-place-docent-mcp.vercel.app';
const original = 'https://museum.seoul.go.kr:8088/component/archv/data/ND_thumbnail.tmb?fileSn=300&fileId=H-1&w=800&h=800';
const proxy = toProxyUrl(origin, original);

test('only HTTPS image origins on the shared allowlist are accepted', () => {
  for (const domain of IMAGE_RESOURCE_DOMAINS) assert.equal(isAllowedImageUrl(domain + '/photo'), true);
  for (const url of [
    'http://museum.seoul.go.kr:8088/', 'https://example.com/', 'https://localhost/',
    'https://127.0.0.1/', 'https://museum.seoul.go.kr@evil.com/',
    'https://someone@museum.seoul.go.kr/', 'https://museum.seoul.go.kr:444/',
    'https://archives.seoul.go.kr:8088/', 'https://museum.seoul.go.kr.evil.com/', 'invalid',
  ]) assert.equal(isAllowedImageUrl(url), false, url);
});

test('proxy URL preserves all original query parameters', () => {
  assert.match(proxy, /fileSn%3D300%26fileId%3DH-1/);
  assert.deepEqual([...new URL(proxy).searchParams], [['u', original]]);
});

test('proxy enforces method, origin, redirect, content type and size limits', async t => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => new Response());
  assert.equal((await handleImageProxy(new Request(origin + '/img?u=https://localhost/'))).status, 400);
  assert.equal((await handleImageProxy(new Request(proxy, {method: 'POST'}))).status, 405);
  const options = await handleImageProxy(new Request(proxy, {method: 'OPTIONS'}));
  assert.equal(options.status, 204);
  assert.equal(options.headers.get('access-control-allow-origin'), '*');
  assert.equal(fetchMock.mock.callCount(), 0);

  const bytes = new Uint8Array(5 * 1024 * 1024 + 1);
  for (const upstream of [
    new Response(null, {status: 302, headers: {Location: 'https://127.0.0.1/'}}),
    new Response('html', {headers: {'Content-Type': 'text/html'}}),
    new Response('small body', {headers: {'Content-Type': 'image/png', 'Content-Length': String(bytes.length)}}),
    new Response(bytes, {headers: {'Content-Type': 'image/png'}}),
  ]) {
    fetchMock.mock.mockImplementationOnce(async () => upstream);
    assert.equal((await handleImageProxy(new Request(proxy))).status, 502);
  }
  assert.equal(fetchMock.mock.callCount(), 4);
  assert.equal(fetchMock.mock.calls[0].arguments[1].redirect, 'manual');
});

test('GET returns the image and caching headers, HEAD returns the same headers', async t => {
  const bytes = new Uint8Array([255, 216, 255]);
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(url, original);
    assert.equal(init.headers.Referer, 'https://museum.seoul.go.kr/');
    assert.match(init.headers['User-Agent'], /^Mozilla/);
    assert.ok(init.signal instanceof AbortSignal);
    return new Response(bytes, {headers: {
      'Content-Type': 'image/jpeg', 'Content-Disposition': 'attachment',
    }});
  });
  const response = await handleImageProxy(new Request(proxy));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/jpeg');
  assert.equal(response.headers.get('content-disposition'), null);
  assert.equal(response.headers.get('cache-control'), 'public, max-age=86400, s-maxage=604800');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('access-control-allow-origin'), '*');
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
  const head = await handleImageProxy(new Request(proxy, {method: 'HEAD'}));
  assert.equal(head.status, 200);
  assert.deepEqual([...head.headers], [...response.headers]);
  assert.equal(head.body, null);
});

test('proxy detects supported image bytes when an official archive omits Content-Type',async t=>{
 const jpeg=new Uint8Array([0xff,0xd8,0xff,0xe0,0x00,0x10]);
 const fetchMock=t.mock.method(globalThis,'fetch',async()=>new Response(jpeg));
 const response=await handleImageProxy(new Request(proxy));
 assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/jpeg');
 assert.deepEqual(new Uint8Array(await response.arrayBuffer()),jpeg);
 fetchMock.mock.mockImplementationOnce(async()=>new Response('<html>not a picture</html>'));
 assert.equal((await handleImageProxy(new Request(proxy))).status,502);
});

test('answer records and guide photos proxy allowlisted images and retain provenance', () => {
  const archiveUrl = 'https://archives-files.seoul.go.kr/photo.jpg';
  const seongbukUrl = 'https://archive-file.sb.go.kr/files/serviceFile/archive/item/2020/05/06/photo';
  const museumUrl = 'https://museum.seoul.go.kr/archive/record';
  const archiveSource = 'https://archives.seoul.go.kr/record';
  const scene = (id, imageUrl, sourceUrl, credit) => ({
    id, title: id, date: '1978', text: id, scope: 'dong', order: 0, evidence: [],
    photos: [{previewUrl: imageUrl, sourceUrl, provider: credit, values: {'이용조건': '공공누리 제1유형'}}],
  });
  const packet = preparePlaceAnswer({
    address: {roadAddr: '서울', bdNm: ''},
    story: {dong: '대조동', scenes: [
      scene('박물관 사진', original, museumUrl, '서울역사박물관'),
      scene('기록원 사진', archiveUrl, archiveSource, '서울기록원'),
      scene('성북 사진', seongbukUrl, 'https://archive.sb.go.kr/item/5158', '성북마을아카이브'),
    ]},
  });
  const photos = guidePhotos(packet);
  for (const photo of [
    packet.neighborhood.records.find(record => record.id === '박물관 사진').source.photo,
    photos.find(photo => photo.evidenceId === '박물관 사진'),
  ]) {
    assert.equal(new URL(photo.imageUrl).searchParams.get('u'), original);
    assert.equal(photo.alternateUrls[0], original);
    assert.equal(photo.credit, '서울역사박물관');
    assert.equal(photo.terms, '공공누리 제1유형');
    assert.equal(photo.sourceUrl, museumUrl);
  }
  const museum = photos.find(photo => photo.evidenceId === '박물관 사진');
  assert.equal(museum.imageMarkdown, `![박물관 사진](<${museum.imageUrl}>)`);
  const presented=presentGuidePhoto(museum,{district:'성동구',dong:'마장동',buildingName:'세림아파트'});
  assert.equal(presented.previewPurpose,'illustration_only');assert.equal(presented.formalEvidenceApproval,'unchanged');
  assert.match(presented.relationNote,/마장동 지역 역사 참고 사진/);assert.match(presented.relationNote,/세림아파트 자체의 사진이.*아닙니다/);
  assert.equal(presented.imageUrl,museum.imageUrl);assert.equal(presented.evidenceId,museum.evidenceId);assert.equal(presented.sourceUrl,museum.sourceUrl);
  const archive = photos.find(photo => photo.evidenceId === '기록원 사진');
  assert.equal(new URL(archive.imageUrl).searchParams.get('u'), archiveUrl);
  assert.deepEqual(archive.alternateUrls, [archiveUrl]);
  assert.equal(archive.imageMarkdown, `![기록원 사진](<${archive.imageUrl}>)`);
  assert.equal(archive.credit, '서울기록원');
  assert.equal(archive.terms, '공공누리 제1유형');
  assert.equal(archive.sourceUrl, archiveSource);
  const seongbuk = photos.find(photo => photo.evidenceId === '성북 사진');
  assert.equal(new URL(seongbuk.imageUrl).searchParams.get('u'), seongbukUrl);
  assert.deepEqual(seongbuk.alternateUrls, [seongbukUrl]);
  assert.equal(seongbuk.sourceUrl, 'https://archive.sb.go.kr/item/5158');
  assert.equal(seongbuk.credit, '성북마을아카이브');
  assert.equal(seongbuk.terms, '공공누리 제1유형');
  const sourceRecord = packet.neighborhood.records.find(record => record.id === '성북 사진').source.photo;
  assert.equal(new URL(sourceRecord.imageUrl).searchParams.get('u'), seongbukUrl);
});
