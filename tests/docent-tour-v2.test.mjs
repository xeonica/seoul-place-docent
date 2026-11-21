import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildDocentTourV2} from '../lib/docent-tour-builder.ts';
import {validateDocentTourV2,TOUR_SECTION_IDS} from '../lib/docent-tour-schema.ts';

const packet=({direct=true,media=true,candidate=true,rich=true}={})=>({address:'서울특별시 성동구 마장로42길 16',district:'성동구',dong:'마장동',question:'마장동 세림아파트와 주변의 변화를 알려주세요.',classification:{questionType:'특정 장소·건물'},place:{name:'마장동 세림아파트',records:[{id:'register:current-1',scope:'building',name:'세림아파트',use:'공동주택',approved:'2012-01-01',dateMeaning:'사용승인일이며 최초 건립일이 아닙니다.'}]},neighborhood:{records:rich?[{id:'scene:name-1',title:'마장동 지명 유래 조사',text:'마장동의 옛 지명과 유래를 조사한 기록입니다.',scope:'dong',source:{url:'https://archive.example/name',institution:'지역기록관'}},{id:'scene:industry-1',title:'마장동 축산시장과 산업 변화',text:'시장과 지역 산업의 변화를 기록했습니다.',scope:'dong',source:{url:'https://archive.example/industry',institution:'지역기록관'}},{id:'scene:urban-1',title:'마장동 주거 공간 사진',text:'주거지와 도로의 변화를 담은 기록입니다.',scope:'dong',source:{url:'https://archive.example/urban',institution:'지역기록관'}}]:[]},evidence:{records:direct?[{evidenceId:'evidence:building',title:'세림아파트 필지 검토',sourceUrl:'https://archive.example/direct',sourceInstitution:'공식기록관',eventDate:'1980년대',placeId:'pnu:111',relationType:'exact_parcel',mediaType:'document',usableAsVerifiedEvidence:true,claims:[{claimId:'claim:site',text:'이 필지의 이전 사용에 관한 승인된 문장입니다.'}],verification:{approvalActive:true}}]:[],candidates:candidate?[{evidenceId:'candidate:news:1',title:'재개발 기사 후보',sourceUrl:'https://news.example/item',mediaType:'article',relationType:'uncertain',usableAsVerifiedEvidence:false,reviewStatus:'candidate'}]:[]},visuals:{photos:media?[{evidenceId:'photo:verified',mediaId:'asset-1',title:'마장동 옛 주거지',sourceUrl:'https://archive.example/photo',imageUrl:'https://image.example/a.jpg',verificationStatus:'VERIFIED',scope:'dong'}]:[]},videos:{records:media?[{id:'video:one',title:'마장동 기록 영상',url:'https://video.example/watch',verifiedSegments:[],independentlyVerified:false}]:[]},registerDiagnostics:{records:[{id:'register:current-1',name:'세림아파트',use:'공동주택',sourceUrl:'https://gov.example/register',approved:'2012-01-01',dateMeaning:'사용승인일이며 최초 건립일이 아닙니다.'}]},provenance:{provider:'fixture',returnedEvidenceIds:['evidence:building','scene:name-1','scene:industry-1','scene:urban-1'],requestId:'request-fixture'}});

test('rich place produces deterministic seven ordered parts and references returned identifiers only',()=>{
 const value=packet(),first=buildDocentTourV2(value),second=buildDocentTourV2(value);
 assert.deepEqual(first,second);assert.deepEqual(first.sections.map(s=>s.id),TOUR_SECTION_IDS);assert.deepEqual(first.sections.map(s=>s.order),[1,2,3,4,5,6,7]);assert.equal(first.placeName,'마장동 세림아파트');
 assert.ok(first.sections[3].evidenceIds.includes('evidence:building'));assert.deepEqual(first.sections[4].photoIds,['photo:verified']);assert.deepEqual(first.sections[2].videoIds,['video:one']);
 assert.equal(validateDocentTourV2(first).valid,true);assert.ok(first.sources.find(s=>s.id==='candidate:news:1').verificationStatus==='candidate_only');assert.equal(first.provenance.operatorAiCalls,0);
});
test('missing direct parcel history remains in part four and never promotes neighborhood context',()=>{
 const input=packet({direct:false});input.registerDiagnostics.records[0].relationType='exact_building';const tour=buildDocentTourV2(input),section=tour.sections[3];assert.equal(tour.sections.length,7);assert.equal(section.verificationStatus,'partial');assert.match(section.missingEvidenceReason,/승인 역사 근거가 없습니다/);assert.ok(section.evidenceIds.includes('register:current-1'));assert.ok(tour.uncertainties.length);
});
test('no photo and video records keep seven parts without inventing media',()=>{
 const tour=buildDocentTourV2(packet({media:false}));assert.equal(tour.sections.length,7);assert.ok(tour.sections.every(s=>s.photoIds.length===0&&s.videoIds.length===0));assert.equal(tour.provenance.returnedPhotoIds.length,0);
});
test('unreviewed research candidates stay candidate-only and do not enter historical claims',()=>{
 const tour=buildDocentTourV2(packet({direct:false,rich:false}));assert.equal(tour.sources.find(s=>s.id==='candidate:news:1').usableAsVerifiedEvidence,false);assert.equal(tour.sources.find(s=>s.id==='candidate:news:1').verificationStatus,'candidate_only');assert.ok(tour.sections.every(s=>s.claimIds.length===0));
});
test('media is deduplicated across parts and unknown identifiers are rejected',()=>{
 const tour=buildDocentTourV2(packet());assert.equal(tour.sections.flatMap(s=>s.photoIds).filter(id=>id==='photo:verified').length,1);const mutated=structuredClone(tour);mutated.sections[0].evidenceIds.push('not-returned');assert.ok(validateDocentTourV2(mutated).reasonCodes.includes('unknown_source_id'));
});
test('fixed schema rejects missing part, malformed ordering and excessive media',()=>{
 const tour=buildDocentTourV2(packet()),missing=structuredClone(tour);missing.sections.pop();assert.equal(validateDocentTourV2(missing).valid,false);const wrong=structuredClone(tour);wrong.sections[0].order=2;assert.ok(validateDocentTourV2(wrong).reasonCodes.includes('section_order_invalid'));const over=structuredClone(tour);over.sections[0].photoIds=Array(9).fill(over.provenance.returnedPhotoIds[0]);assert.ok(validateDocentTourV2(over).reasonCodes.includes('media_limit_exceeded'));
});

test('recorded MaJang address lookup is represented as seven parts without inventing parcel history',()=>{
 const fixtures=JSON.parse(readFileSync(new URL('./fixtures/field-addresses.json',import.meta.url),'utf8'));
 const address=fixtures.find(row=>row.roadAddr==='서울특별시 성동구 마장로42길 16 (마장동, 세림아파트)');assert.ok(address);
 const tour=buildDocentTourV2({address:address.roadAddr,district:address.sggNm,dong:address.emdNm,place:{name:address.bdNm,records:[]},neighborhood:{records:[]},evidence:{records:[],candidates:[]},visuals:{photos:[]},videos:{records:[]},registerDiagnostics:{records:[]}});
 assert.deepEqual(tour.sections.map(section=>section.id),TOUR_SECTION_IDS);assert.equal(tour.placeName,'세림아파트');assert.equal(tour.sections[3].verificationStatus,'missing');assert.match(tour.sections[3].missingEvidenceReason,/직접 연결된 승인 역사 근거가 없습니다/);assert.equal(tour.provenance.semanticVerification,'not_checked');
});
