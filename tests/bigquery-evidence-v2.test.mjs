import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {bigQueryPlaceCandidates} from '../lib/bigquery-place.ts';
import {getDocentVideoCandidates} from '../lib/docent-videos.ts';
const address={roadAddr:'서울특별시 성동구 마장로42길 16',jibunAddr:'서울특별시 성동구 마장동 1',bdMgtSn:'1'.repeat(25),admCd:'1120010500',mtYn:'0',lnbrMnnm:'1',lnbrSlno:'0',sggNm:'성동구',emdNm:'마장동',bdNm:"test' OR TRUE --"};
async function queryFixture(result,run){
 const saved={...process.env},original=globalThis.fetch,requests=[];
 Object.assign(process.env,{MCP_PUBLIC_METADATA_CACHE:'off',VERCEL:'1',GCP_PROJECT_ID:'fixture',GCP_PROJECT_NUMBER:'123',GCP_WORKLOAD_IDENTITY_POOL_ID:'fixture',GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID:'fixture',GCP_SERVICE_ACCOUNT_EMAIL:'fixture@example.org',BIGQUERY_LOCATION:'asia-northeast3',BIGQUERY_PLACE_SERVING_VERSION:'v2'});
 globalThis.fetch=async(url,init)=>{requests.push({url:String(url),body:JSON.parse(init.body)});return Response.json(String(url).includes('sts.googleapis')?{access_token:'fixture'}:String(url).includes('iamcredentials')?{accessToken:'fixture'}:result);};
 try{return await run(requests);}finally{globalThis.fetch=original;for(const k of Object.keys(process.env))if(!(k in saved))delete process.env[k];Object.assign(process.env,saved);}
}
test('BigQuery ready-zero means no_candidates, not verified evidence; queries are parameterized and bounded',async()=>{
 await queryFixture({jobComplete:true,rows:[]},async requests=>{
  const result=await bigQueryPlaceCandidates(new Request('https://fixture/mcp',{headers:{'x-vercel-oidc-token':'fixture'}}),address,999,-5,['검토된 옛 지명']);assert.equal(result.status,'ready');assert.equal(result.diagnosticStatus,'no_candidates');assert.equal(result.diagnostics.usableEvidenceCount,0);
  const q=requests.at(-1).body;assert.equal(q.useLegacySql,false);assert.equal(q.maximumBytesBilled,'1000000000');assert.equal(q.query.includes(address.bdNm),false);assert.match(q.query,/place_evidence_candidates_v2/);assert.match(q.query,/building_management_number/);assert.match(q.query,/pnu/);assert.match(q.query,/jibun_address/);assert.match(q.query,/alias_verified/);assert.equal(q.queryParameters.find(p=>p.name==='limit').parameterValue.value,'21');assert.equal(q.queryParameters.find(p=>p.name==='offset').parameterValue.value,'0');assert.match(q.queryParameters.find(p=>p.name==='alias').parameterValue.value,/옛지명/);
 });
});
test('BigQuery approval text does not authorize article claims and query errors differ from zero rows',async()=>{
 await queryFixture({jobComplete:true,rows:[{f:['id','제목','article','1978','기관','https://example.org/article','exact_building','approved','approved','permission',JSON.stringify({place_id:'fake',relation_type:'exact_building'})].map(v=>({v}))}]},async()=>{const r=await bigQueryPlaceCandidates(new Request('https://fixture',{headers:{'x-vercel-oidc-token':'fixture'}}),address);assert.equal(r.records[0].usableAsVerifiedEvidence,false);assert.equal(r.diagnosticStatus,'candidates_unlinked');});
 await queryFixture({jobComplete:false},async()=>{const r=await bigQueryPlaceCandidates(new Request('https://fixture',{headers:{'x-vercel-oidc-token':'fixture'}}),address);assert.equal(r.diagnosticStatus,'query_error');assert.equal(r.records.length,0);});
});
test('missing real WIF request identity never masquerades as an empty successful query',async()=>{
 const r=await bigQueryPlaceCandidates(new Request('https://fixture'),address);assert.equal(r.diagnosticStatus,'backend_unavailable');assert.equal(r.status,'unavailable');
});
test('optional real coordinates use bounded safe geography parameters without implying building identity',async()=>{
 await queryFixture({jobComplete:true,rows:[]},async requests=>{await bigQueryPlaceCandidates(new Request('https://fixture',{headers:{'x-vercel-oidc-token':'fixture'}}),address,6,0,[],{latitude:37.56,longitude:127.04,radiusM:9999});const q=requests.at(-1).body;assert.match(q.query,/SAFE.ST_GEOGPOINT/);assert.match(q.query,/ST_DWITHIN/);assert.equal(q.queryParameters.find(p=>p.name==='radius').parameterValue.value,'2000');assert.equal(q.queryParameters.find(p=>p.name==='latitude').parameterType.type,'FLOAT64');});
});
test('video pool and final page size are separate; metadata is not claimed as reviewed content',async()=>{
 const first=await getDocentVideoCandidates('강동구','성내동',{limit:2}),next=await getDocentVideoCandidates('강동구','성내동',{limit:2,offset:2,query:'강동구 출범'});assert.ok(first.candidateCount>=first.records.length);assert.ok(first.records.length<=2);assert.ok(next.records.length<=2);assert.ok(first.searchedCount<=120);assert.ok(first.records.every(r=>r.verificationStatus==='metadata_only'&&!r.contentVerified));assert.equal((await getDocentVideoCandidates('강동구','성내동')).records.length<=3,true);
});
test('v2 SQL/workflow add versioned assets without destructive replacement or automatic deployment',()=>{
 const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8'),sql=read('scripts/bigquery/evidence-v2.sql'),merge=read('scripts/bigquery/merge-evidence-v2.sql'),workflow=read('.github/workflows/bigquery-evidence-v2.yml');assert.doesNotMatch(sql,/CREATE OR REPLACE|DROP TABLE|TRUNCATE|DELETE FROM/i);assert.match(sql,/CREATE VIEW IF NOT EXISTS/);assert.match(sql,/FALSE AS usable_as_verified_evidence/);assert.match(sql,/valid_from/);assert.match(sql,/revision DESC/);assert.match(merge,/WHEN NOT MATCHED THEN INSERT/);assert.doesNotMatch(merge,/WHEN MATCHED|DELETE FROM|TRUNCATE/i);assert.match(workflow,/workflow_dispatch/);assert.doesNotMatch(workflow,/--replace|vercel deploy|^  push:/m);
});
