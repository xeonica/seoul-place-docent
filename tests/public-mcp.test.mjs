import test from 'node:test';
import assert from 'node:assert/strict';
import app from '../deploy/public-mcp/entry.ts';
import {configuredMcpOrigins} from '../lib/mcp-http.ts';
const rpc=(method,params={},extra={})=>new Request('https://public.test/mcp',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream',...extra},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});
test('public entry requires no cookie or bearer and exposes only MCP and health',async()=>{
 const init=await app.fetch(rpc('initialize',{protocolVersion:'2025-11-25'}));assert.equal(init.status,200);assert.equal(init.headers.has('www-authenticate'),false);
 assert.equal((await init.json()).result.protocolVersion,'2025-11-25');
 const list=await (await app.fetch(rpc('tools/list'))).json();assert.ok(list.result.tools.some(t=>t.name==='search_place'));assert.ok(list.result.tools.some(t=>t.name==='prepare_place_answer'));
 // Photo cards are on by default (MCP Apps + ChatGPT keys) and hang off show_place_photos so they
 // appear between paragraphs; prepare_place_answer itself no longer opens a gallery. ?gallery=off removes them.
 const prepare=list.result.tools.find(t=>t.name==='prepare_place_answer');assert.equal(prepare._meta?.ui,undefined);
 const card=list.result.tools.find(t=>t.name==='show_place_photos');assert.equal(card._meta?.ui?.resourceUri,'ui://seoul-docent/photo-gallery-v6.html');assert.equal(card._meta?.['openai/outputTemplate'],'ui://seoul-docent/photo-gallery-v6-skybridge.html');
 const offReq=new Request('https://public.test/mcp?gallery=off',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list',params:{}})});
 const offCard=(await (await app.fetch(offReq)).json()).result.tools.find(t=>t.name==='show_place_photos');assert.equal(offCard._meta?.ui,undefined);assert.equal(offCard._meta?.['openai/outputTemplate'],undefined);
 assert.equal((await app.fetch(new Request('https://public.test/mcp'))).status,405);
 assert.equal((await app.fetch(new Request('https://public.test/api/admin/mcp-stats'))).status,404);
 assert.equal((await app.fetch(rpc('ping',{}, {origin:'https://evil.test'}))).status,403);
});
test('only exact configured HTTPS origins get a CORS response',async()=>{
 const previous=process.env.MCP_ALLOWED_ORIGINS;
 try{
  process.env.MCP_ALLOWED_ORIGINS='https://chatgpt.com';
  const r=await app.fetch(rpc('ping',{}, {origin:'https://chatgpt.com'}));assert.equal(r.status,200);assert.equal(r.headers.get('access-control-allow-origin'),'https://chatgpt.com');
  assert.equal((await app.fetch(rpc('ping',{}, {origin:'https://chatgpt.com.evil.test'}))).status,403);
  const pre=await app.fetch(new Request('https://public.test/mcp',{method:'OPTIONS',headers:{origin:'https://chatgpt.com'}}));assert.equal(pre.status,204);assert.match(pre.headers.get('access-control-allow-headers'),/MCP-Protocol-Version/);
  assert.deepEqual(configuredMcpOrigins('*,null,http://bad.test,https://good.test/path,https://good.test,https://good.test'),['https://good.test']);
 }finally{if(previous===undefined)delete process.env.MCP_ALLOWED_ORIGINS;else process.env.MCP_ALLOWED_ORIGINS=previous;}
});
test('health signals a missing address key and does not expose secrets',async()=>{
 const before=process.env.JUSO_API_KEY;
 try{
  delete process.env.JUSO_API_KEY;assert.equal((await app.fetch(new Request('https://public.test/health'))).status,503);
  process.env.JUSO_API_KEY='SECRET_TEST_VALUE';
  const response=await app.fetch(new Request('https://public.test/api/public-mcp?__route=health'));assert.equal(response.status,200);
  const text=await response.text();assert.match(text,/"auth":"none"/);assert.doesNotMatch(text,/SECRET_TEST_VALUE/);
 }finally{if(before===undefined)delete process.env.JUSO_API_KEY;else process.env.JUSO_API_KEY=before;}
});

test('homepage never advertises a Sites URL or token URL as a public unauthenticated MCP',async()=>{
 const {publicMcpUrl}=await import('../lib/mcp-connection.ts');
 assert.equal(publicMcpUrl('https://public.test/mcp'),'https://public.test/mcp');
 for(const value of [undefined,'http://public.test/mcp','https://seoul-place-history.xeonire.chatgpt.site/mcp','https://user:secret@public.test/mcp','https://public.test/mcp?token=secret','https://public.test/mcp#secret'])assert.equal(publicMcpUrl(value),null);
});
