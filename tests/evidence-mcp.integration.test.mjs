import test from 'node:test';
import assert from 'node:assert/strict';
import {POST} from '../app/mcp/route.ts';
import {signAddress} from '../lib/providers.ts';
import {POST as adminPOST} from '../app/api/admin/evidence/route.ts';
const rpc=(name,args)=>new Request('https://fixture.test/mcp',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})});
test('real MCP route preserves legacy fields, gallery and tools while adding common candidates without model calls',async()=>{
 const saved={...process.env},fetch=globalThis.fetch,info=console.info;const logs=[];
 for(const key of ['VERCEL','BUILDING_API_KEY','CLOSED_BUILDING_API_KEY','CLOUDFLARE_ACCOUNT_ID','CLOUDFLARE_D1_DATABASE_ID','CLOUDFLARE_D1_API_TOKEN'])delete process.env[key];
 process.env.JUSO_API_KEY='fixture-signing-secret';globalThis.fetch=async()=>{throw new Error('Network forbidden in fixture test');};console.info=value=>logs.push(value);
 try{
  const token=await signAddress({roadAddr:'서울특별시 강동구 강동대로 207',jibunAddr:'서울특별시 강동구 성내동 448-11',siNm:'서울특별시',sggNm:'강동구',emdNm:'성내동',admCd:'1174010800',bdMgtSn:'1'.repeat(25),bdNm:'윤선생빌딩',lnbrMnnm:'448',lnbrSlno:'11',mtYn:'0',zipNo:''},process.env.JUSO_API_KEY);
  for(const name of ['prepare_place_answer','generate_place_answer']){
   const response=await POST(rpc(name,{token}));assert.equal(response.status,200);const {result}=await response.json();assert.equal(result.isError,undefined);const packet=JSON.parse(result.content[0].text);
   for(const key of ['place','neighborhood','visuals','videos','evidence'])assert.ok(key in packet,key);
   assert.equal(packet.generation.serverAiCalls,0);assert.equal(packet.evidence.records.length,0);assert.equal(packet.bigQueryResearch.diagnosticStatus,'backend_unavailable');assert.ok(packet.evidence.candidates.every(r=>r.usableAsVerifiedEvidence===false));assert.deepEqual(result.structuredContent.photos,packet.visuals.photos);assert.ok(result._meta.requestId);assert.ok(packet.experience);assert.ok(packet.registerDiagnostics);assert.equal(packet.timing.clientAiGenerationMs,null);assert.equal(packet.provenance.externalMaterialMayClaimMcpOrigin,false);assert.ok(packet.neighborhood.selected<=8);assert.ok(packet.research.records.every(r=>r.observations.length<=2));assert.ok(packet.visuals.photos.every(p=>p.acquisition==='mcp_archive'&&p.relation_type!=='exact_building'));
  }
  const result=await (await POST(rpc('validate_place_answer',{token,evidenceClaims:[{evidenceId:'candidate:article:fake',claimId:'fake',text:'이 건물은 1900년에 지어졌다.'}]}))).json();const packet=JSON.parse(result.result.content[0].text);assert.equal(packet.valid,false);assert.equal(packet.evidenceValidation.semanticVerification,'not_checked');assert.equal(packet.verificationStages.sourceCorrespondence.status,'held');assert.equal(packet.verificationStages.semantic.status,'not_checked');
  const traces=logs.filter(l=>String(l).includes('mcp_evidence_retrieval'));assert.equal(traces.length,2);assert.ok(traces.every(l=>!String(l).includes('fixture-signing-secret')));
 }finally{console.info=info;globalThis.fetch=fetch;for(const key of Object.keys(process.env))if(!(key in saved))delete process.env[key];Object.assign(process.env,saved);}
});
test('actual admin approval route rejects anonymous before reading body or database',async()=>{
 const response=await adminPOST(new Request('https://fixture.test/api/admin/evidence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'approved'})}));assert.equal(response.status,403);
});
