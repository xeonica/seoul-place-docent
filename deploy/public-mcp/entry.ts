import {handleImageProxy} from '../../lib/image-proxy-handler';
import {deploymentInfo} from '../../lib/deployment-info';
import {galleryUri} from '../../lib/docent-gallery';
import {POST,GET,OPTIONS,DELETE,HEAD} from '../../app/mcp/route';
import {env} from '../../lib/runtime-env';
import {configuredMcpOrigins,originError,mcpHeaders} from '../../lib/mcp-http';
import {researchCatalogStatus} from '../../lib/research-catalog';
import {archiveWorkbookStatus} from '../../lib/archive-workbook';

/** Public, read-only MCP deployment. No Sites dispatcher or OAuth middleware. */
export default {async fetch(request:Request):Promise<Response>{
 const url=new URL(request.url);const path=url.pathname;
 if(path==='/img'||['/mcp','/api/public-mcp'].includes(path)&&url.searchParams.get('__route')==='img'){
  return handleImageProxy(request);
 }
 const origin=request.headers.get('origin');
 const allowed=configuredMcpOrigins(env.MCP_ALLOWED_ORIGINS);
 const rejected=originError(request,allowed);if(rejected)return rejected;
 if(path==='/health'||['/mcp','/api/public-mcp'].includes(path)&&url.searchParams.get('__route')==='health'){
  if(request.method!=='GET'&&request.method!=='HEAD')return new Response(null,{status:405,headers:{Allow:'GET, HEAD'}});
  const configured=!!env.JUSO_API_KEY;
  return Response.json({deployment:deploymentInfo(process.env),galleryUri,evidenceBackendConfigured:!!env.DB,coordinatesConfigured:!!env.KAKAO_REST_API_KEY,status:configured?'ready':'not_configured',service:'seoul-place-docent-public-mcp',auth:'none',addressConfigured:configured,photoGpsConfigured:!!env.KAKAO_REST_API_KEY||env.MCP_MAP_ADDRESS_URL==='https://seoul-place-history.xeonire.chatgpt.site/api/map-address',auditConfigured:!!env.DB||!!(env.MCP_AUDIT_URL&&env.MCP_AUDIT_TOKEN),auditStorage:env.DB?'d1':env.MCP_AUDIT_URL&&env.MCP_AUDIT_TOKEN?'https-receiver':'none',modelCalls:0,mcpPath:'/mcp',dataset:archiveWorkbookStatus,researchCatalog:researchCatalogStatus}, {status:configured?200:503,headers:mcpHeaders});
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
