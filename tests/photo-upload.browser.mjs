import {createRequire} from 'node:module';
import {gpsJpeg} from './fixtures/photo-gps.mjs';
const require=createRequire(import.meta.url),{chromium}=require('playwright'),assert=require('node:assert/strict');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});let uploads=0,mapCalls=0;
 const address={roadAddr:'서울특별시 성동구 마장로42길 16',jibunAddr:'서울특별시 성동구 마장동 784',sggNm:'성동구',emdNm:'마장동',bdMgtSn:'fixture'};
 const photo=Buffer.concat([Buffer.from(gpsJpeg()),Buffer.from([255,217])]);
 await page.route('**/api/photo-location',async route=>{uploads++;const r=route.request();assert.equal(r.headers()['x-photo-consent'],'ephemeral-exif');assert.deepEqual(r.postDataBuffer(),photo);await route.fulfill({json:{inspection:{status:'ok',point:{x:126.97,y:37.57}},result:{location:{x:126.97,y:37.57,address,precision:'parcel'},candidates:[{...address,token:'fixture'}],message:'fixture'}}});});
 await page.route('**/api/map-address?**',async route=>{mapCalls++;await route.fulfill({status:503,json:{error:{message:'fixture map unavailable'}}});});
 await page.goto(process.env.PHOTO_TEST_URL||'http://127.0.0.1:3012/',{waitUntil:'networkidle'});
 const consent=page.getByRole('checkbox',{name:/서버 분석 사용/});assert.equal(await consent.isChecked(),false);
 await consent.check();await page.locator('input[type=file]').setInputFiles({name:'original.jpg',mimeType:'image/jpeg',buffer:photo});
 await page.locator('.candidate-panel .candidate').waitFor();assert.equal(uploads,1);assert.equal(mapCalls,0,'reuse server address result, no duplicate geocoding');
 console.log('PASS: mobile consent defaults off; original bytes upload; address choice; no duplicate geocoding');
}finally{await browser.close();}
