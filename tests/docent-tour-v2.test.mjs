import test from 'node:test';
import assert from 'node:assert/strict';
import {buildDocentTourV2,docentTourInstructions} from '../lib/docent-tour-builder.ts';
import {buildPlaceDocentTourV2} from '../lib/docent-tour-integration.ts';
import {validateDocentTourV2,TOUR_SECTION_IDS} from '../lib/docent-tour-schema.ts';
import {historicalPlaceNamesForRegion} from '../lib/historical-records.ts';

const verifiedPhoto=({id,title,relation='dong_context',scope='dong',related=[],locationVerification='regional_context_only'}={})=>({evidenceId:id,mediaId:'asset-'+id,sourceRecordId:'record-'+id,title,caption:title,sourceUrl:`https://archive.example/${id}`,imageUrl:`https://image.example/${id}.jpg`,date:'1960년대',license:'공개 표시 허용',displayable:true,verificationStatus:'VERIFIED',scope,relation_type:relation,locationVerification,relatedEvidenceIds:related});
const video=(id,title,relation='legal_dong_candidate',segments=[])=>({id,title,url:`https://video.example/${id}`,provider:'공식 기록관',relation,verificationStatus:'metadata_only',contentVerified:false,verifiedSegments:segments});
const packet=({direct=true,media=true,candidate=true,rich=true,photos=null,videos=null,question='마장동 세림아파트와 주변의 변화를 알려주세요.',questionType='특정 장소·건물',detailLevel='standard'}={})=>({detailLevel,address:'서울특별시 성동구 마장로42길 16',district:'성동구',dong:'마장동',question,classification:{questionType},place:{name:'마장동 세림아파트',records:[{id:'register:current-1',scope:'building',name:'세림아파트',use:'공동주택',approved:'2012-01-01',dateMeaning:'사용승인일이며 최초 건립일이 아닙니다.'}]},neighborhood:{records:rich?[{id:'scene:name-1',title:'마장동 지명 유래 조사',text:'마장동의 옛 지명과 유래를 조사한 기록입니다.',scope:'dong',source:{url:'https://archive.example/name',institution:'지역기록관'}},{id:'scene:industry-1',title:'마장동 축산시장과 산업 변화',text:'시장의 상업·산업 변화를 기록했습니다.',scope:'dong',source:{url:'https://archive.example/industry',institution:'지역기록관'}},{id:'scene:urban-1',title:'마장동 주거 공간과 거리 사진',text:'주거지와 도로의 변화를 담은 기록입니다.',scope:'dong',source:{url:'https://archive.example/urban',institution:'지역기록관'}}]:[]},evidence:{records:direct?[{evidenceId:'evidence:building',title:'세림아파트 필지 검토',sourceUrl:'https://archive.example/direct',sourceInstitution:'공식기록관',eventDate:'1980년대',placeId:'pnu:111',relationType:'exact_parcel',mediaType:'document',usableAsVerifiedEvidence:true,claims:[{claimId:'claim:site',text:'이 필지의 이전 사용에 관한 승인된 문장입니다.'}],verification:{approvalActive:true}}]:[],candidates:candidate?[{evidenceId:'candidate:news:1',title:'재개발 기사 후보',sourceUrl:'https://news.example/item',mediaType:'article',relationType:'uncertain',usableAsVerifiedEvidence:false,reviewStatus:'candidate'}]:[]},visuals:{photos:photos??(media?[verifiedPhoto({id:'scene:urban-1',title:'마장동 주거 공간과 거리 사진',related:['scene:urban-1']} )]:[])},videos:{records:videos??(media?[video('video:market','마장동 축산시장 산업 변화 기록 영상')]:[])},registerDiagnostics:{records:[{id:'register:current-1',name:'세림아파트',use:'공동주택',sourceUrl:'https://gov.example/register',approved:'2012-01-01',dateMeaning:'사용승인일이며 최초 건립일이 아닙니다.'}]},provenance:{provider:'fixture',returnedEvidenceIds:['evidence:building','scene:name-1','scene:industry-1','scene:urban-1'],requestId:'request-fixture'}});

