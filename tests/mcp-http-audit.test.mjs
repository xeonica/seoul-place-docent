import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {POST,GET,DELETE,OPTIONS} from '../app/mcp/route.ts';
import {GET as statsRoute} from '../app/api/admin/mcp-stats/route.ts';
import {signAddress} from '../lib/providers.ts';
import {auditedCall,recordMcpCall,mcpUsageStats,clientHint} from '../lib/mcp-audit.ts';
import {createMcpLimiter} from '../lib/mcp-http.ts';
import {historyQuestion} from '../lib/user-ai.ts';

const headers={'content-type':'application/json',accept:'application/json, text/event-stream'};
const envelope=(method,params={},id=1)=>({jsonrpc:'2.0',id,method,params});
const request=(body,extra={})=>new Request('https://docent.test/mcp',{method:'POST',headers:{...headers,...extra},body:JSON.stringify(body)});
const invoke=async(name,args={})=>{const r=await POST(request(envelope('tools/call',{name,arguments:args})));assert.equal(r.status,200);return (await r.json()).result;};
const data=result=>JSON.parse(result.content[0].text);
function sqliteD1(){const sqlite=new DatabaseSync(':memory:');return {sqlite,prepare(sql){const stmt=sqlite.prepare(sql);const wrap=args=>({bind(...values){return wrap(values);},async run(){stmt.run(...args);return {success:true};},async first(){return stmt.get(...args)??null;},async all(){return {results:stmt.all(...args),success:true};}});return wrap([]);}};}

