import {handlePhotoLocation} from '../../lib/photo-upload';
import {POST,GET,OPTIONS,DELETE,HEAD} from '../../app/mcp/route';
import {env} from '../../lib/runtime-env';
import {configuredMcpOrigins,originError,mcpHeaders} from '../../lib/mcp-http';
import {archiveWorkbookStatus} from '../../lib/archive-workbook';

/** Public, read-only MCP deployment. No Sites dispatcher or OAuth middleware. */
export default {async fetch(request:Request):Promise<Response>{
 const origin=request.headers.get('origin');
 const allowed=configuredMcpOrigins(env.MCP_ALLOWED_ORIGINS);
 const rejected=originError(request,allowed);if(rejected)return rejected;
 const url=new URL(request.url);const path=url.pathname;
 if(path==='/api/photo-location'||['/api/public-mcp','/mcp'].includes(path)&&url.searchParams.get('__route')==='photo-location')return handlePhotoLocation(request,env,allowed);
 if(path==='/health'||['/mcp','/api/public-mcp'].includes(path)&&url.searchParams.get('__route')==='health'){
  if(request.method!=='GET'&&request.method!=='HEAD')return new Response(null,{status:405,headers:{Allow:'GET, HEAD'}});
  const configured=!!env.JUSO_API_KEY;
  return Response.json({status:configured?'ready':'not_configured',service:'seoul-place-docent-public-mcp',auth:'none',addressConfigured:configured,auditConfigured:!!env.DB||!!(env.MCP_AUDIT_URL&&env.MCP_AUDIT_TOKEN),auditStorage:env.DB?'d1':env.MCP_AUDIT_URL&&env.MCP_AUDIT_TOKEN?'https-receiver':'none',modelCalls:0,mcpPath:'/mcp',dataset:archiveWorkbookStatus}, {status:configured?200:503,headers:mcpHeaders});
 }
 if(!['/mcp','/api/public-mcp'].includes(path))return new Response('Not found',{status:404,headers:mcpHeaders});
 const handler=({POST,GET,HEAD,DELETE,OPTIONS} as Record<string,(r:Request)=>Response|Promise<Response>>)[request.method];
 let response=handler?await handler(request):new Response(null,{status:405,headers:{...mcpHeaders,Allow:'POST, OPTIONS'}});
 if(origin&&(origin===new URL(request.url).origin||allowed.includes(origin))){
  const headers=new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin',origin);headers.set('Vary','Origin');
  headers.set('Access-Control-Allow-Methods','POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers','Content-Type, Accept, MCP-Protocol-Version, MCP-Method, MCP-Name');
  response=new Response(response.body,{status:response.status,headers});
 }
 return response;
}};