test('rich place produces deterministic seven ordered parts and references returned identifiers only',()=>{
 const value=packet(),first=buildDocentTourV2(value),second=buildDocentTourV2(value);
 assert.deepEqual(first,second);assert.deepEqual(first.sections.map(s=>s.id),TOUR_SECTION_IDS);assert.deepEqual(first.sections.map(s=>s.order),[1,2,3,4,5,6,7]);assert.equal(first.placeName,'마장동 세림아파트');
 assert.ok(first.sections[3].evidenceIds.includes('evidence:building'));assert.deepEqual(first.sections[4].photoIds,['scene:urban-1']);assert.deepEqual(first.sections[2].videoIds,['video:market']);assert.equal(validateDocentTourV2(first).valid,true);assert.equal(first.provenance.operatorAiCalls,0);
});

test('1960s market image is assigned to part three through its linked record and topic',()=>{
 const image=verifiedPhoto({id:'photo:market-1960',title:'1960년대 마장동 축산시장 전경',related:['scene:industry-1']}),tour=buildDocentTourV2(packet({photos:[image],videos:[]}));
 assert.deepEqual(tour.sections[2].photoIds,['photo:market-1960']);assert.ok(tour.sections[4].photoIds.length===0);
});

test('verified direct building photo can represent the place while neighborhood photo stays contextual',()=>{
 const building=verifiedPhoto({id:'photo:building',title:'세림아파트 단지 전경',relation:'exact_building',scope:'dong',related:['evidence:building'],locationVerification:'reviewed_relation'}),background=verifiedPhoto({id:'photo:alley',title:'마장동 옛 골목 거리',related:['scene:urban-1']}),tour=buildDocentTourV2(packet({photos:[background,building],videos:[]}));
 assert.deepEqual(tour.opening.placeImageIds,['photo:building']);assert.ok(!tour.opening.placeImageIds.includes('photo:alley'));assert.ok(!tour.sections[0].photoIds.includes('photo:alley'));assert.ok(!tour.sections[3].photoIds.includes('photo:alley'));
});

test('a historic-site or neighborhood image is not promoted to a direct building cover photo',()=>{
 const historic=verifiedPhoto({id:'photo:historic-site',title:'세림아파트 인근 옛 유적지',relation:'historical_site',related:['evidence:building'],locationVerification:'reviewed_relation'}),tour=buildDocentTourV2(packet({photos:[historic],videos:[]}));
 assert.deepEqual(tour.opening.placeImageIds,[]);assert.equal(validateDocentTourV2(tour).valid,true);
});

test('a relevant symbolic photo can be assigned to part seven when stronger topical matches are absent',()=>{
 const image=verifiedPhoto({id:'photo:meaning',title:'마장동의 기억과 의미를 보여주는 대표 사진',related:['scene:urban-1']}),tour=buildDocentTourV2(packet({photos:[image],videos:[]}));
 assert.deepEqual(tour.sections[6].photoIds,['photo:meaning']);
});

test('twenty relevant photos stay within the total limit of eight with no duplicates',()=>{
 const photos=Array.from({length:20},(_,i)=>i<10?verifiedPhoto({id:`photo:market-${i}`,title:`1960년대 마장동 축산시장 산업기록 ${i}`,related:['scene:industry-1']}):verifiedPhoto({id:`photo:urban-${i}`,title:`마장동 거리와 주거공간 변화지도 ${i}`,related:['scene:urban-1']})),tour=buildDocentTourV2(packet({photos,videos:[]})),all=[...tour.opening.placeImageIds,...tour.sections.flatMap(s=>s.photoIds)];
 assert.ok(all.length<=8);assert.equal(new Set(all).size,all.length);assert.ok(all.every(id=>tour.photoAssets.find(s=>s.id===id)?.displayStatus==='verified_display'));assert.ok(tour.sections[2].photoIds.some(id=>id.includes('market-')));assert.ok(tour.sections[4].photoIds.some(id=>id.includes('urban-')));
});

