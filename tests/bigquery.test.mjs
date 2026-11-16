import test from 'node:test';
import assert from 'node:assert/strict';
import {readBigQueryConfig} from '../lib/bigquery/config.ts';
import {BigQueryError} from '../lib/bigquery/errors.ts';
import {emptyBigQueryAudit,findVerifiedRecords,toBigQueryScenes} from '../lib/bigquery/repository.ts';

const env={BIGQUERY_ENABLED:'true',BIGQUERY_PROJECT_ID:'seoul-history-test',BIGQUERY_DATASET_ID:'history_catalog',BIGQUERY_LOCATION:'asia-northeast3',BIGQUERY_MAX_BYTES_BILLED:'104857600',BIGQUERY_QUERY_TIMEOUT_MS:'8000',BIGQUERY_QUERY_MAX_RESULTS:'8',BIGQUERY_WIF_PROJECT_NUMBER:'123456789012',BIGQUERY_WIF_POOL_ID:'vercel',BIGQUERY_WIF_PROVIDER_ID:'production',BIGQUERY_SERVICE_ACCOUNT_EMAIL:'mcp-reader@example-project.iam.gserviceaccount.com'};
function restoreFetch(fn){const original=globalThis.fetch;globalThis.fetch=fn;return()=>{globalThis.fetch=original;};}
function authAndQueryFetch({dryRunBytes='1024',rows=[]}={}){
 const requests=[];
 const fetcher=async(url,init={})=>{
  const contentType=init.headers?.['Content-Type']||init.headers?.['content-type']||'';
  requests.push({url:String(url),init,body:init.body&&String(contentType).includes('application/json')?JSON.parse(String(init.body)):null});
  if(String(url)==='https://sts.googleapis.com/v1/token')return Response.json({access_token:'federated-token'});
  if(String(url).includes(':generateAccessToken'))return Response.json({accessToken:'bigquery-token'});
  if(String(url).endsWith('/queries')&&requests.at(-1).body?.dryRun)return Response.json({totalBytesProcessed:dryRunBytes});
  if(String(url).endsWith('/queries'))return Response.json({jobComplete:true,totalBytesProcessed:dryRunBytes,cacheHit:true,jobReference:{jobId:'job-safe-123'},schema:{fields:[{name:'record_id'},{name:'record_title'}]},rows:rows.map(row=>({f:[{v:row.record_id},{v:row.record_title}]}))});
  throw new Error('unexpected request');
 };
 return {fetcher,requests};
}

test('BigQuery is disabled by default and rejects incomplete configuration without network access',async()=>{
 assert.throws(()=>readBigQueryConfig({}),e=>e instanceof BigQueryError&&e.code==='BQ_DISABLED');
 const bad={...env,BIGQUERY_PROJECT_ID:''};
 assert.throws(()=>readBigQueryConfig(bad),e=>e instanceof BigQueryError&&e.code==='BQ_CONFIG_MISSING');
 const audit=emptyBigQueryAudit();let calls=0;const restore=restoreFetch(async()=>{calls++;throw Error('network should not run');});
 try{assert.deepEqual(await findVerifiedRecords({env:{},district:'마포구',dong:'당인동',audit}),[]);assert.equal(calls,0);assert.equal(audit.bigQueryAttempted,false);}finally{restore();}
});

test('Vercel OIDC WIF runs a bounded dry-run then a parameterized verified-record query',async()=>{
 const {fetcher,requests}=authAndQueryFetch({rows:[]});const restore=restoreFetch(fetcher);const audit=emptyBigQueryAudit();
 try{
  const rows=await findVerifiedRecords({env,request:new Request('https://docent.test/mcp',{headers:{'x-vercel-oidc-token':'short-lived-oidc'}}),district:'마포구\' OR TRUE --',dong:'당인동',audit});
  assert.deepEqual(rows,[]);assert.equal(audit.bigQueryAttempted,true);assert.equal(audit.bigQueryJobId,'job-safe-123');assert.equal(audit.bigQueryMs>=0,true);assert.equal(audit.bigQueryCacheHit,true);
  const jobs=requests.filter(r=>r.url.endsWith('/queries'));assert.equal(jobs.length,2);assert.equal(jobs[0].body.dryRun,true);assert.equal(jobs[1].body.maximumBytesBilled,'104857600');
  assert.match(jobs[1].body.query,/LOWER\(r\.review_status\) = 'content_checked'/);assert.match(jobs[1].body.query,/r\.rights_status IN \('KOGL0', 'KOGL1', 'public_domain'\)/);assert.match(jobs[1].body.query,/l\.link_review_status/);
  assert.ok(!jobs[1].body.query.includes("마포구' OR TRUE"));assert.ok(jobs[1].body.queryParameters.some(p=>p.name==='district'&&p.parameterValue.value==="마포구' OR TRUE --"));
 }finally{restore();}
});

test('BigQuery evidence receives a namespaced ID and keeps place scope and source provenance',()=>{
 const scenes=toBigQueryScenes([{record_id:'NEWS-1',source_institution:'서울시',source_url:'https://example.org/story',record_title:'당인리 발전소',record_type:'NEWS',created_year:2017,subject_start_year:1930,subject_end_year:2017,evidence_excerpt:'발전소 연혁 요약',rights_status:'KOGL1',review_status:'content_checked',historical_place_name:'당인리',event_type:'FACILITY_HISTORY',relation_type:'DISTRICT_CONTEXT',relation_evidence:'구 맥락',district:'마포구',legal_dong:'당인동'}]);
 assert.equal(scenes[0].id,'bq:NEWS-1');assert.equal(scenes[0].scope,'district');assert.equal(scenes[0].evidence[0].url,'https://example.org/story');assert.match(scenes[0].evidence[0].note,/특정 동·건물/);assert.equal(scenes[0].year,1930);
});

test('cost ceiling blocks the real query and records a safe fallback code',async()=>{
 const {fetcher,requests}=authAndQueryFetch({dryRunBytes:'2048'});const restore=restoreFetch(fetcher);const audit=emptyBigQueryAudit();
 try{
  await assert.rejects(()=>findVerifiedRecords({env:{...env,BIGQUERY_MAX_BYTES_BILLED:'100'},request:new Request('https://docent.test/mcp',{headers:{'x-vercel-oidc-token':'short-lived-oidc'}}),district:'마포구',dong:'당인동',audit}),e=>e instanceof BigQueryError&&e.code==='BQ_BUDGET_EXCEEDED');
  assert.equal(requests.filter(r=>r.url.endsWith('/queries')).length,1);assert.equal(audit.bigQueryFallback,true);assert.equal(audit.bigQueryErrorCode,'BQ_BUDGET_EXCEEDED');
 }finally{restore();}
});

test('authentication failure becomes an optional-source fallback without leaking provider details',async()=>{
 const restore=restoreFetch(async(url)=>String(url)==='https://sts.googleapis.com/v1/token'?new Response('secret provider response',{status:403}):Response.json({}));const audit=emptyBigQueryAudit();
 try{
  await assert.rejects(()=>findVerifiedRecords({env,request:new Request('https://docent.test/mcp',{headers:{'x-vercel-oidc-token':'bad-token'}}),district:'마포구',dong:'당인동',audit}),e=>e instanceof BigQueryError&&e.code==='BQ_AUTH_FAILED'&&!e.message.includes('secret'));
  assert.equal(audit.bigQueryFallback,true);assert.equal(audit.bigQueryErrorCode,'BQ_AUTH_FAILED');
 }finally{restore();}
});