test('HTTP initialize/list, notifications, parse errors and stateless methods',async()=>{
 const r=await POST(request(envelope('initialize',{protocolVersion:'2025-11-25'})));
 assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/application\/json/);assert.equal(r.headers.has('mcp-session-id'),false);
 assert.equal((await r.json()).result.protocolVersion,'2025-11-25');
 assert.equal((await (await POST(request(envelope('tools/list')))).json()).result.tools.length,9);
 const n=await POST(request({jsonrpc:'2.0',method:'notifications/initialized'}));assert.equal(n.status,202);assert.equal(await n.text(),'');
 assert.equal((await POST(new Request('https://docent.test/mcp',{method:'POST',headers,body:'{'}))).status,400);
 for(const handler of [GET,DELETE])assert.equal(handler(new Request('https://docent.test/mcp')).status,405);
 assert.equal(OPTIONS(new Request('https://docent.test/mcp')).status,204);
 assert.equal((await POST(request(envelope('unknown')))).status,404);
 assert.equal((await POST(request(envelope('tools/call',{name:'unknown'})))).status,400);
});
test('transport rejects origins, media types, oversized streams and invalid modern headers',async()=>{
 assert.equal((await POST(request(envelope('ping'),{origin:'https://evil.test'}))).status,403);
 assert.equal(GET(new Request('https://docent.test/mcp',{headers:{origin:'null'}})).status,403);
 assert.equal((await POST(request(envelope('ping'),{accept:'application/json'}))).status,406);
 assert.equal((await POST(request(envelope('ping'),{accept:'application/json;q=0, text/event-stream'}))).status,406);
 assert.equal((await POST(request(envelope('ping'),{'content-type':'text/plain'}))).status,415);
 assert.equal((await POST(request({x:'가'.repeat(12000)}))).status,413);
 assert.equal((await POST(request(envelope('ping'),{'content-length':'40000'}))).status,413);
 const modern=envelope('tools/list',{_meta:{'io.modelcontextprotocol/protocolVersion':'2026-07-28','io.modelcontextprotocol/clientCapabilities':{}}});
 assert.equal((await POST(request(modern))).status,400);
 const modernResponse=await POST(request(modern,{'mcp-protocol-version':'2026-07-28','mcp-method':'tools/list'}));assert.equal(modernResponse.status,200);assert.equal((await modernResponse.json()).result.resultType,'complete');
 const bad=await POST(request(envelope('ping'),{'mcp-protocol-version':'future'}));assert.equal((await bad.json()).error.code,-32022);
 const missingCaps=await POST(request(envelope('ping',{_meta:{'io.modelcontextprotocol/protocolVersion':'2026-07-28'}}),{'mcp-protocol-version':'2026-07-28','mcp-method':'ping'}));assert.equal((await missingCaps.json()).error.code,-32602);
 const call=envelope('tools/call',{name:'resolve_photo_location',_meta:{'io.modelcontextprotocol/protocolVersion':'2026-07-28','io.modelcontextprotocol/clientCapabilities':{}}});
 const meta={'mcp-protocol-version':'2026-07-28','mcp-method':'tools/call','mcp-name':'wrong'};
 assert.equal((await POST(request(call,meta))).status,400);
 meta['mcp-name']='=?base64?'+Buffer.from('resolve_photo_location').toString('base64')+'?=';
 assert.equal((await POST(request(call,meta))).status,200);
 const limit=createMcpLimiter(2,1000);assert.equal(limit(1000),true);assert.equal(limit(1001),true);assert.equal(limit(1002),false);assert.equal(limit(2000),true);
});
test('all eight actual MCP tools run without operator model calls; address and GPS edge cases',async()=>{
 const original=globalThis.fetch;const saved={...process.env};const info=console.info;console.info=()=>{};
 process.env.JUSO_API_KEY='fixture-only';process.env.OPENAI_API_KEY='must-never-be-used';
 delete process.env.CLOUDFLARE_ACCOUNT_ID;
 const address={roadAddr:'서울특별시 종로구 사직로 161',jibunAddr:'서울특별시 종로구 세종로 1-1',siNm:'서울특별시',sggNm:'종로구',emdNm:'세종로',admCd:'1111011900',bdMgtSn:'fixture',bdNm:'',lnbrMnnm:'1',lnbrSlno:'1',mtYn:'0',zipNo:'03045'};
 let candidates=[address],network=[],unexpected=[];
 globalThis.fetch=async input=>{const url=new URL(String(input));network.push(url.hostname);if(url.hostname!=='business.juso.go.kr'){unexpected.push(url.hostname);throw new Error('Forbidden external call');}return Response.json({results:{common:{errorCode:'0',totalCount:String(candidates.length)},juso:candidates}});};
 try{
  const search=await invoke('search_place',{query:'사직로 161'});const token=data(search).candidates[0].token;
  assert.ok(search._meta.requestId);assert.equal(search._meta.auditPersisted,false);
  const packet=data(await invoke('prepare_place_answer',{token}));assert.equal(packet.generation.serverAiCalls,0);assert.ok(packet.neighborhood.records.length>0);
  assert.deepEqual(data(await invoke('generate_place_answer',{token})).neighborhood,packet.neighborhood);
  assert.ok(data(await invoke('get_place_history',{token})).neighborhood.scenes.length>0);
  const record=packet.neighborhood.records[0];
  const checked=data(await invoke('validate_place_answer',{token,question:packet.question,answer:{question_type:'동네 역사',paragraphs:[{heading:'근거',text:record.text.slice(0,100),evidence_ids:[record.id]}],held:[]}}));assert.equal(checked.verification,'mechanical_only');
  assert.equal(data(await invoke('resolve_photo_location')).status,'needs_location');
  assert.equal((await invoke('resolve_photo_location',{latitude:91,longitude:0})).isError,true);
  assert.equal((await invoke('resolve_photo_location',{latitude:35,longitude:129})).isError,true);
  assert.equal((await invoke('search_place',{query:'x'})).isError,true);
  assert.equal((await invoke('prepare_place_answer',{token:'forged'})).isError,true);
  assert.equal((await invoke('get_archive_stats')).isError,true);
  assert.equal(data(await invoke('get_answer_stats')).available,false);
  candidates=[address,address];assert.equal(data(await invoke('prepare_place_answer',{address:address.roadAddr})).needsChoice,true);
  candidates=[];assert.equal(data(await invoke('search_place',{query:'없는주소'})).candidates.length,0);
  candidates=[{...address,siNm:'부산광역시',admCd:'2629010100'}];assert.equal(data(await invoke('search_place',{query:'부산주소'})).candidates.length,0);
  const outside=await signAddress(candidates[0],'fixture-only');assert.equal((await invoke('prepare_place_answer',{token:outside})).isError,true);
  const empty=await signAddress({...address,sggNm:'미등록구',emdNm:'미등록동'},'fixture-only');assert.equal((await invoke('prepare_place_answer',{token:empty})).isError,true);
  assert.equal(unexpected.length,0);assert.ok(network.length>0);
 }finally{globalThis.fetch=original;console.info=info;for(const k of Object.keys(process.env))if(!(k in saved))delete process.env[k];Object.assign(process.env,saved);}
});
test('SQLite audit persists generated IDs, counts evidence, hides private data and computes KST/P95',async()=>{
 const db=sqliteD1();const result=await auditedCall(db,'search_place','unknown',async()=>({content:[{type:'text',text:JSON.stringify({candidates:[{roadAddr:'PRIVATE ADDRESS',token:'SECRET TOKEN'}]})}]}));
 assert.equal(result._meta.auditPersisted,true);assert.match(result._meta.requestId,/^[a-f0-9-]{36}$/);
 const stored=db.sqlite.prepare('SELECT * FROM mcp_tool_call_log').all();assert.equal(stored[0].records,1);assert.doesNotMatch(JSON.stringify(stored),/PRIVATE|SECRET/);
 const bad=await auditedCall(db,'prepare_place_answer','unknown',async()=>{throw new Error('PRIVATE KEY');});assert.equal(bad.isError,true);assert.doesNotMatch(JSON.stringify(bad),/PRIVATE KEY/);
 const now=Date.parse('2026-11-07T01:00:00Z');
 for(let i=1;i<=20;i++)await recordMcpCall(db,{requestId:'sample-'+i,tool:i===20?'validate_place_answer':'search_place',at:now-i,ok:i!==1,records:i===1?0:2,ms:i,errorType:i===1?'invalid_input':null,client:'unknown',validation:i===20});
 await recordMcpCall(db,{requestId:'yesterday',tool:'search_place',at:Date.parse('2026-11-06T14:59:59Z'),ok:true,records:0,ms:900,errorType:null,client:'unknown',validation:false});
 const stats=await mcpUsageStats(db,now);assert.equal(stats.calls,20);assert.equal(stats.succeeded,19);assert.equal(stats.errors,1);assert.equal(stats.p95Ms,19);assert.equal(stats.averageMs,10.5);assert.equal(stats.validationRequests,1);assert.equal(stats.validationsExecuted,1);
 assert.equal(clientHint(new Request('https://x',{headers:{'user-agent':'ChatGPT SECRET'}})),'chatgpt_unverified');db.sqlite.close();
});
test('audit storage failure is explicit and does not prevent retrieval',async()=>{
 const original=console.info;const logs=[];console.info=x=>logs.push(x);
 try {const result=await auditedCall({prepare(){throw new Error('secret');}},'search_place','unknown',async()=>({content:[]}));assert.equal(result._meta.auditPersisted,false);assert.equal(logs.length,1);assert.doesNotMatch(logs[0],/secret/);}finally{console.info=original;}
});
test('admin statistics fail closed for spoofed identity headers and cross-origin requests',async()=>{
 const saved={...process.env};process.env.ARCHIVE_ADMIN_TOKEN='test-admin';process.env.ARCHIVE_OWNER_EMAIL='owner@example.test';delete process.env.CLOUDFLARE_ACCOUNT_ID;
 try {
  for(const h of [{},{'x-archive-admin':'wrong'},{'oai-authenticated-user-id':'spoof','oai-authenticated-user-email':'owner@example.test'},{'x-archive-admin':'test-admin',origin:'https://evil.test'}])assert.equal((await statsRoute(new Request('https://docent.test/api/admin/mcp-stats',{headers:h}))).status,403);
  const ok=await statsRoute(new Request('https://docent.test/api/admin/mcp-stats',{headers:{'x-archive-admin':'test-admin'}}));assert.equal(ok.status,200);assert.equal(ok.headers.get('cache-control'),'no-store');assert.equal((await ok.json()).available,false);
 }finally{for(const k of Object.keys(process.env))if(!(k in saved))delete process.env[k];Object.assign(process.env,saved);}
});
test('copied prompt includes only the selected address and an actual MCP workflow',()=>{
 const prompt=historyQuestion('서울특별시 성북구 삼선교로16길 116');assert.match(prompt,/삼선교로16길 116/);for(const tool of ['search_place','prepare_place_answer','validate_place_answer'])assert.ok(prompt.includes(tool));assert.doesNotMatch(prompt,/https:|API_KEY/);
});

