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
 assert.equal((await (await POST(request(envelope('tools/list')))).json()).result.tools.length,11); // +show_place_photos
 const n=await POST(request({jsonrpc:'2.0',method:'notifications/initialized'}));assert.equal(n.status,202);assert.equal(await n.text(),'');
 assert.equal((await POST(new Request('https://docent.test/mcp',{method:'POST',headers,body:'{'}))).status,400);
 for(const handler of [GET,DELETE])assert.equal(handler(new Request('https://docent.test/mcp')).status,405);
 assert.equal(OPTIONS(new Request('https://docent.test/mcp')).status,204);
 const unknown=await POST(request(envelope('unknown')));assert.equal(unknown.status,200);assert.equal((await unknown.json()).error.code,-32601);
 const unknownTool=await POST(request(envelope('tools/call',{name:'unknown'})));assert.equal(unknownTool.status,200);assert.equal((await unknownTool.json()).error.code,-32602);
 const templates=await POST(request(envelope('resources/templates/list')));assert.equal(templates.status,200);assert.deepEqual((await templates.json()).result,{resourceTemplates:[]});
});
test('transport rejects origins, media types, oversized streams and invalid modern headers',async()=>{
 assert.equal((await POST(request(envelope('ping'),{origin:'https://evil.test'}))).status,403);
 assert.equal(GET(new Request('https://docent.test/mcp',{headers:{origin:'null'}})).status,403);
 const jsonOnly=await POST(request(envelope('initialize',{protocolVersion:'2025-11-25'}),{accept:'application/json'}));assert.equal(jsonOnly.status,200);assert.match(jsonOnly.headers.get('content-type'),/application\/json/);assert.equal((await jsonOnly.json()).result.protocolVersion,'2025-11-25');
 assert.equal((await POST(request(envelope('ping'),{accept:'application/json;q=0, text/event-stream'}))).status,406);
 assert.equal((await POST(request(envelope('ping'),{accept:'text/event-stream'}))).status,406);
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
 // Archive photo hosts are fetched for MCP image blocks; answer them with a tiny JPEG instead of the network.
 globalThis.fetch=async input=>{const url=new URL(String(input));network.push(url.hostname);if(['museum.seoul.go.kr','archive-file.sb.go.kr','archives-files.seoul.go.kr'].includes(url.hostname))return new Response(new Uint8Array([255,216,255,224]),{headers:{'Content-Type':'image/jpeg'}});if(url.hostname!=='business.juso.go.kr'){unexpected.push(url.hostname);throw new Error('Forbidden external call');}return Response.json({results:{common:{errorCode:'0',totalCount:String(candidates.length)},juso:candidates}});};
 try{
  const search=await invoke('search_place',{query:'사직로 161'});const token=data(search).candidates[0].token;
  assert.ok(search._meta.requestId);assert.equal(search._meta.auditPersisted,false);
  const packetResult=await invoke('prepare_place_answer',{token}),packet=data(packetResult);assert.equal(packet.generation.serverAiCalls,0);assert.ok(packet.neighborhood.records.length>0);assert.equal(packet.registerDiagnostics.current.status,'key_missing');assert.equal(packet.registerDiagnostics.closed.status,'key_missing');assert.equal(packet.registerDiagnostics.parcel.status,'key_missing');assert.equal(packet.tourPlan.sections[3].verificationStatus,'missing');assert.ok(packetResult.structuredContent.registerDiagnostics);
  assert.deepEqual(data(await invoke('generate_place_answer',{token})).neighborhood,packet.neighborhood);
  assert.ok(data(await invoke('get_place_history',{token})).neighborhood.scenes.length>0);
  const record=packet.neighborhood.records[0];
  const checked=data(await invoke('validate_place_answer',{token,question:packet.question,answer:{question_type:'동네 역사',paragraphs:[{heading:'근거',text:record.text.slice(0,100),evidence_ids:[record.id]}],held:[]}}));assert.equal(checked.verification,'mechanical_only');
  assert.equal(data(await invoke('resolve_photo_location')).status,'needs_location');
  assert.equal((await invoke('resolve_photo_location',{latitude:91,longitude:0})).isError,true);
  assert.equal((await invoke('resolve_photo_location',{latitude:35,longitude:129})).isError,true);
  assert.equal((await invoke('search_place',{query:'x'})).isError,true);
  assert.equal((await invoke('prepare_place_answer',{token:'forged'})).isError,true);
  const archiveStats=await invoke('get_archive_stats');assert.equal(archiveStats.isError,undefined);assert.equal(data(archiveStats).available,false);assert.equal(data(archiveStats).errorCode,'ARCHIVE_NOT_CONFIGURED');
  assert.equal(data(await invoke('get_answer_stats')).available,false);
  candidates=[address,address];assert.equal(data(await invoke('prepare_place_answer',{address:address.roadAddr})).needsChoice,true);
  candidates=[];assert.equal(data(await invoke('search_place',{query:'없는주소'})).candidates.length,0);
  candidates=[{...address,siNm:'부산광역시',admCd:'2629010100'}];assert.equal(data(await invoke('search_place',{query:'부산주소'})).candidates.length,0);
  const outside=await signAddress(candidates[0],'fixture-only');assert.equal((await invoke('prepare_place_answer',{token:outside})).isError,true);
  const empty=await signAddress({...address,sggNm:'미등록구',emdNm:'미등록동'},'fixture-only');assert.equal((await invoke('prepare_place_answer',{token:empty})).isError,true);
  assert.equal(unexpected.length,0);assert.ok(network.length>0);
 }finally{globalThis.fetch=original;console.info=info;for(const k of Object.keys(process.env))if(!(k in saved))delete process.env[k];Object.assign(process.env,saved);}
});

