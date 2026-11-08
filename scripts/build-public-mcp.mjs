import './pack-video-records.mjs';
import {build} from 'vite';
import {cp,mkdir,rm,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const output=new URL('../.mcp-public/',import.meta.url);
await rm(output,{recursive:true,force:true});
await mkdir(new URL('api/',output),{recursive:true});
await mkdir(new URL('public/',output),{recursive:true});
await build({configFile:false,root,publicDir:false,logLevel:'warn',resolve:{alias:{'@':root}},
 ssr:{noExternal:true,target:'node'},
 build:{ssr:fileURLToPath(new URL('../deploy/public-mcp/entry.ts',import.meta.url)),outDir:fileURLToPath(new URL('api/',output)),emptyOutDir:false,target:'node22',minify:false,sourcemap:false,
  rollupOptions:{output:{format:'esm',entryFileNames:'public-mcp.mjs',inlineDynamicImports:true}}}});
await cp(new URL('../public/research/video-records/',import.meta.url),new URL('public/research/video-records/',output),{recursive:true});
await writeFile(new URL('package.json',output),JSON.stringify({name:'seoul-place-docent-public-mcp',private:true,type:'module',engines:{node:'22.x'}})+'\n');
await writeFile(new URL('vercel.json',output),JSON.stringify({version:2,framework:null,buildCommand:'',installCommand:'',outputDirectory:'public',
 functions:{'api/public-mcp.mjs':{maxDuration:60,includeFiles:'public/research/video-records/**'}},
 rewrites:[{source:'/api/photo-location',destination:'/api/public-mcp?__route=photo-location'},{source:'/mcp',destination:'/api/public-mcp'},{source:'/health',destination:'/api/public-mcp?__route=health'}]},null,2)+'\n');
await writeFile(new URL('public/index.html',output),'<!doctype html><meta charset="utf-8"><title>서울 장소 도슨트 MCP</title><h1>서울 장소 도슨트 공개 MCP</h1><p>연결 경로: /mcp · 인증 없음 · 공개 역사 자료 조회 전용</p><a href="https://seoul-place-history.xeonire.chatgpt.site">홈페이지</a>');
console.log('MCP deployment prepared at '+fileURLToPath(output));