test('ten candidate videos result in at most three relevant unique links and no invented segments',()=>{
 const videos=Array.from({length:10},(_,i)=>video(`video:${i}`,i%2?`마장동 거리 도시공간 변화 영상 ${i}`:`마장동 축산시장 산업 변화 영상 ${i}`,'legal_dong_candidate')),tour=buildDocentTourV2(packet({photos:[],videos})),all=tour.sections.flatMap(s=>s.videoIds);
 assert.ok(all.length<=3);assert.equal(new Set(all).size,all.length);assert.ok(all.every(id=>videos.some(v=>v.id===id)));assert.ok(all.every(id=>tour.sources.find(s=>s.id===id)?.verificationStatus==='candidate_only'));assert.ok(tour.sections.every(s=>s.videoIds.length===0||s.videoIds.every(id=>videos.find(v=>v.id===id).verifiedSegments.length===0)));
});

test('comprehensive guidance keeps all seven parts at each detail level',()=>{
 for(const detailLevel of ['brief','standard','full']){const tour=buildDocentTourV2(packet({detailLevel,question:'세림아파트 역사를 도슨트로 해설해 줘'})),instructions=docentTourInstructions(tour);assert.equal(tour.responseScope,'comprehensive_tour');assert.match(instructions,/도입부.*1부.*2부.*3부.*4부.*5부.*6부.*7부/s);assert.match(instructions,/brief·standard·full은 깊이와 분량만 다르고 이 구조는 같습니다/);assert.doesNotMatch(instructions,/3~5문단/);}
});

test('focused building-year and photo questions do not force the full seven-part response',()=>{
 const yearTour=buildDocentTourV2(packet({question:'이 건물은 몇 년에 지어졌어?',questionType:'특정 장소·건물'})),photoTour=buildDocentTourV2(packet({question:'옛 사진만 보여줘',questionType:'사진 찾기'}));
 assert.equal(yearTour.responseScope,'focused_question');assert.equal(photoTour.responseScope,'focused_question');assert.match(docentTourInstructions(yearTour),/7부 전체를 강제하지 마세요/);assert.match(docentTourInstructions(photoTour),/질문에 필요하지 않은 부를 채우지 마세요/);
});

test('missing direct parcel history remains in part four without inventing facts or media',()=>{
 const input=packet({direct:false,photos:[],videos:[]});input.registerDiagnostics.records[0].relationType='exact_building';const tour=buildDocentTourV2(input),section=tour.sections[3];
 assert.equal(tour.sections.length,7);assert.equal(section.verificationStatus,'partial');assert.match(section.missingEvidenceReason,/승인 역사 근거가 없습니다/);assert.ok(section.evidenceIds.includes('register:current-1'));assert.ok(tour.uncertainties.length);assert.equal(tour.provenance.semanticVerification,'not_checked');
});

test('historical-site evidence remains separate from exact building or parcel history',()=>{
 const input=packet({photos:[],videos:[]});input.evidence.records[0].relationType='historical_site';const tour=buildDocentTourV2(input);
 assert.ok(!tour.sections[3].evidenceIds.includes('evidence:building'));assert.equal(tour.sections[3].verificationStatus,'partial');assert.equal(validateDocentTourV2(tour).valid,true);
});

test('unreviewed candidates do not become claims and link-only or rejected photos are not assigned',()=>{
 const linkOnly={evidenceId:'photo:source-only',sourceUrl:'https://archive.example/item',title:'마장동 시장 사진',verificationStatus:'SOURCE_ONLY',displayable:false},rejected={...verifiedPhoto({id:'photo:rejected',title:'마장동 시장 산업 사진'}),verificationStatus:'REJECTED'},tour=buildDocentTourV2(packet({direct:false,photos:[linkOnly,rejected],videos:[]}));
 assert.equal(tour.sources.find(s=>s.id==='candidate:news:1').usableAsVerifiedEvidence,false);assert.ok(tour.sections.every(s=>s.claimIds.length===0));assert.ok(tour.sections.every(s=>s.photoIds.length===0));assert.equal(tour.photoAssets.find(s=>s.id==='photo:source-only').displayStatus,'source_link_only');assert.equal(tour.photoAssets.find(s=>s.id==='photo:rejected').displayStatus,'withheld');
});

