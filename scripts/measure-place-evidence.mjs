// Offline fixture benchmark. Does not measure external API or client AI latency.
process.env.JUSO_API_KEY='fixture-benchmark';
delete process.env.BUILDING_API_KEY;
delete process.env.CLOSED_BUILDING_API_KEY;
delete process.env.CLOUDFLARE_ACCOUNT_ID;
const {POST}=await import('../app/mcp/route.ts');
const {signAddress}=await import('../lib/providers.ts');
const address={roadAddr:'서울특별시 성동구 마장로42길 16',jibunAddr:'서울특별시 성동구 마장동 784',siNm:'서울특별시',sggNm:'성동구',emdNm:'마장동',admCd:'1120010500',bdMgtSn:'fixture-building',bdNm:'세림아파트',lnbrMnnm:'784',lnbrSlno:'0',mtYn:'0',zipNo:''};
const token=await signAddress(address,process.env.JUSO_API_KEY);
const originalInfo=console.info;console.info=()=>{};
const timings=[];let bytes=0;
try{for(let i=0;i<6;i++){
 const start=performance.now();
 const response=await POST(new Request('https://benchmark.test/mcp',{method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:i,method:'tools/call',params:{name:'prepare_place_answer',arguments:{token}}})}));
 const text=await response.text();const parsed=JSON.parse(text);if(parsed.result?.isError)throw new Error('fixture lookup failed');
 bytes=Buffer.byteLength(text);timings.push(Math.round((performance.now()-start)*100)/100);
}}finally{console.info=originalInfo;}
console.log(JSON.stringify({mode:'offline_fixture_missing_building_key',coldMs:timings[0],warmMeanMs:Math.round(timings.slice(1).reduce((sum,x)=>sum+x,0)/5*100)/100,responseBytes:bytes,runs:timings},null,2));
