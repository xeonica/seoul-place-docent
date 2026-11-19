import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import handler from '../.vercel/output/functions/mcp.func/index.mjs';
test('Vercel Node HTTP adapter serves real unauthenticated MCP HTTP and health requests',async()=>{
 const server=createServer((req,res)=>{handler(req,res).catch(error=>{res.statusCode=500;res.end(String(error));});});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${server.address().port}`;const before=process.env.JUSO_API_KEY;
 try{
  const response=await fetch(base+'/mcp',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-11-25'}})});
  assert.equal(response.status,200);assert.equal(response.headers.has('www-authenticate'),false);assert.equal((await response.json()).result.protocolVersion,'2025-11-25');
  delete process.env.JUSO_API_KEY;
  for(const path of ['/health','/mcp?__route=health']){const r=await fetch(base+path);assert.equal(r.status,503);assert.equal((await r.json()).addressConfigured,false);}
  assert.equal((await fetch(base+'/api/admin/mcp-stats')).status,404);
 }finally{if(before===undefined)delete process.env.JUSO_API_KEY;else process.env.JUSO_API_KEY=before;await new Promise(resolve=>server.close(resolve));}
});

test('built image rewrite and Node adapter preserve the source query and response headers', async t => {
 const {default:config}=await import('../.vercel/output/config.json',{with:{type:'json'}});
 // Transport must use a registered asset: the source identity gate remains active.
 const proofs=JSON.parse(readFileSync(new URL('../data/photo-asset-proofs.json',import.meta.url),'utf8'));
 const original=Object.values(proofs).filter(p=>p.displayAllowed).flatMap(p=>p.displayImageUrls).find(url=>url.includes('?'));
 assert.ok(original,'registered query-bearing image fixture required');
 const requestPath='/img?u='+encodeURIComponent(original);
 const bytes=Buffer.from([255,216,255]);
 const fetchRequest=globalThis.fetch;
 const upstream=t.mock.method(globalThis,'fetch',async url=>{
  assert.equal(url,original);
  return new Response(bytes,{headers:{'Content-Type':'image/jpeg','Content-Disposition':'attachment'}});
 });
 const server=createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  const rule=config.routes.find(route=>route.src===url.pathname);
  const destination=new URL(rule.dest,url);
  for(const [key,value] of url.searchParams)destination.searchParams.append(key,value);
  req.url=destination.pathname+destination.search;
  handler(req,res).catch(error=>{res.statusCode=500;res.end(String(error));});
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const url=`http://127.0.0.1:${server.address().port}`+requestPath;
  for(const method of ['GET','HEAD']){
   const response=await fetchRequest(url,{method,headers:{Origin:'https://claude.ai'}});
   assert.equal(response.status,200);
   assert.equal(response.headers.get('content-type'),'image/jpeg');
   assert.equal(response.headers.get('cache-control'),'public, max-age=86400, s-maxage=604800');
   assert.equal(response.headers.get('access-control-allow-origin'),'*');
   assert.equal(response.headers.get('content-disposition'),null);
   assert.deepEqual(Buffer.from(await response.arrayBuffer()),method==='GET'?bytes:Buffer.alloc(0));
  }
  assert.equal(upstream.mock.callCount(),2);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
