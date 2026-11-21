import './build-public-mcp.mjs';
import {cp,mkdir,rm,copyFile,writeFile} from 'node:fs/promises';
const output=new URL('../.vercel/output/',import.meta.url);
await rm(output,{recursive:true,force:true});
await mkdir(new URL('functions/mcp.func/',output),{recursive:true});
await mkdir(new URL('static/',output),{recursive:true});
await copyFile(new URL('../.mcp-public/api/public-mcp.mjs',import.meta.url),new URL('functions/mcp.func/app.mjs',output));
await copyFile(new URL('../.mcp-public/public/index.html',import.meta.url),new URL('static/index.html',output));
await copyFile(new URL('../deploy/public-mcp/node-handler.mjs',import.meta.url),new URL('functions/mcp.func/index.mjs',output));
await cp(new URL('../.mcp-public/public/research/video-records/',import.meta.url),new URL('functions/mcp.func/public/research/video-records/',output),{recursive:true});
await cp(new URL('../.mcp-public/public/research/article-evidence/',import.meta.url),new URL('functions/mcp.func/public/research/article-evidence/',output),{recursive:true});
await cp(new URL('../.mcp-public/public/research/seoul-district-collection/shards/',import.meta.url),new URL('functions/mcp.func/public/research/seoul-district-collection/shards/',output),{recursive:true});
await writeFile(new URL('functions/mcp.func/.vc-config.json',output),JSON.stringify({runtime:'nodejs22.x',handler:'index.mjs',launcherType:'Nodejs',maxDuration:60}));
await writeFile(new URL('config.json',output),JSON.stringify({version:3,routes:[{src:'/health',dest:'/mcp?__route=health'},{src:'/img',dest:'/mcp?__route=img'},{handle:'filesystem'},{src:'/.*',status:404}]}));
console.log('Vercel Build Output API package prepared.');

await (async()=>{const url="https://seoul-place-docent-mcp.vercel.app/mcp";for(const [method,params,id] of [["initialize",{protocolVersion:"2025-11-25",capabilities:{},clientInfo:{name:"registration-diagnostic",version:"1"}},1],["notifications/initialized",{},null],["tools/list",{},2]]){try{const r=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json","Accept":"application/json",...(method==="initialize"?{}:{"MCP-Protocol-Version":"2025-11-25"})},body:JSON.stringify({jsonrpc:"2.0",method,params,...(id===null?{}:{id})}),signal:AbortSignal.timeout(15000)});const raw=await r.text();const x=raw?JSON.parse(raw):{};console.log("MCP_PROBE",method,r.status,x.result?.protocolVersion??x.result?.tools?.map(t=>[t.name,t.inputSchema?.type])??x.error??null)}catch(e){console.log("MCP_PROBE",method,String(e))}}})();
