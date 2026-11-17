import {z} from 'zod';
import {recordMcpCall} from './mcp-audit';
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const tools=['search_place','extract_photo_location','resolve_photo_location','get_place_history','prepare_place_answer','generate_place_answer','validate_place_answer','get_answer_stats','get_archive_stats'] as const;
const bigQuerySchema=z.object({dataSource:z.enum(['json','json+bigquery']),bigQueryAttempted:z.literal(true),bigQueryJobId:z.string().max(200).nullable(),bigQueryRecords:z.number().int().min(0).max(20),bigQueryMs:z.number().int().min(0).max(300000).nullable(),bigQueryCacheHit:z.boolean().nullable(),bigQueryFallback:z.boolean(),bigQueryErrorCode:z.string().max(64).regex(/^[A-Za-z0-9_-]*$/).nullable()}).strict();
const rowSchema=z.object({requestId:z.string().uuid(),tool:z.enum(tools),at:z.number().int(),ok:z.boolean(),records:z.number().int().min(0).max(10000),ms:z.number().int().min(0).max(300000),errorType:z.string().max(64).regex(/^[a-zA-Z0-9_-]*$/).nullable(),client:z.enum(['unknown','claude_unverified','chatgpt_unverified','gemini_unverified']),validation:z.boolean(),bigQuery:bigQuerySchema.optional()}).strict();
function equal(a:string,b:string){if(!a||a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
export function auditReceiver(settings:Pick<Cloudflare.Env,'DB'|'MCP_AUDIT_TOKEN'>){return async function receive(request:Request){
 if(!settings.MCP_AUDIT_TOKEN)return Response.json({error:'Audit receiver unavailable'},{status:503,headers});
 if(!equal(request.headers.get('x-mcp-audit-token')||'',settings.MCP_AUDIT_TOKEN))return Response.json({error:'Unauthorized'},{status:403,headers});
 const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return Response.json({error:'Origin not allowed'},{status:403,headers});
 if(!settings.DB)return Response.json({error:'Storage unavailable'},{status:503,headers});
 if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')||''))return Response.json({error:'JSON required'},{status:415,headers});
 let size=0;const chunks:Uint8Array[]=[];const reader=request.body?.getReader();
 if(reader){while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>2048){await reader.cancel();return Response.json({error:'Too large'},{status:413,headers});}chunks.push(part.value);}}
 try{
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  const row=rowSchema.parse(JSON.parse(new TextDecoder().decode(bytes)));
  if(Math.abs(Date.now()-row.at)>5*60*1000||row.validation!==(row.tool==='validate_place_answer'&&row.ok)||(!row.ok&&row.records!==0)||(row.bigQuery&&(!row.bigQuery.bigQueryAttempted||!['prepare_place_answer','generate_place_answer','validate_place_answer'].includes(row.tool))))return Response.json({error:'Invalid metadata'},{status:400,headers});
  const persisted=await recordMcpCall(settings.DB,row);
  return Response.json({persisted,requestId:row.requestId},{status:persisted?200:503,headers});
 }catch{return Response.json({error:'Invalid metadata'},{status:400,headers});}
}
}
