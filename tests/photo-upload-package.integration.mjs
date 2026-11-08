import test from 'node:test';
import assert from 'node:assert/strict';
import app from '../.mcp-public/api/public-mcp.mjs';
import {gpsJpeg} from './fixtures/photo-gps.mjs';
const photo=Buffer.concat([Buffer.from(gpsJpeg()),Buffer.from([255,217])]);
test('public package exposes raw uploads directly and through both Vercel rewrites',async()=>{
 const saved=process.env.KAKAO_REST_API_KEY;delete process.env.KAKAO_REST_API_KEY;
 try{
  for(const path of ['/api/photo-location','/api/public-mcp?__route=photo-location','/mcp?__route=photo-location']){
   const request=new Request('https://package.test'+path,{method:'POST',headers:{'content-type':'image/jpeg','x-photo-consent':'ephemeral-exif'},body:photo});
   const response=await app.fetch(request);assert.equal(response.status,503,path);assert.equal((await response.json()).error.code,'MAP_KEY_MISSING');
  }
 }finally{if(saved===undefined)delete process.env.KAKAO_REST_API_KEY;else process.env.KAKAO_REST_API_KEY=saved;}
 assert.equal((await app.fetch(new Request('https://package.test/api/photo-location'))).status,405);
});
