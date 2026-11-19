import test from 'node:test';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import app from '../.mcp-public/api/public-mcp.mjs';
import {gpsJpeg} from './fixtures/photo-gps.mjs';
const request=(method,params={})=>new Request('https://package.test/mcp',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});
const data=r=>JSON.parse(r.result.content[0].text);
test('deployable package resolves photo coordinates and prepares and validates evidence without a model',async()=>{
 const originalCwd=process.cwd();process.chdir(fileURLToPath(new URL('../.mcp-public/',import.meta.url)));
 const saved={...process.env},original=globalThis.fetch,info=console.info;const calls=[];console.info=()=>{};
 process.env.JUSO_API_KEY='fixture-key';process.env.KAKAO_REST_API_KEY='fixture-map-key';process.env.OPENAI_API_KEY='must-not-be-used';delete process.env.CLOUDFLARE_ACCOUNT_ID;
 const address={roadAddr:'서울특별시 종로구 사직로 161',jibunAddr:'서울특별시 종로구 세종로 1-1',siNm:'서울특별시',sggNm:'종로구',emdNm:'세종로',admCd:'1111011900',bdMgtSn:'fixture',bdNm:'경복궁',lnbrMnnm:'1',lnbrSlno:'1',mtYn:'0',zipNo:'03045'};
 globalThis.fetch=async url=>{
  const request=new URL(String(url));calls.push(request.hostname);
  if(request.hostname==='files.oaiusercontent.com')return new Response(gpsJpeg({lat:[37,34,48],lon:[126,58,12]}));
  if(request.hostname==='business.juso.go.kr')return Response.json({results:{common:{errorCode:'0',totalCount:'1'},juso:[address]}});
  assert.equal(request.hostname,'dapi.kakao.com','only address providers are allowed');
  assert.ok(Math.abs(Number(request.searchParams.get('x'))-126.97)<1e-9);
  assert.ok(Math.abs(Number(request.searchParams.get('y'))-37.58)<1e-9);
  if(request.pathname.endsWith('coord2address.json'))return Response.json({documents:[{address:{
   address_name:address.jibunAddr,region_1depth_name:'서울',region_2depth_name:'종로구',region_3depth_name:'세종로',
   main_address_no:'1',sub_address_no:'1',mountain_yn:'N'
  },road_address:{address_name:address.roadAddr}}]});
  assert.ok(request.pathname.endsWith('coord2regioncode.json'));
  return Response.json({documents:[{region_type:'B',code:address.admCd,address_name:'서울 종로구 세종로',region_1depth_name:'서울',region_2depth_name:'종로구',region_3depth_name:'세종로'}]});
 };
 try{
  assert.equal((await app.fetch(request('initialize',{protocolVersion:'2025-11-25'}))).status,200);
  const call=async(name,args={})=>data(await (await app.fetch(request('tools/call',{name,arguments:args}))).json());
  const list=await (await app.fetch(request('tools/list'))).json();
  const photoTool=list.result.tools.find(t=>t.name==='extract_photo_location');
  assert.deepEqual(photoTool._meta['openai/fileParams'],['file']);
  assert.deepEqual(photoTool.inputSchema.properties.file.required,['download_url','file_id']);
  assert.equal((await call('extract_photo_location')).status,'needs_file');
  const photo=await call('extract_photo_location',{file:{download_url:'https://files.oaiusercontent.com/original',file_id:'synthetic-fixture'}});
  assert.equal(photo.locationSource,'photo_exif');assert.equal(photo.photoStored,false);assert.equal(photo.status,'confirm_address');
  assert.ok(Math.abs(photo.coordinates.latitude-37.58)<1e-9);assert.ok(Math.abs(photo.coordinates.longitude-126.97)<1e-9);
  assert.equal((await call('resolve_photo_location')).status,'needs_location');
  const located=await call('resolve_photo_location',{latitude:37.58,longitude:126.97});
  assert.equal(located.status,'confirm_address');assert.equal(located.needsConfirmation,true);
  assert.equal(located.candidates.length,1);
  const token=located.candidates[0].token,question='동네 역사를 알려줘';
  const packet=await call('prepare_place_answer',{token,question,questionType:'동네 역사'});
  assert.equal(packet.research.status,'research_candidates_only');
  assert.ok(packet.research.total>0);assert.ok(packet.research.records.every(r=>!r.usableAsVerifiedEvidence));
  const research=await call('get_place_history',{query:'세운상가',limit:3});assert.ok(research.total>3);assert.equal(research.records.length,3);
  assert.equal(packet.mode,'client_ai');assert.equal(packet.generation.serverAiCalls,0);
  assert.ok(packet.neighborhood.records.length>0);
  assert.equal(packet.visuals.photoCount,packet.visuals.photos.length);
  assert.ok(packet.visuals.photoCount<=8,'photo gallery must not exceed eight records');
  assert.equal(new Set(packet.visuals.photos.map(p=>p.imageUrl)).size,packet.visuals.photoCount,'photos must be distinct');
  assert.ok(packet.visuals.photos.every(p=>p.imageUrl&&p.evidenceId));
  assert.ok(packet.videos.records.length>0);assert.ok(packet.videos.records.every(r=>r.sources.length>0&&Array.isArray(r.verifiedSegments)));
  assert.ok(packet.videos.records.every(record=>record.segmentStatus!=='unavailable'));
  const record=packet.neighborhood.records[0];
  const validated=await call('validate_place_answer',{token,question,answer:{question_type:'동네 역사',paragraphs:[{heading:'기록',text:'자료가 남아 있어요.',evidence_ids:[record.id]}],held:[]}});
  assert.equal(validated.valid,true);
  assert.deepEqual(calls.sort(),['business.juso.go.kr','business.juso.go.kr','dapi.kakao.com','dapi.kakao.com','dapi.kakao.com','dapi.kakao.com','files.oaiusercontent.com']);
 }finally{process.chdir(originalCwd);globalThis.fetch=original;console.info=info;for(const k of Object.keys(process.env))if(!(k in saved))delete process.env[k];Object.assign(process.env,saved);}
});