test('mechanical validator rejects broken references, over-budget media, and unauthorized image display',()=>{
 const tour=buildDocentTourV2(packet()),unknown=structuredClone(tour);unknown.sections[0].evidenceIds.push('not-returned');assert.ok(validateDocentTourV2(unknown).reasonCodes.includes('unknown_source_id'));
 const photos=structuredClone(tour);photos.opening.placeImageIds=[];photos.sections[0].photoIds=Array(9).fill('scene:urban-1');assert.ok(validateDocentTourV2(photos).reasonCodes.includes('media_limit_exceeded'));
 const hidden=structuredClone(tour);hidden.photoAssets.find(s=>s.id==='scene:urban-1').displayStatus='source_link_only';assert.ok(validateDocentTourV2(hidden).reasonCodes.includes('photo_not_displayable'));
 const leaked=structuredClone(tour);leaked.photoAssets.find(s=>s.id==='scene:urban-1').displayStatus='source_link_only';leaked.photoAssets.find(s=>s.id==='scene:urban-1').imageUrl='https://image.example/leak.jpg';assert.ok(validateDocentTourV2(leaked).reasonCodes.includes('photo_display_status_mismatch'));
 const notDirect=structuredClone(tour);notDirect.photoAssets.find(s=>s.id==='scene:urban-1').relationScope='nearby';notDirect.opening.placeImageIds=['scene:urban-1'];assert.ok(validateDocentTourV2(notDirect).reasonCodes.includes('opening_photo_not_direct'));
 const missing=structuredClone(tour);missing.sections.pop();assert.equal(validateDocentTourV2(missing).valid,false);
});

test('recorded MaJang address lookup retains seven parts and does not invent parcel history',()=>{
 const address={roadAddr:'서울특별시 성동구 마장로42길 16 (마장동, 세림아파트)',sggNm:'성동구',emdNm:'마장동',bdNm:'세림아파트'};
 const tour=buildDocentTourV2({address:address.roadAddr,district:address.sggNm,dong:address.emdNm,place:{name:address.bdNm,records:[]},neighborhood:{records:[]},evidence:{records:[],candidates:[]},visuals:{photos:[]},videos:{records:[]},registerDiagnostics:{records:[]}});
 assert.deepEqual(tour.sections.map(section=>section.id),TOUR_SECTION_IDS);assert.equal(tour.placeName,'세림아파트');assert.equal(tour.sections[3].verificationStatus,'missing');assert.match(tour.sections[3].missingEvidenceReason,/직접 연결된 승인 역사 근거가 없습니다/);assert.equal(tour.provenance.semanticVerification,'not_checked');
});

test('place-link integration keeps pending D1 links as candidates and only passes approved source text as direct evidence',()=>{
 const base=packet({direct:false,photos:[],videos:[]}),placeEvidenceLinks={items:[
  {linkId:'link-approved',evidenceId:'evidence-approved',title:'검토된 필지 자료',sourceUrl:'https://archive.example/approved',institution:'기록기관',mediaType:'document',evidence:'승인된 원문 근거 문장',reviewedRelation:'parcel',usableAsDirectEvidence:true},
  {linkId:'link-pending',evidenceId:'evidence-pending',title:'검토 대기 사진',sourceUrl:'https://archive.example/pending',mediaType:'photo',reviewedRelation:'exact_site',usableAsDirectEvidence:false},
 ]};
 const plan=buildPlaceDocentTourV2({packet:base,placeRecords:[],photos:[],videos:{records:[]},placeEvidenceLinks}),approved=plan.sources.find(source=>source.id==='evidence-approved'),pending=plan.sources.find(source=>source.id==='evidence-pending');
 assert.equal(approved?.usableAsVerifiedEvidence,true);assert.equal(approved?.relationScope,'exact_parcel');assert.equal(pending?.usableAsVerifiedEvidence,false);assert.equal(pending?.verificationStatus,'candidate_only');assert.equal(plan.provenance.semanticVerification,'not_checked');
});

