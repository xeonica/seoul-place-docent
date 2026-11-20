import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {POST} from '../app/mcp/route.ts';
import {signAddress,verifyAddress} from '../lib/providers.ts';
import {briefDocent} from '../lib/brief-docent.ts';
import {canDisplayVerifiedPhoto} from '../lib/photo-display-policy.ts';
import {IMAGE_RESOURCE_DOMAINS,imageProxyOrigin} from '../lib/image-proxy.ts';
import {queryBigQuery,bigQueryMetrics,bigQueryPlaceCandidates,clearBigQueryMetadataCacheForTests} from '../lib/bigquery-place.ts';
const address=JSON.parse(readFileSync(new URL('./fixtures/centras-address.json',import.meta.url),'utf8'));
async function isolation(run){const saved={...process.env},fetch=globalThis.fetch,info=console.info;console.info=()=>{};clearBigQueryMetadataCacheForTests();try{return await run();}finally{globalThis.fetch=fetch;console.info=info;for(const k of Object.keys(process.env))if(!(k in saved))delete process.env[k];Object.assign(process.env,saved);clearBigQueryMetadataCacheForTests();}}
async function call(token,detailLevel){const r=await POST(new Request('https://fixture.test/mcp',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'prepare_place_answer',arguments:{token,detailLevel}}})}));const text=await r.text(),rpc=JSON.parse(text);assert.equal(rpc.result.isError,undefined);return {r,text,result:rpc.result,packet:JSON.parse(rpc.result.content[0].text)};}
test('opt-in brief keeps legacy evidence IDs and image identity, returns signed validation context and smaller wire response',async()=>isolation(async()=>{
 process.env.JUSO_API_KEY='brief-fixture-key';for(const k of ['VERCEL','CLOUDFLARE_ACCOUNT_ID','BUILDING_API_KEY','CLOSED_BUILDING_API_KEY','KAKAO_REST_API_KEY'])delete process.env[k];let requests=0;globalThis.fetch=async()=>{requests++;throw new Error('unexpected upstream');};
 const token=await signAddress(address,process.env.JUSO_API_KEY),standard=await call(token,'standard'),brief=await call(token,'brief');
 assert.deepEqual(brief.packet.neighborhood.records.map(r=>r.id),standard.packet.neighborhood.records.map(r=>r.id));assert.deepEqual(brief.packet.neighborhood.records.map(r=>r.text),standard.packet.neighborhood.records.map(r=>r.text));assert.deepEqual(brief.packet.evidence.records,standard.packet.evidence.records);assert.equal(brief.packet.details.externalCandidatesDeferred,true);assert.equal(brief.packet.timing.bigQuery.queries,0);assert.equal(requests,0);
 assert.equal((await verifyAddress(brief.packet.validationContext.token,{JUSO_API_KEY:process.env.JUSO_API_KEY})).bdMgtSn,address.bdMgtSn);
 assert.deepEqual(brief.packet.neighborhood.records.map(r=>r.evidence),standard.packet.neighborhood.records.map(r=>r.evidence));assert.ok(Buffer.byteLength(brief.text)<Buffer.byteLength(standard.text)*.65);assert.equal(Number(brief.r.headers.get('x-mcp-response-bytes')),Buffer.byteLength(brief.text));assert.match(brief.r.headers.get('server-timing'),/serialize;dur=/);assert.ok(brief.result._meta.serverTimings.auditMs>=0);
 for(const p of brief.packet.visuals.photos){assert.equal(canDisplayVerifiedPhoto(p,IMAGE_RESOURCE_DOMAINS,imageProxyOrigin()),true);assert.ok(standard.packet.visuals.photos.some(s=>s.evidenceId===p.evidenceId&&s.imageUrl===p.imageUrl&&s.sourceUrl===p.sourceUrl));}
 const source=standard.packet;source.evidence.records=[{evidenceId:'test-approved',usableAsVerifiedEvidence:true,claims:[{claimId:'a',text:'시험용 주장',classification:'factual'},{claimId:'b',text:'시험용 상충 근거',classification:'contested'}],relationType:'dong_context',rightsStatus:'citation_and_ai_permitted'}];assert.deepEqual(briefDocent(source,token).evidence.records[0].claims,source.evidence.records[0].claims);
}));
function configure(){Object.assign(process.env,{VERCEL:'1',GCP_PROJECT_ID:'latency-fixture',GCP_PROJECT_NUMBER:'123',GCP_WORKLOAD_IDENTITY_POOL_ID:'pool',GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID:'provider',GCP_SERVICE_ACCOUNT_EMAIL:'fixture@example.org',BIGQUERY_LOCATION:'asia-northeast3',MCP_PUBLIC_METADATA_CACHE:'',VERCEL_GIT_COMMIT_SHA:'a'.repeat(40)});}
const request=()=>new Request('https://fixture.test',{headers:{'x-vercel-oidc-token':'never-persist-test-token'}});
test('independent queries share one authorization only inside a request; public metadata is version scoped and returned by copy',async()=>isolation(async()=>{
 configure();const calls={sts:0,iam:0,query:0};globalThis.fetch=async url=>{if(String(url).includes('sts.googleapis')){calls.sts++;return Response.json({access_token:'ephemeral'});}if(String(url).includes('iamcredentials')){calls.iam++;return Response.json({accessToken:'ephemeral'});}calls.query++;return Response.json({jobComplete:true,rows:[{f:[{v:'public candidate'}]}]});};
 const r=request();await Promise.all(['query-a','query-b'].map(sql=>queryBigQuery(r,sql,[],{publicMetadata:true})));assert.deepEqual(calls,{sts:1,iam:1,query:2});assert.equal(bigQueryMetrics(r).authExchanges,1);
 const hit=request(),rows=await queryBigQuery(hit,'query-a',[],{publicMetadata:true});rows[0].f[0].v='mutated';assert.equal((await queryBigQuery(request(),'query-a',[],{publicMetadata:true}))[0].f[0].v,'public candidate');assert.equal(bigQueryMetrics(hit).cacheHits,1);assert.equal(bigQueryMetrics(hit).authExchanges,0);
 assert.equal(await queryBigQuery(new Request('https://fixture.test'),'query-a',[],{publicMetadata:true}),undefined);
 process.env.VERCEL_GIT_COMMIT_SHA='b'.repeat(40);await queryBigQuery(request(),'query-a',[],{publicMetadata:true});assert.equal(calls.sts,2);
 await queryBigQuery(request(),'private-query',[]);await queryBigQuery(request(),'private-query',[]);assert.equal(calls.sts,4,'queries without explicit public-metadata opt-in never use shared cache');
}));
test('concurrent 5/10 callers coalesce public query work; failed queries are evicted and abort propagates',async()=>isolation(async()=>{
 configure();let queries=0,fail=false;globalThis.fetch=async(url,init)=>{if(init.signal.aborted)throw init.signal.reason;if(String(url).includes('sts.googleapis'))return Response.json({access_token:'fixture'});if(String(url).includes('iamcredentials'))return Response.json({accessToken:'fixture'});queries++;if(fail)throw new Error('provider unavailable');return Response.json({jobComplete:true,rows:[]});};
 for(const n of [5,10]){clearBigQueryMetadataCacheForTests();queries=0;await Promise.all(Array.from({length:n},()=>queryBigQuery(request(),'concurrent',[],{publicMetadata:true})));assert.equal(queries,1);}
 clearBigQueryMetadataCacheForTests();fail=true;for(let i=0;i<2;i++)await assert.rejects(()=>queryBigQuery(request(),'failed',[],{publicMetadata:true}));assert.equal(queries,3);fail=false;
 const controller=new AbortController();controller.abort();await assert.rejects(()=>queryBigQuery(new Request('https://fixture.test',{signal:controller.signal,headers:{'x-vercel-oidc-token':'fixture'}}),'aborted',[],{publicMetadata:true}));
}));
test('additive audit index is usable and idempotent without changing approvals or audit rows',()=>{
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE archive_audit(action TEXT,actor TEXT,note TEXT); INSERT INTO archive_audit VALUES (\'evidence_review\',\'fixture\',\'{}\')');const sql=readFileSync(new URL('../drizzle/0007_evidence_audit_lookup.sql',import.meta.url),'utf8');db.exec(sql);db.exec(sql);assert.match(db.prepare("EXPLAIN QUERY PLAN SELECT note FROM archive_audit WHERE action='evidence_review' AND actor='fixture'").all()[0].detail,/archive_audit_action_actor/);assert.equal(db.prepare('SELECT count(*) AS n FROM archive_audit').get().n,1);db.close();
});
test('queries using a caller coordinate do not enter the shared public metadata cache',async()=>isolation(async()=>{
 configure();let queries=0;globalThis.fetch=async url=>{if(String(url).includes('sts.googleapis'))return Response.json({access_token:'fixture'});if(String(url).includes('iamcredentials'))return Response.json({accessToken:'fixture'});queries++;return Response.json({jobComplete:true,rows:[]});};
 for(let i=0;i<2;i++){const r=request();await bigQueryPlaceCandidates(r,address,6,0,[],{latitude:37.56,longitude:127.04});assert.equal(bigQueryMetrics(r).cacheHits,0);}assert.equal(queries,2);
}));
