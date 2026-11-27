import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {getFullDocentStory as getDocentStory} from '../lib/docent-data.ts';
import {generatePlaceAnswer,preparePlaceAnswer,pickScenes,placeAnswerStats,validateAnswer,DOCENT_RULES,logClientDocent} from '../lib/place-answer.ts';
const story=getDocentStory('종로구','세종로');
const address={roadAddr:'서울특별시 종로구 사직로 161',jibunAddr:'세종로 1-1',sggNm:'종로구',emdNm:'세종로'};
function fakeD1(){const rows=[];return {rows,
 prepare(sql){return {async run(){},bind(...args){return {
  async run(){if(sql.startsWith('INSERT'))rows.push({at:args[0],event:args[1],ms:args[2],ok:args[3],records:args[4],question_type:args[5],kept:args[6],omitted:args[7]});},
  async all(){return {results:rows.filter(r=>r.at>=args[0]).slice().reverse().slice(0,10001)};}
 };}};}};}
test('question words select matching records within a bounded chronological packet',()=>{
 const scenes=pickScenes(story,'세종로 지하도 공사는 언제 했나요?',6);
 assert.ok(scenes.some(s=>/지하도/.test(s.title)));assert.ok(scenes.length<=6);
 assert.ok(scenes.every((s,i)=>i===0||scenes[i-1].order<=s.order));
});
test('legacy generation returns evidence without any model request or old answer cache',async()=>{
 const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw new Error('model must not be called');};
 try{
  const db=fakeD1();
  const packet=await generatePlaceAnswer({address,story,question:'옛날 모습',questionType:'시대별 모습'},{DB:db,OPENAI_API_KEY:'must-not-be-used'});
  assert.equal(calls,0);assert.equal(packet.mode,'client_ai');assert.equal(packet.generation.serverAiCalls,0);
  assert.equal(packet.generation.executor,'calling_client_ai');assert.equal(packet.classification.questionType,'시대별 모습');
  assert.equal('paragraphs' in packet,false);assert.ok(packet.neighborhood.records.length>0);
  assert.deepEqual(packet.place.records,[]);assert.equal(packet.place.status,'unverified');
  assert.ok(packet.neighborhood.records.every(r=>r.evidence&&r.source));
  assert.equal(db.rows.length,1);assert.equal(db.rows[0].event,'retrieval');
 }finally{globalThis.fetch=original;}
});
test('no evidence returns honest no_records, never a fabricated story',()=>{
 const p=preparePlaceAnswer({address,story:{...story,scenes:[]}});
 assert.equal(p.status,'no_records');assert.deepEqual(p.neighborhood.records,[]);
 assert.equal(p.classification.questionType,null);
 assert.equal(p.narration.action,'compose_guided_visit');
 assert.equal(p.narration.opening,'identify_place_or_guide_observation');
 assert.equal(p.narration.neighborhood,'explain_general_context');
});
test('unknown citations including mixed known/unknown, unsupported numbers and long scenes are rejected',()=>{
 const scenes=pickScenes(story,'지하도',4),id=scenes.find(s=>/지하도/.test(s.title)).id;
 const row=(text,evidence_ids)=>({heading:'지하도',text,evidence_ids});
 const result=validateAnswer({question_type:'동네 역사',paragraphs:[
 row('세종로에 지하도를 만들었어요.',[id]),
 row('이야기예요.',[id,'unknown']),
 row('1999년에 완공했어요.',[id]),
 row('하나예요. 둘이에요. 셋이에요. 넷이에요.',[id])
 ],held:['건물 자체의 역사']},scenes);
 assert.equal(result.paragraphs.length,1);assert.equal(result.omitted,3);
 assert.deepEqual(result.held,['건물 자체의 역사']);
});
test('KPI separates retrieval from validation and never invents client completion or token usage',async()=>{
 const db=fakeD1();
 for(const ms of [100,200,300,400,500])await logClientDocent(db,{event:'retrieval',ms,ok:true,records:3});
 await logClientDocent(db,{event:'retrieval',ms:600,ok:false,records:0});
 await logClientDocent(db,{event:'validation',ms:20,ok:false,records:3,kept:2,omitted:1});
 const k=await placeAnswerStats(db);
 assert.equal(k.retrievalRequests,6);assert.equal(k.retrievalSuccessRate,5/6);
 assert.equal(k.retrievalP95Ms,500);assert.equal(k.validationRequests,1);
 assert.equal(k.mechanicalParagraphAcceptanceRate,2/3);assert.equal(k.clientTokenUsage,null);
 assert.ok(k.unmeasured.includes('사용자 AI의 실제 답변 완료율'));
 assert.equal(k.clientCompatibility.Gemini,'requires_live_test');
 assert.equal((await placeAnswerStats()).available,false);
 await assert.rejects(()=>placeAnswerStats(db,0));
});
test('metrics failure does not block evidence retrieval',async()=>{
 const db={prepare(){throw new Error('db offline');}};
 const p=await generatePlaceAnswer({address,story},{DB:db});assert.equal(p.status,'ready');
});
test('MCP module has no model-provider capability or answer cache reuse',()=>{
 const source=readFileSync(new URL('../lib/place-answer.ts',import.meta.url),'utf8');
 for(const forbidden of ['openaiFetch','api.openai.com','OPENAI_API_KEY','place_answer_cache'])assert.equal(source.includes(forbidden),false,forbidden);
 for(const rule of ['장소와 동네를 구분','1~3문장','held','evidence_ids'])assert.ok(DOCENT_RULES.includes(rule));
});

test('address wording still prioritizes Hanseong place records without upgrading their scope',()=>{
 const address={roadAddr:'서울특별시 성북구 삼선교로16길 116',bdNm:'한성대학교',sggNm:'성북구',emdNm:'삼선동2가'};
 const story=getDocentStory(address.sggNm,address.emdNm);
 const question=address.roadAddr+'의 건물 자체의 역사와 주변 동네의 역사 및 공간 변화를 설명해 줘.';
 const packet=preparePlaceAnswer({address,story,question});
 const records=packet.neighborhood.records;
 assert.ok(records.some(r=>r.id==='seongbuk-688'));
 assert.ok(records.some(r=>r.id==='seongbuk-690'));
 assert.ok(records.some(r=>r.id==='seongbuk-660'));
 assert.ok(records.every(r=>r.scope==='dong'||r.scope==='district'));
 assert.deepEqual(records.map(r=>r.id),pickScenes(story,question,14,address.bdNm).map(r=>r.id));
});

test('place narrative candidates preserve unverified building identity',()=>{
 const named={...story.scenes[0],id:'named-place',title:'은평구청 준공식'};
 const packet=preparePlaceAnswer({address:{...address,bdNm:'은평구청'},story:{...story,scenes:[named]},question:'은평구청 역사'});
 assert.deepEqual(packet.narration.primaryEvidenceIds,['named-place']);
 assert.equal(packet.place.status,'unverified');
 assert.match(packet.place.statusMeaning,/공식 건축물대장 연결 상태/);
 assert.match(packet.instructions,/문장 간 모순/);
 assert.match(packet.instructions,/사진을 실제로 보았을 때만/);
});