test('Songjeong 4-gil and Majang-ro answer retrieval tolerate optional service states and preserve neighborhood scope',async()=>{
 const original=globalThis.fetch,saved={...process.env},info=console.info,error=console.error;const diagnostics=[];
 process.env.JUSO_API_KEY='fixture-only';
 for(const key of ['CLOUDFLARE_ACCOUNT_ID','CLOUDFLARE_D1_DATABASE_ID','CLOUDFLARE_D1_API_TOKEN','BUILDING_API_KEY','CLOSED_BUILDING_API_KEY','VWORLD_API_KEY','KAKAO_REST_API_KEY'])delete process.env[key];
 const addresses=[
  {roadAddr:'서울특별시 성동구 송정4길 5 (송정동)',jibunAddr:'서울특별시 성동구 송정동 66-163',siNm:'서울특별시',sggNm:'성동구',emdNm:'송정동',admCd:'1120011800',bdMgtSn:'1120011800100660163003160',bdNm:'',lnbrMnnm:'66',lnbrSlno:'163',mtYn:'0',zipNo:'04801'},
  {roadAddr:'서울특별시 성동구 마장로42길 16 (마장동, 세림아파트)',jibunAddr:'서울특별시 성동구 마장동 784 세림아파트',siNm:'서울특별시',sggNm:'성동구',emdNm:'마장동',admCd:'1120010500',bdMgtSn:'1120010500100210000021801',bdNm:'세림아파트',lnbrMnnm:'784',lnbrSlno:'0',mtYn:'0',zipNo:'04757'},
 ];
 process.env.BUILDING_API_KEY='fixture-only';process.env.CLOSED_BUILDING_API_KEY='fixture-only';
 console.info=(line)=>diagnostics.push(String(line));console.error=(line)=>diagnostics.push(String(line));
 globalThis.fetch=async input=>{
  const url=new URL(String(input));
  if(url.hostname==='business.juso.go.kr'){
   const address=addresses.find(item=>url.searchParams.get('keyword')===item.roadAddr);
   return Response.json({results:{common:{errorCode:'0',totalCount:address?'1':'0'},juso:address?[address]:[]}});
  }
  if(url.hostname==='apis.data.go.kr'&&url.pathname.endsWith('/getBrTitleInfo')){
   const row={sigunguCd:url.searchParams.get('sigunguCd'),bjdongCd:url.searchParams.get('bjdongCd'),platGbCd:url.searchParams.get('platGbCd'),bun:url.searchParams.get('bun'),ji:url.searchParams.get('ji'),mgmBldrgstPk:'fixture-building-candidate',bldNm:'공식 대장 후보',newPlatPlc:addresses.find(item=>item.admCd.startsWith(url.searchParams.get('sigunguCd')+url.searchParams.get('bjdongCd')))?.roadAddr||'',platPlc:'서울특별시 성동구 확인 후보'};
   return new Response(JSON.stringify({response:{header:{resultCode:'00'},body:{totalCount:1,items:{item:[row]}}}}),{headers:{'Content-Type':'application/json'}});
  }
  if(url.hostname==='apis.data.go.kr'&&url.pathname.endsWith('/getSrTitleInfo'))return new Response(JSON.stringify({response:{header:{resultCode:'00'},body:{totalCount:0,items:{item:''}}}}),{headers:{'Content-Type':'application/json'}});
  throw new Error('Unexpected external request');
 };
 try{
  for(const address of addresses){
   const search=await invoke('search_place',{query:address.roadAddr});const candidate=data(search).candidates;
   assert.equal(candidate.length,1,address.emdNm+' address should resolve uniquely');
   const token=candidate[0].token;
   const history=await invoke('get_place_history',{token});assert.ok(data(history).neighborhood.scenes.length>0,address.emdNm+' history should be available');
   const prepared=await invoke('prepare_place_answer',{token});
   assert.equal(prepared.isError,undefined,address.emdNm+' prepare_place_answer must not fail; stage diagnostics: '+JSON.stringify(diagnostics));
   const packet=data(prepared);
   assert.equal(packet.neighborhood.dong,address.emdNm);
   assert.equal(packet.placeEvidenceLinks.status,'database_unavailable');
   assert.equal(packet.registerDiagnostics.current.status,'identity_ambiguous');
   assert.equal(packet.registerDiagnostics.closed.status,'no_records');
   assert.equal(packet.registerDiagnostics.parcel.status,'key_missing');
   assert.equal(packet.tourPlan.sections.length,7);
   assert.equal(packet.tourPlan.sections[3].verificationStatus,'missing','dong history must not become direct building history');
   assert.ok(prepared._meta.requestId);
  }
  const stageEvents=diagnostics.filter(line=>line.includes('"event":"mcp_stage"'));
  assert.ok(stageEvents.some(line=>line.includes('"stage":"build_place_docent_tour_v2"')&&line.includes('"ok":true')));
  assert.equal(diagnostics.filter(line=>line.includes('"event":"mcp_stage"')&&line.includes('"ok":false')).length,0);
 }finally{globalThis.fetch=original;console.info=info;console.error=error;for(const k of Object.keys(process.env))if(!(k in saved))delete process.env[k];Object.assign(process.env,saved);}
});

test('SQLite audit persists generated IDs, counts evidence, hides private data and computes KST/P95',async()=>{
 const db=sqliteD1();const result=await auditedCall(db,'search_place','unknown',async()=>({content:[{type:'text',text:JSON.stringify({candidates:[{roadAddr:'PRIVATE ADDRESS',token:'SECRET TOKEN'}]})}]}));
 assert.equal(result._meta.auditPersisted,true);assert.match(result._meta.requestId,/^[a-f0-9-]{36}$/);
 const stored=db.sqlite.prepare('SELECT * FROM mcp_tool_call_log').all();assert.equal(stored[0].records,1);assert.doesNotMatch(JSON.stringify(stored),/PRIVATE|SECRET/);
 const bad=await auditedCall(db,'prepare_place_answer','unknown',async()=>{throw new Error('PRIVATE KEY');});assert.equal(bad.isError,true);assert.equal(bad._meta.errorCode,'INTERNAL_ERROR');assert.doesNotMatch(JSON.stringify(bad),/PRIVATE KEY/);
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
