import test from 'node:test';
import assert from 'node:assert/strict';
import {permittedArchiveImage,imageDeliveryUrl} from '../lib/archive-image-delivery.ts';
test('allow only narrow Seoul archive photo paths',()=>{
 const url='https://data.si.re.kr/sites/default/files/photos/02M83024Ba2SI9.jpg';
 assert.equal(permittedArchiveImage(url)?.href,url);
 for(const bad of ['http://data.si.re.kr/sites/default/files/photos/x.jpg','https://evil.example/x.jpg','https://data.si.re.kr.evil.example/sites/default/files/photos/x.jpg','https://data.si.re.kr:8443/sites/default/files/photos/x.jpg','https://data.si.re.kr/sites/default/files/photos/../private.jpg','https://data.si.re.kr/sites/default/files/photos/x.jpg?redirect=evil','https://data.si.re.kr@evil.example/sites/default/files/photos/x.jpg'])assert.equal(permittedArchiveImage(bad),null,bad);
});
test('proxy path only for explicit reusable license',()=>{
 const url='https://data.si.re.kr/sites/default/files/photos/02M83024Ba2SI9.jpg';
 assert.ok(imageDeliveryUrl(url,'CC BY 4.0')?.startsWith('/api/archive-image?url='));
 assert.equal(imageDeliveryUrl(url,'rights unknown'),null);
});