test('empty direct-place lookup keeps neighborhood records while approved name/event facts attach to parts two and three',()=>{
 const base=packet({direct:false,candidate:false,photos:[],videos:[]}),facts={status:'ready',records:[
  {id:'fact:name',title:'옥수동 옛 지명',description:'옥수동의 명칭 변천을 기록한 원문 내용입니다.',scope:'toponymy',timeLabel:'조선 후기',startYear:1700,endYear:1899,sourceId:'source:name',sourceTitle:'공식 지명 자료',sourceUrl:'https://history.example/name',institution:'공공 기록기관',publicationDate:'2020-05-01',passageId:'passage:name',passageText:'검토한 지역 지명 근거',passageTextKind:'paraphrase',regionId:'dong-성동구-옥수동',regionLevel:'legal_dong',relationScope:'dong_context',reviewStatus:'approved'},
  {id:'fact:event',title:'옥수동 지역 사건',description:'지역 사건을 확인한 원문 문장입니다.',scope:'event',timeLabel:'1960년대',startYear:1960,endYear:1969,sourceId:'source:event',sourceTitle:'당시 기사',sourceUrl:'https://history.example/event',institution:'신문사',publicationDate:'1964-03-02',passageId:'passage:event',passageText:'검토된 당시 사건 관련 본문',passageTextKind:'transcription',regionId:'dong-성동구-옥수동',regionLevel:'legal_dong',relationScope:'dong_context',reviewStatus:'approved'},
 ]};
 const tour=buildPlaceDocentTourV2({packet:base,placeRecords:[],photos:[],videos:{records:[]},placeEvidenceLinks:{items:[]},regionalHistoryFacts:facts});
 assert.ok(tour.sections[1].evidenceIds.includes('fact:name'));assert.ok(tour.sections[2].evidenceIds.includes('fact:event'));
 assert.ok(tour.sections[1].sourceIds.includes('scene:name-1'));assert.ok(tour.sections[2].sourceIds.includes('scene:industry-1'));
 assert.equal(tour.sections[3].verificationStatus,'missing');assert.ok(tour.sections[3].missingEvidenceReason.includes('직접 연결된 승인 역사 근거가 없습니다'));
 const name=tour.sources.find(source=>source.id==='fact:name'),event=tour.sources.find(source=>source.id==='fact:event');
 assert.equal(name?.relationScope,'dong_context');assert.equal(name?.dateType,'publication');assert.equal(name?.subjectPeriod,'조선 후기');assert.equal(name?.eventDate,null);assert.equal(name?.publicationDate,'2020-05-01');assert.equal(event?.eventDate,'1960년대');assert.equal(tour.provenance.semanticVerification,'not_checked');
 assert.deepEqual(tour.historicalEvents.map(item=>[item.eventDate,item.publicationDate,item.relationScope]),[['1960년대','1964-03-02','dong_context']]);
});

test('official historical-name catalog entries are returned as boundary-unresolved candidates, never direct claims',()=>{
 const names=historicalPlaceNamesForRegion('성동구','성수동1가'),tour=buildPlaceDocentTourV2({packet:{...packet({direct:false,candidate:false,photos:[],videos:[]}),dong:'성수동1가'},placeRecords:[],photos:[],videos:{records:[]},placeEvidenceLinks:{items:[]}});
 assert.ok(names.length>0);assert.ok(names.every(item=>item.currentDongType==='unresolved'&&item.spatialRelation==='historical_area_candidate'&&item.evidenceUrl.startsWith('https://')));
 assert.ok(tour.historicalNames.every(item=>item.spatialRelation==='historical_area_candidate'));
 assert.equal(tour.sources.some(source=>names.some(name=>source.id===name.id)),false);
});

test('photo tour metadata keeps capture/publication/place-direction claims separate and unverified by default',()=>{
 const photo=verifiedPhoto({id:'photo:unknown-location',title:'자료집 사진'}),tour=buildDocentTourV2(packet({photos:[photo],videos:[]})),asset=tour.photoAssets.find(item=>item.id==='photo:unknown-location');
 assert.equal(asset?.captureDate,null);assert.equal(asset?.publicationDate,null);assert.equal(asset?.dateBasis,'unknown');assert.equal(asset?.cameraLocation,null);assert.equal(asset?.subjectLocation,null);assert.equal(asset?.viewDirection,null);assert.equal(asset?.comparisonGroupId,null);assert.equal(asset?.comparisonStatus,'unverified');
});
