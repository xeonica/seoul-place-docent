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

const {createServer}=await import('node:http');
const {execFile}=await import('node:child_process');
const {promisify}=await import('node:util');
const {default:handler}=await import(new URL('functions/mcp.func/index.mjs',output));
const local=createServer((req,res)=>handler(req,res).catch(error=>{console.error(error);res.statusCode=500;res.end();}));
await new Promise(resolve=>local.listen(0,'127.0.0.1',resolve));
try {
 for(const [label,url] of [['BEFORE','https://seoul-place-docent-mcp.vercel.app/mcp'],['AFTER','http://127.0.0.1:'+local.address().port+'/mcp']]){
  try{
   const result=await promisify(execFile)(process.execPath,['scripts/check-mcp-registration.mjs',url],{timeout:90000});
   console.log('REGISTRATION_'+label,result.stdout.trim());
  }catch(error){console.log('REGISTRATION_'+label+'_FAIL',error.stderr||error.message);}
 }
}finally{await new Promise(resolve=>local.close(resolve));}
