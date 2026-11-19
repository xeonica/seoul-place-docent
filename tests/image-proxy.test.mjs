import {fixturePhoto} from './fixtures/verified-photo.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {IMAGE_RESOURCE_DOMAINS, isAllowedImageUrl, toProxyUrl} from '../lib/image-proxy.ts';
import {handleImageProxy} from '../lib/image-proxy-handler.ts';
import {guidePhotos, preparePlaceAnswer} from '../lib/place-answer.ts';

const origin = 'https://seoul-place-docent-mcp.vercel.app';
const original = 'https://museum.seoul.go.kr:8088/component/archv/data/ND_thumbnail.tmb?fileSn=300&fileId=H-1&w=800&h=800';
const proxy = toProxyUrl(origin, original);
const verifiedProxy=request=>handleImageProxy(request,url=>url===original); // synthetic authorized transport fixture


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
  assert.equal((await verifiedProxy(new Request(origin + '/img?u=https://localhost/'))).status, 400);
  assert.equal((await verifiedProxy(new Request(proxy, {method: 'POST'}))).status, 405);
  const options = await verifiedProxy(new Request(proxy, {method: 'OPTIONS'}));
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
    assert.equal((await verifiedProxy(new Request(proxy))).status, 502);
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
  const response = await verifiedProxy(new Request(proxy));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/jpeg');
  assert.equal(response.headers.get('content-disposition'), null);
  assert.equal(response.headers.get('cache-control'), 'public, max-age=86400, s-maxage=604800');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('access-control-allow-origin'), '*');
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
  const head = await verifiedProxy(new Request(proxy, {method: 'HEAD'}));
  assert.equal(head.status, 200);
  assert.deepEqual([...head.headers], [...response.headers]);
  assert.equal(head.body, null);
});

test('answer records and guide photos proxy museum images and retain provenance', () => {
  const archiveUrl = 'https://archives-files.seoul.go.kr/photo.jpg';
  const museumUrl = 'https://museum.seoul.go.kr/archive/record';
  const archiveSource = 'https://archives.seoul.go.kr/record';
  const scene = (id, imageUrl, sourceUrl, credit) => ({
    id, title: id, date: '1978', text: id, scope: 'dong', order: 0, evidence: [{url:sourceUrl}],
    photos: [{...fixturePhoto(id,imageUrl),sourceUrl,provider:credit,assetProof:{...fixturePhoto(id,imageUrl).assetProof,sourcePageUrl:sourceUrl,provider:credit},values:{'자료명':id,'이용조건':'공공누리 제1유형'}}],
  });
  const packet = preparePlaceAnswer({
    address: {roadAddr: '서울', bdNm: ''},
    story: {dong: '대조동', scenes: [
      scene('박물관 사진', original, museumUrl, '서울역사박물관'),
      scene('기록원 사진', archiveUrl, archiveSource, '서울기록원'),
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
  assert.equal(museum.imageMarkdown, `![모의 기록 박물관 사진](<${museum.imageUrl}>)`);
  const archive = photos.find(photo => photo.evidenceId === '기록원 사진');
  assert.equal(archive.imageUrl, archiveUrl);
  assert.deepEqual(archive.alternateUrls, []);
  assert.equal(archive.imageMarkdown, `![모의 기록 기록원 사진](<${archiveUrl}>)`);
  assert.equal(archive.credit, '서울기록원');
  assert.equal(archive.terms, '공공누리 제1유형');
  assert.equal(archive.sourceUrl, archiveSource);
});
