import test from 'node:test';
import assert from 'node:assert/strict';
import {createPhotoLocationHandler,MAX_PHOTO_UPLOAD_BYTES} from '../lib/photo-upload.ts';
import {gpsJpeg as rawGpsJpeg} from './fixtures/photo-gps.mjs';
const gpsJpeg=(options)=>Buffer.concat([Buffer.from(rawGpsJpeg(options)),Buffer.from([255,217])]);
const url='https://docent.test/api/photo-location';
const request=(body=gpsJpeg(),extra={})=>new Request(url,{method:'POST',headers:{'content-type':'image/jpeg','x-photo-consent':'ephemeral-exif',...extra},body});
const secrets={JUSO_API_KEY:'fixture',KAKAO_REST_API_KEY:'fixture'};
test('original JPEG bytes -> EXIF GPS -> existing address APIs, without image/model requests',async()=>{
 const handler=createPhotoLocationHandler(),saved=globalThis.fetch,calls=[];
 const address={roadAddr:'서울특별시 성동구 마장로42길 16',jibunAddr:'서울특별시 성동구 마장동 784',siNm:'서울특별시',sggNm:'성동구',emdNm:'마장동',admCd:'1120010500',bdMgtSn:'fixture',bdNm:'세림아파트',lnbrMnnm:'784',lnbrSlno:'0',mtYn:'0',zipNo:'04757'};
 globalThis.fetch=async(input,init)=>{const u=new URL(String(input));calls.push(u.hostname);assert.equal(init?.body,undefined,'no original photo sent upstream');
  if(u.hostname==='business.juso.go.kr')return Response.json({results:{common:{errorCode:'0',totalCount:'1'},juso:[address]}});
  assert.equal(u.hostname,'dapi.kakao.com','model and arbitrary URL requests forbidden');assert.ok(Math.abs(+u.searchParams.get('x')-(126+58/60))<1e-9);assert.ok(Math.abs(+u.searchParams.get('y')-(37+34/60))<1e-9);
  return Response.json({documents:u.pathname.includes('coord2address')?[{address:{address_name:address.jibunAddr,region_1depth_name:'서울',region_2depth_name:'성동구',region_3depth_name:'마장동',main_address_no:'784',sub_address_no:'0',mountain_yn:'N'},road_address:{address_name:address.roadAddr}}]:[{region_type:'B',code:address.admCd,address_name:'서울 성동구 마장동',region_1depth_name:'서울',region_2depth_name:'성동구',region_3depth_name:'마장동'}]});
 };
 try{const response=await handler(request(),secrets);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');const body=await response.json();assert.equal(body.inspection.status,'ok');assert.equal(body.status,'confirm_address');assert.equal(body.needsConfirmation,true);assert.equal(body.retention,'not_stored');assert.equal(body.result.candidates.length,1);assert.equal(calls.length,3);assert.equal('image' in body,false);}
 finally{globalThis.fetch=saved;}
});
test('consent, media type, actual format, missing GPS, empty, size and origin checks',async()=>{
 const handler=createPhotoLocationHandler();
 assert.equal((await handler(request(gpsJpeg(),{'x-photo-consent':''}),{})).status,400);
 assert.equal((await handler(request(gpsJpeg(),{'content-type':'application/json'}),{})).status,415);
 assert.equal((await handler(request(gpsJpeg(),{origin:'https://evil.test'}),{})).status,403);
 assert.equal((await handler(request(new Uint8Array([255,216,255,217])),{})).status,422);
 assert.equal((await handler(request(new Uint8Array()),{})).status,400);
 assert.equal((await handler(request(new Uint8Array([1]),{'content-length':String(MAX_PHOTO_UPLOAD_BYTES+1)}),{})).status,413);
 assert.equal((await handler(request(new Uint8Array(MAX_PHOTO_UPLOAD_BYTES+1)),{})).status,413);
 const wrong=await handler(request(new TextEncoder().encode('not an image')),{});assert.equal(wrong.status,422);assert.equal((await wrong.json()).inspection.status,'unsupported_format');
 assert.equal((await handler(new Request(url),{})).status,405);
});
test('outside Seoul and missing provider keys do not fabricate addresses',async()=>{
 const handler=createPhotoLocationHandler();const outside=await handler(request(gpsJpeg({ns:'S'})),secrets);assert.equal(outside.status,400);
 const missing=await handler(request(),{});assert.equal(missing.status,503);assert.equal((await missing.json()).error.code,'MAP_KEY_MISSING');
});
test('streamed size limits work without Content-Length and cancel the input',async()=>{
 let canceled=false;const body=new ReadableStream({start(c){c.enqueue(new Uint8Array(MAX_PHOTO_UPLOAD_BYTES));c.enqueue(new Uint8Array([1]));},cancel(){canceled=true;}});
 const r=new Request(url,{method:'POST',headers:{'content-type':'image/jpeg','x-photo-consent':'ephemeral-exif'},body,duplex:'half'});
 assert.equal((await createPhotoLocationHandler()(r,{})).status,413);assert.equal(canceled,true);
});
test('instance-wide upload quota limits parsing work',async()=>{
 const handler=createPhotoLocationHandler();for(let i=0;i<12;i++)assert.equal((await handler(request(new Uint8Array()),{})).status,400);
 const r=await handler(request(),{});assert.equal(r.status,429);assert.equal(r.headers.get('retry-after'),'60');
});
