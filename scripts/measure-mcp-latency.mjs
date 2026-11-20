// Public HTTP MCP measurement. Never writes address tokens, secrets, or answer text.
import {writeFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
const args=process.argv.slice(2),option=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
const origin=option('--url','https://seoul-place-docent-mcp.vercel.app'),runs=Number(option('--runs','2'));
const output=resolve(option('--output','outputs/mcp-latency.json'));
const targets=['서울 성동구 왕십리로 410','서울 성동구 마장로42길 16','서울 중구 을지로 281','한성대학교','서울 성동구 무학로6길 50'];
const detailLevel=option('--detail','standard'),flow=option('--flow','both');
const report={observedAt:new Date().toISOString(),origin,detailLevel,runs,scope:'HTTP client in this machine; not ChatGPT generation/UI; first sample is not proof of serverless cold start',externalAiMs:null,renderMs:null,samples:[],addresses:[]};
mkdirSync(dirname(output),{recursive:true});
const bytes=s=>Buffer.byteLength(s),save=()=>writeFileSync(output,JSON.stringify(report,null,2));
let id=0;
async function call(method,params={}){
 const startedAt=new Date().toISOString(),start=performance.now();
 const response=await fetch(origin+'/mcp',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:++id,method,params}),signal:AbortSignal.timeout(60000)});
 const headersMs=performance.now()-start,text=await response.text(),end=performance.now(),rpc=JSON.parse(text),r=rpc.result;
 const p=r?.content?.[0]?.text?JSON.parse(r.content[0].text):r;
 return {p,metric:{tool:params.name||method,startedAt,endedAt:new Date().toISOString(),httpStatus:response.status,ok:response.ok&&!rpc.error&&!r?.isError,headersMs:Math.round(headersMs),totalMs:Math.round(end-start),wireBytes:bytes(text),textBytes:bytes(r?.content?.filter(c=>c.type==='text').map(c=>c.text).join('')||''),structuredBytes:bytes(JSON.stringify(r?.structuredContent||{})),estimatedWireTokens:{lower:Math.ceil(bytes(text)/4),upper:Math.ceil(bytes(text)/2),method:'UTF8 byte heuristic, not tokenizer or observed model input'},server:p?.timing||null,receiptTimings:r?._meta?.serverTimings||null,serverTimingHeader:response.headers.get('server-timing')}};
}
const invoke=(name,args)=>call('tools/call',{name,arguments:args});
report.initialization=(await call('initialize',{protocolVersion:'2025-11-25'})).metric;
report.discovery=(await call('tools/list')).metric;
try{report.health=await (await fetch(origin+'/health')).json();delete report.health.dataset;delete report.health.researchCatalog;}catch{}
for(const query of targets)for(let run=0;run<runs;run++){
 const question='이 장소와 주변 동네의 역사를 출처와 함께 안내해 주세요.';
 if(flow!=='direct'){
  const start=performance.now(),search=await invoke('search_place',{query}),sample={query,run,flow:'sequential',steps:[search.metric]};
  if(search.p?.candidates?.length===1&&search.p.total===1){const candidate=search.p.candidates[0];if(!report.addresses.some(a=>a.bdMgtSn===candidate.bdMgtSn)){const {token,...safe}=candidate;report.addresses.push(safe);}
   const history=await invoke('get_place_history',{token:candidate.token}),prepared=await invoke('prepare_place_answer',{token:candidate.token,question,detailLevel});sample.steps.push(history.metric,prepared.metric);sample.evidence=summary(prepared.p);
  }else sample.needsChoice=true;
  sample.totalMs=Math.round(performance.now()-start);report.samples.push(sample);save();console.log(JSON.stringify({query,run,flow:sample.flow,totalMs:sample.totalMs,bytes:sample.steps.reduce((s,m)=>s+m.wireBytes,0),needsChoice:!!sample.needsChoice}));
 }
 if(flow!=='sequential'){const start=performance.now(),prepared=await invoke('prepare_place_answer',{address:query,question,detailLevel});const sample={query,run,flow:'direct',steps:[prepared.metric],totalMs:Math.round(performance.now()-start),needsChoice:!!prepared.p?.needsChoice,evidence:summary(prepared.p)};report.samples.push(sample);save();console.log(JSON.stringify({query,run,flow:sample.flow,totalMs:sample.totalMs,bytes:prepared.metric.wireBytes,needsChoice:sample.needsChoice}));}
}
function summary(p){return {status:p?.status,ids:p?.neighborhood?.records?.map(r=>r.id),approved:p?.evidence?.diagnostics?.usableEvidenceCount,photos:p?.visuals?.photos?.length,cache:p?.researchCandidates?.cacheStatus,bigquery:p?.bigQueryResearch?.diagnosticStatus|| (p?.details?.externalCandidatesDeferred?'deferred':null)};}
const percentile=(a,q)=>a.length?[...a].sort((x,y)=>x-y)[Math.ceil(a.length*q)-1]:null;
report.statistics=Object.fromEntries(['sequential','direct'].map(flow=>{const selected=report.samples.filter(s=>s.flow===flow&&!s.needsChoice&&s.steps.every(m=>m.ok));return [flow,{n:selected.length,p50Ms:percentile(selected.map(s=>s.totalMs),.5),p95Ms:percentile(selected.map(s=>s.totalMs),.95),p50Bytes:percentile(selected.map(s=>s.steps.reduce((sum,m)=>sum+m.wireBytes,0)),.5)}];}));save();console.log(JSON.stringify(report.statistics));
