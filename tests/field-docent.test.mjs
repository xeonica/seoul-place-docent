import test from 'node:test';
import assert from 'node:assert/strict';
import {DocentCache,DocentTrace} from '../lib/docent-runtime.ts';
import {parseBuildingJson,searchAddresses} from '../lib/providers.ts';
import {placeRegisterBundle} from '../lib/place-register.ts';
import {getFullDocentStory,getDocentStory} from '../lib/docent-data.ts';
import {preparePlaceAnswer,guidePhotos,validateAnswer} from '../lib/place-answer.ts';
import {docentExperience,visitorPhotos,datePrecision,visitorRelation} from '../lib/docent-experience.ts';
import {fixturePhoto} from './fixtures/verified-photo.mjs';
import {POST as narrationPOST} from '../app/api/docent/narration/route.ts';
const address={roadAddr:'서울특별시 성동구 마장로42길 16',jibunAddr:'서울특별시 성동구 마장동 1',siNm:'서울특별시',sggNm:'성동구',emdNm:'마장동',admCd:'1120010500',bdMgtSn:'1'.repeat(25),bdNm:'세림아파트',lnbrMnnm:'1',lnbrSlno:'0',mtYn:'0',zipNo:''};
// Parcel/building identifiers below are synthetic fixtures, not live address observations.
const row={sigunguCd:'11200',bjdongCd:'10500',platGbCd:'0',bun:'0001',ji:'0000',mgmBldrgstPk:'fixture-register',bldNm:'시험 건물',newPlatPlc:address.roadAddr,platPlc:address.jibunAddr,mainPurpsCdNm:'공동주택',useAprDay:'19850101',hhldCnt:10,hoCnt:12,pmsDay:'19830101',stcnsDay:'19840101',regstrKindCdNm:'표제부'};
const response=items=>({response:{header:{resultCode:'00'},body:{items:{item:items},totalCount:items.length}}});
test('bounded cache coalesces independent concurrent reads, expires and never stores failures',async()=>{
 let calls=0;const cache=new DocentCache(100,1),load=async()=>++calls;
 const result=await Promise.all([cache.get('a',load,1),cache.get('a',load,1)]);assert.equal(calls,1);assert.deepEqual(result.map(r=>r.cache),['MISS','HIT']);await cache.get('a',load,102);assert.equal(calls,2);await cache.get('b',load,103);await cache.get('a',load,104);assert.equal(calls,4);
 let failures=0;for(let i=0;i<2;i++)await assert.rejects(()=>cache.get('bad',async()=>{failures++;throw new Error('fixture');}));assert.equal(failures,2);
});
test('stage timings explicitly leave client AI and network transfer unmeasured',async()=>{
 const trace=new DocentTrace();await trace.measure('fixture',async()=>1);await assert.rejects(()=>trace.measure('failed',async()=>{throw new Error('fixture');}));const t=trace.snapshot();assert.equal(t.stages[0].status,'ok');assert.equal(t.stages[1].status,'unavailable');assert.equal(t.clientAiGenerationMs,null);assert.equal(t.firstUsefulInformationMs,null);assert.equal(t.networkTransferMs,null);
});
test('official optional fields preserve dates/households without inventing block counts or summing registers',()=>{
 const rows=parseBuildingJson(response([row,{...row,mgmBldrgstPk:'aggregate',regstrKindCdNm:'총괄표제부'}]),address);assert.equal(rows.length,2);assert.equal(rows[0].approved,'19850101');assert.equal(rows[0].permitDate,'19830101');assert.equal(rows[0].households,'10');assert.equal(rows[0].units,'12');assert.equal('blockCount' in rows[0],false);
 assert.equal(parseBuildingJson(response([{...row,bun:'0999'}]),address).length,0);
});
test('missing building keys yield structured unavailable rather than silent absence of history',async()=>{
 const result=await placeRegisterBundle(address,{});assert.equal(result.records.length,0);assert.equal(result.sections.current.status,'unavailable');assert.equal(result.sections.current.code,'KEY_MISSING');assert.equal(result.sections.closed.code,'CLOSED_KEY');assert.equal(result.historyStatus,'not_established_by_register');assert.equal(result.aggregation,'not_summed');
});
test('registers run independently, return partial facts and cache only successful reads',async()=>{
 const old=globalThis.fetch;let current=0,closed=0;globalThis.fetch=async url=>{if(String(url).includes('ShtRgst')){closed++;throw new Error('closed unavailable');}current++;return Response.json(response([row]));};
 try{const env={BUILDING_API_KEY:'field-register-success',CLOSED_BUILDING_API_KEY:'field-register-failure'};const first=await placeRegisterBundle(address,env),second=await placeRegisterBundle(address,env);assert.equal(current,1);assert.equal(closed,2);assert.equal(first.records.length,1);assert.equal(second.sections.current.cache,'HIT');assert.equal(second.sections.closed.status,'unavailable');assert.equal(second.records[0].approved,'19850101');assert.ok(second.records[0].dateMeaning.includes('최초 건립일이 아닙니다'));}finally{globalThis.fetch=old;}
});
test('address cache is opt-in; authoritative geographic review remains fresh and tokens are freshly signed',async()=>{
 const old=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;return Response.json({results:{common:{errorCode:'0',totalCount:'1'},juso:[address]}});};
 try{const env={JUSO_API_KEY:'field-address-cache'};assert.equal((await searchAddresses('마장로42길 16',1,env,{cache:true})).cache,'MISS');assert.equal((await searchAddresses('마장로42길 16',1,env,{cache:true})).cache,'HIT');await searchAddresses('마장로42길 16',1,env);assert.equal(calls,2);}finally{globalThis.fetch=old;}
});
test('story plans for four requested addresses use actual local records without forcing MaJang themes everywhere',()=>{
 const places=[['세림아파트','성동구','마장동','마장로42길 16'],['한성대학교','성북구','삼선동2가','삼선교로16길 116'],['면목한신아파트','중랑구','면목동','중랑천로 20'],['성동삼성쉐르빌','성동구','도선동','무학로6길 50']];
 const titles=[];for(const [name,district,dong,road] of places){const story=getFullDocentStory(district,dong),p=preparePlaceAnswer({address:{...address,roadAddr:road,bdNm:name,sggNm:district,emdNm:dong},story,recordLimit:8}),experience=docentExperience(p,[]);assert.equal(experience.directHistoryStatus,'unverified');assert.ok(experience.themes.length<=4);assert.ok(experience.sourceCards.every(c=>p.neighborhood.records.some(r=>r.id===c.id)&&c.sourceUrl));assert.ok(experience.observations.every(o=>!o.supportedFact));assert.equal(experience.clientSemanticReview.serverCertified,false);titles.push(experience.themes.map(t=>t.title).join());}assert.ok(new Set(titles).size>1);
});
test('a building register never becomes direct historical evidence or a fabricated construction year',()=>{
 const p=preparePlaceAnswer({address,story:getFullDocentStory('성동구','마장동'),placeRecords:[{id:'official',scope:'building',approved:'19850101'}]}),experience=docentExperience(p,[]);assert.equal(experience.directHistoryStatus,'unverified');assert.deepEqual(experience.directEvidenceIds,[]);assert.ok(experience.sequence.find(s=>s.step==='today').action.includes('최초 건립일로 해석하지 않음'));
});
test('photo identity is not subject-location identity, and lack of directions disables before/after comparison',()=>{
 const photo=fixturePhoto('PHOTO-FIELD'),scene={id:'SCENE',date:'1978',year:1978,title:'현재 건물과 이름이 같아도 동네 사진',text:'지역 참고 사진이다.',scope:'dong',order:1,evidence:[{url:photo.sourceUrl,institution:'시험 기관',title:'시험 자료'}],photos:[photo]};const p=preparePlaceAnswer({address,story:{district:'성동구',dong:'마장동',scenes:[scene]}}),photos=visitorPhotos(guidePhotos(p),[]);assert.equal(photos.length,1);assert.equal(photos[0].relation_type,'neighborhood');assert.equal(photos[0].subject_location,null);assert.equal(photos[0].camera_location,null);assert.equal(photos[0].comparisonEligible,false);assert.equal(photos[0].date_precision,'day');
 assert.equal(visitorRelation('historical_site'),'unverified');assert.equal(datePrecision(null),'unknown');assert.equal(datePrecision('1978'),'year');assert.equal(datePrecision('1978년대'),'approximate_or_label');
});
test('official narration HTTP route cannot call the operator model even with a configured key',async()=>{
 const previous=process.env.OPENAI_API_KEY,fetch=globalThis.fetch;process.env.OPENAI_API_KEY='MUST-NOT-CALL';let calls=0;globalThis.fetch=async()=>{calls++;throw new Error('operator model forbidden');};
 try{const story=getDocentStory('성동구','마장동');const response=await narrationPOST(new Request('https://fixture.test/api/docent/narration',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({district:'성동구',dong:'마장동',ids:[story.scenes[0].id]})}));assert.equal(response.status,503);assert.equal((await response.json()).error.code,'SERVER_AI_DISABLED');assert.equal(calls,0);}finally{if(previous===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=previous;globalThis.fetch=fetch;}
});

test('a specifically unsupported source attribution stays in audit holds and cannot enter narration or validation',()=>{
 const story=getFullDocentStory('성동구','마장동');assert.ok(story.heldRecords.some(r=>r.id==='claim:E000421'));assert.ok(story.scenes.every(r=>r.id!=='claim:E000421'));
 const scene={id:'claim:E000421',title:'보류된 출처',text:'1961년의 사건이라고 주장한다.',date:'1961',scope:'dong',photos:[],evidence:[]};
 const checked=validateAnswer({question_type:'동네 역사',paragraphs:[{heading:'보류',text:'1961년의 사건이라고 주장한다.',evidence_ids:[scene.id]}],held:[]},[scene]);assert.equal(checked.omitted,1);
});
