import {env} from './runtime-env';
import type {AuditRow} from './mcp-audit';
/** Writes metadata only to the operator's fixed HTTPS audit receiver. No tool inputs. */
export async function sendMcpAudit(row:AuditRow){
 const target=env.MCP_AUDIT_URL,token=env.MCP_AUDIT_TOKEN;if(!target||!token)return false;
 try{
  const url=new URL(target);
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/api/internal/mcp-audit')return false;
  const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','x-mcp-audit-token':token},body:JSON.stringify(row),redirect:'manual',signal:AbortSignal.timeout(8000)});
  if(!r.ok)return false;const receipt=await r.json() as {persisted?:boolean;requestId?:string};return receipt.persisted===true&&receipt.requestId===row.requestId;
 }catch{return false;}
}
