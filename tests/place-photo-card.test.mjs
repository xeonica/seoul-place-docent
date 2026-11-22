import assert from 'node:assert/strict';
import test from 'node:test';
import {showPlacePhotos, showPlacePhotosTool, SHOW_PLACE_PHOTOS} from '../lib/place-photo-card.ts';

const museum = 'https://museum.seoul.go.kr:8088/component/archv/data/ND_thumbnail.tmb?fileSn=300&fileId=H-1&w=800&h=800';
const proxied = `https://seoul-place-docent-mcp.vercel.app/img?u=${encodeURIComponent(museum)}`;
const source = 'https://museum.seoul.go.kr/archive/archiveNew/NR_archiveView.do?fileId=H-1';
const photo = over => ({imageUrl: proxied, title: '경성 조선식산은행', sourceUrl: source, date: '1921', credit: '서울역사박물관', ...over});

test('tool is named and schema caps photos at three', () => {
  assert.equal(showPlacePhotosTool.name, SHOW_PLACE_PHOTOS);
  assert.equal(showPlacePhotosTool.inputSchema.properties.photos.maxItems, 3);
});

test('proxy and direct archive URLs are both accepted and re-emitted through the proxy', () => {
  const result = showPlacePhotos({photos: [photo(), photo({imageUrl: museum, title: '직접 주소'})]});
  const {photos, rejected} = result.structuredContent;
  assert.equal(rejected, 0);
  assert.equal(photos.length, 2);
  for (const p of photos) {
    assert.equal(p.imageUrl, proxied);
    assert.deepEqual(p.alternateUrls, [museum]);
  }
  assert.match(result.content[0].text, /사진 2장/);
});

test('images from other hosts, proxy smuggling and non-https links are dropped', () => {
  const smuggled = `https://seoul-place-docent-mcp.vercel.app/img?u=${encodeURIComponent('https://evil.example/x.jpg')}`;
  const result = showPlacePhotos({photos: [
    photo({imageUrl: 'https://evil.example/x.jpg', title: '외부'}),
    photo({imageUrl: smuggled, title: '프록시 우회'}),
    photo({sourceUrl: 'javascript:alert(1)', title: '스크립트 링크'}),
  ]});
  assert.equal(result.structuredContent.photos.length, 0);
  assert.equal(result.structuredContent.rejected, 3);
  assert.match(result.content[0].text, /외부, 프록시 우회, 스크립트 링크/);
});

test('input is validated strictly', () => {
  assert.throws(() => showPlacePhotos({photos: []}));
  assert.throws(() => showPlacePhotos({photos: [photo(), photo(), photo(), photo()]}));
  assert.throws(() => showPlacePhotos({photos: [photo({extra: 1})]}));
});
