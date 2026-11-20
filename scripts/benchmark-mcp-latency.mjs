// Local HTTP + real packaged data, fixture providers. Not live API/AI/UI latency.
import {createServer} from 'node:http';
import {once} from 'node:events';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {POST} from '../app/mcp/route.ts';
import {handleImageProxy} from '../lib/image-proxy-handler.ts';
import {signAddress} from '../lib/providers.ts';
import {clearBigQueryMetadataCacheForTests} from '../lib/bigquery-place.ts';
const json=path=>JSON.parse(readFileSync(new URL('../'+path,import.meta.url),'utf8'));
const field=json('tests/fixtures/field-addresses.json');
const places=[json('tests/fixtures/centras-address.json'),field[0],json('tests/fixtures/eulji-latency-address.json'),field[1],field[3]];
// 102 calls at six normal repetitions fits the existing 120/min instance limiter.
const output=resolve(process.argv[2]||'outputs/latency-local.json'),runs=Number(process.env.BENCHMARK_RUNS||6);
const levels=process.env.BENCHMARK_MODE?[process.env.BENCHMARK_MODE]:['standard','brief'];
const percentile=(a,q)=>a.length?[...a].sort((x,y)=>x-y)[Math.ceil(a.length*q)-1]:null;
const report={scope:'local loopback HTTP; real static data; fixture API responses; not Vercel cold start/ChatGPT',runs,externalAiMs:null,uiMs:null,samples:[],integrityFailures:0};
process.env.JUSO_API_KEY='benchmark-fixture-key';for(const k of ['VERCEL','CLOUDFLARE_ACCOUNT_ID','MCP_AUDIT_URL','BUILDING_API_KEY','CLOSED_BUILDING_API_KEY','KAKAO_REST_API_KEY'])delete process.env[k];
const nativeFetch=globalThis.fetch,info=console.info;console.info=()=>{};
let scenario='normal',upstreams=0,source=places[0];
globalThis.fetch=async(url,init)=>{
 if(String(url).startsWith('http://127.0.0.1:'))return nativeFetch(url,init);
 upstreams++;
 if(String(url).includes('business.juso.go.kr'))return Response.json({results:{common:{errorCode:'0',totalCount:'1'},juso:[source]}});
 if(String(url).includes('sts.googleapis'))return Response.json({access_token:'fixture'});
 if(String(url).includes('iamcredentials'))return Response.json({accessToken:'fixture'});
 if(String(url).includes('bigquery.googleapis')){
  if(scenario==='bigquery_timeout')return new Promise((_,reject)=>{if(init.signal.aborted)reject(init.signal.reason);else init.signal.addEventListener('abort',()=>reject(init.signal.reason),{once:true});});
  return Response.json({jobComplete:true,rows:[]});
 }
 return new Response(null,{status:503});
};
const server=createServer(async(req,res)=>{try{const chunks=[];for await(const c of req)chunks.push(c);const r=await POST(new Request('http://127.0.0.1/mcp',{method:'POST',headers:{...req.headers},body:Buffer.concat(chunks)}));res.writeHead(r.status,Object.fromEntries(r.headers));res.end(await r.text());}catch{res.writeHead(500);res.end('{}');}});
server.listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+server.address().port;
async function invoke(name,args){const start=performance.now(),r=await fetch(base+'/mcp',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream','x-vercel-oidc-token':'fixture'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})}),headersMs=performance.now()-start,text=await r.text(),rpc=JSON.parse(text);const packet=rpc.result?.content?.[0]?.text?JSON.parse(rpc.result.content[0].text):{};return {packet,result:rpc.result,metric:{ms:Math.round(performance.now()-start),headersMs:Math.round(headersMs),bytes:Buffer.byteLength(text),ok:r.ok&&!rpc.error&&!rpc.result?.isError,server:packet.timing,cache:packet.timing?.bigQuery||null,candidateCache:packet.researchCandidates?.cacheStatus,records:packet.neighborhood?.records?.length||0,approved:packet.evidence?.diagnostics?.usableEvidenceCount||0}};}
try{
 for(const address of places){source=address;const token=await signAddress(address,process.env.JUSO_API_KEY);let reference;
  for(const detailLevel of levels)for(let i=0;i<runs;i++){const r=await invoke('prepare_place_answer',{token,detailLevel});if(!r.metric.ok)report.integrityFailures++;const ids=r.packet.neighborhood?.records?.map(x=>x.id)||[];if(!reference)reference=ids;if(JSON.stringify(ids)!==JSON.stringify(reference))report.integrityFailures++;report.samples.push({scenario:'normal',place:address.roadAddr,detailLevel,state:i===0?'first_observed_after_module_load':'warm',...r.metric});}
 }
 for(const concurrency of [5,10])for(const detailLevel of ['standard','brief']){const token=await signAddress(places[0],process.env.JUSO_API_KEY);const batch=await Promise.all(Array.from({length:concurrency},()=>invoke('prepare_place_answer',{token,detailLevel})));report.samples.push(...batch.map(r=>({scenario:'concurrency',concurrency,detailLevel,...r.metric})));}
 Object.assign(process.env,{VERCEL:'1',GCP_PROJECT_ID:'fixture',GCP_PROJECT_NUMBER:'1',GCP_WORKLOAD_IDENTITY_POOL_ID:'pool',GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID:'provider',GCP_SERVICE_ACCOUNT_EMAIL:'fixture@example.org',BIGQUERY_LOCATION:'asia-northeast3'});
 scenario='bigquery_timeout';clearBigQueryMetadataCacheForTests();const token=await signAddress(places[0],process.env.JUSO_API_KEY);
 for(const detailLevel of ['standard','brief'])for(let run=0;run<3;run++){const r=await invoke('prepare_place_answer',{token,detailLevel});report.samples.push({scenario,run,detailLevel,...r.metric});}
 scenario='d1_failure';delete process.env.VERCEL;Object.assign(process.env,{CLOUDFLARE_ACCOUNT_ID:'fixture',CLOUDFLARE_D1_DATABASE_ID:'fixture',CLOUDFLARE_D1_API_TOKEN:'fixture'});
 for(const detailLevel of ['standard','brief'])for(let run=0;run<3;run++){const r=await invoke('prepare_place_answer',{token,detailLevel});report.samples.push({scenario,run,detailLevel,...r.metric,evidenceStatus:r.packet.evidence?.status});}
 const before=upstreams;const proxy=await handleImageProxy(new Request('https://fixture.test/img?u='+encodeURIComponent('https://museum.seoul.go.kr:8088/component/archv/data/ND_thumbnail.tmb?fileSn=300&fileId=H-TRNS-8010-387&w=800&h=800')));report.imageFailure={httpStatus:proxy.status,providerCalls:upstreams-before,scope:'fixture 503 upstream; image fetch is outside prepare pipeline'};
}finally{server.close();await once(server,'close');globalThis.fetch=nativeFetch;console.info=info;}
report.summary=Object.fromEntries(['normal','concurrency','bigquery_timeout','d1_failure'].flatMap(scenario=>['standard','brief'].map(detail=>{const a=report.samples.filter(s=>s.scenario===scenario&&s.detailLevel===detail),t=a.map(s=>s.ms);return [scenario+':'+detail,{n:a.length,p50Ms:percentile(t,.5),p95Ms:percentile(t,.95),p50Bytes:percentile(a.map(s=>s.bytes),.5),p50HeadersMs:percentile(a.map(s=>s.headersMs),.5),failureRate:a.length?a.filter(s=>!s.ok).length/a.length:0,scope:'local fixture HTTP only'}];})));
report.protocolFailures=report.samples.filter(s=>!s.ok).length;
mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify(report,null,2));console.log(JSON.stringify({summary:report.summary,integrityFailures:report.integrityFailures,protocolFailures:report.protocolFailures,imageFailure:report.imageFailure}));
if(report.integrityFailures||report.protocolFailures)process.exitCode=1;