test('real route audit reaches D1 adapter and the authenticated statistics API',async()=>{
 const saved={...process.env},original=globalThis.fetch;const sqlite=new DatabaseSync(':memory:');
 Object.assign(process.env,{CLOUDFLARE_ACCOUNT_ID:'fixture',CLOUDFLARE_D1_DATABASE_ID:'fixture',CLOUDFLARE_D1_API_TOKEN:'fixture',ARCHIVE_ADMIN_TOKEN:'fixture-admin'});
 globalThis.fetch=async(url,init)=>{
  assert.equal(new URL(url).hostname,'api.cloudflare.com');
  const payload=JSON.parse(init.body),queries=payload.batch||[payload];
  return Response.json({success:true,result:queries.map(q=>({success:true,results:sqlite.prepare(q.sql).all(...q.params),meta:{}}))});
 };
 try {
  const response=await invoke('resolve_photo_location');assert.equal(response._meta.auditPersisted,true);
  const log=sqlite.prepare('SELECT * FROM mcp_tool_call_log').get();assert.equal(log.request_id,response._meta.requestId);
  const result=await statsRoute(new Request('https://docent.test/api/admin/mcp-stats',{headers:{'x-archive-admin':'fixture-admin'}}));
  assert.equal(result.status,200);const stats=await result.json();assert.equal(stats.calls,1);assert.equal(stats.recent[0].request_id,log.request_id);
 }finally{globalThis.fetch=original;sqlite.close();for(const k of Object.keys(process.env))if(!(k in saved))delete process.env[k];Object.assign(process.env,saved);}
});
