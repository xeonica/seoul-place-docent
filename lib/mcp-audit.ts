import {sendMcpAudit} from './mcp-audit-remote';
import {isObject, type McpToolResult} from './mcp-protocol';

export type AuditRow = {requestId:string; tool:string; at:number; ok:boolean; records:number; ms:number; errorType:string|null; client:string; validation:boolean};
const schema = `CREATE TABLE IF NOT EXISTS mcp_tool_call_log (
 request_id TEXT PRIMARY KEY, tool TEXT NOT NULL, at INTEGER NOT NULL,
 ok INTEGER NOT NULL, records INTEGER NOT NULL, ms INTEGER NOT NULL,
 error_type TEXT, client TEXT NOT NULL, validation INTEGER NOT NULL)`;
const initialized=new WeakMap<D1Database,Promise<void>>();
export async function ensureMcpAudit(db:D1Database) {
 let task=initialized.get(db);
 if(!task){task=(async()=>{await db.prepare(schema).run();await db.prepare('CREATE INDEX IF NOT EXISTS mcp_tool_call_log_at ON mcp_tool_call_log(at)').run();})();initialized.set(db,task);}
 try {await task;}catch(error){initialized.delete(db);throw error;}
}
// Only a fixed client family is retained. Client-supplied identity is never proof.
export function clientHint(request:Request):string {
 const ua=request.headers.get('user-agent')||'';
 return /claude|anthropic/i.test(ua)?'claude_unverified':/chatgpt|openai/i.test(ua)?'chatgpt_unverified':/gemini/i.test(ua)?'gemini_unverified':'unknown';
}
export function returnedRecords(result:McpToolResult):number {
 if(result.isError)return 0;
 try {
  const value=JSON.parse(result.content[0]?.text||'{}');
  if(!isObject(value))return 0;
  const neighborhood=isObject(value.neighborhood)?value.neighborhood:{};
  for(const records of [value.candidates,value.records,neighborhood.records,neighborhood.scenes,value.sources])if(Array.isArray(records))return records.length;
 }catch { /* Non-JSON text is not a returned source record. */ }
 return 0;
}
export async function recordMcpCall(db:D1Database|undefined,row:AuditRow) {
 if(!db)return sendMcpAudit(row);
 try {
  await ensureMcpAudit(db);
  await db.prepare('INSERT INTO mcp_tool_call_log (request_id,tool,at,ok,records,ms,error_type,client,validation) VALUES (?,?,?,?,?,?,?,?,?)')
   .bind(row.requestId,row.tool,row.at,row.ok?1:0,row.records,row.ms,row.errorType,row.client,row.validation?1:0).run();
  return true;
 }catch { return false; }
}
export async function auditedCall(db:D1Database|undefined,tool:string,client:string,execute:()=>Promise<McpToolResult>) {
 const requestId=crypto.randomUUID(),at=Date.now();
 let result:McpToolResult;
 try { result=await execute(); }
 catch { result={content:[{type:'text',text:'자료 조회에 실패했습니다. 잠시 후 다시 시도해 주세요.'}],isError:true,errorType:'internal_error'}; }
 const row:AuditRow={requestId,tool,at,ok:!result.isError,records:returnedRecords(result),ms:Math.max(0,Date.now()-at),errorType:result.isError?(result.errorType||'tool_error'):null,client,validation:tool==='validate_place_answer'&&!result.isError};
 const persisted=await recordMcpCall(db,row);
 // Structured fallback contains no inputs, exception messages, IP or raw client headers.
 if(!persisted)console.info(JSON.stringify({event:'mcp_tool_call',...row,persisted:false}));
 const {errorType: _errorType,...publicResult}=result;
 const receipt={requestId,auditPersisted:persisted,clientIdentityVerified:false};
 return {...publicResult,content:[...publicResult.content,{type:'text' as const,text:JSON.stringify({serverReceipt:receipt})}],_meta:receipt};
}
export async function mcpUsageStats(db:D1Database|undefined,now=Date.now()) {
 const limits={timezone:'Asia/Seoul',unmeasured:['사용자 AI 최종 답변 완료','사용자 AI 실제 토큰 소비량','반환 자료가 최종 답변에 사용되었는지'],clientIdentity:'클라이언트 표시는 자기신고 추정이며 인증된 AI 서비스가 아닙니다.'};
 if(!db)return {...limits,available:false,note:'D1 미설정: 영구 통계 없음. 호스팅 서버의 mcp_tool_call 로그를 확인하세요.'};
 await ensureMcpAudit(db);
 const since=Math.floor((now+9*3600000)/86400000)*86400000-9*3600000;
 const summary=await db.prepare(`SELECT count(*) AS calls,coalesce(sum(ok),0) AS succeeded,coalesce(sum(CASE WHEN ok=0 THEN 1 ELSE 0 END),0) AS errors,coalesce(sum(CASE WHEN records>0 AND ok=1 THEN 1 ELSE 0 END),0) AS returned,avg(ms) AS averageMs,coalesce(sum(CASE WHEN tool='validate_place_answer' THEN 1 ELSE 0 END),0) AS validationRequests,coalesce(sum(validation),0) AS validationsExecuted FROM mcp_tool_call_log WHERE at>=? AND at<=?`).bind(since,now).first<Record<string,number|null>>();
 const count=Number(summary?.calls||0);
 const p95=count?await db.prepare('SELECT ms FROM mcp_tool_call_log WHERE at>=? AND at<=? ORDER BY ms LIMIT 1 OFFSET ?').bind(since,now,Math.ceil(count*.95)-1).first<{ms:number}>():null;
 const byTool=await db.prepare('SELECT tool,count(*) AS calls FROM mcp_tool_call_log WHERE at>=? AND at<=? GROUP BY tool ORDER BY calls DESC,tool').bind(since,now).all();
 const recent=await db.prepare('SELECT request_id,tool,at,ok,records,ms,error_type,client,validation FROM mcp_tool_call_log ORDER BY at DESC LIMIT 50').all();
 return {...limits,available:true,since,calls:count,succeeded:Number(summary?.succeeded||0),errors:Number(summary?.errors||0),returned:Number(summary?.returned||0),averageMs:summary?.averageMs??null,validationRequests:Number(summary?.validationRequests||0),validationsExecuted:Number(summary?.validationsExecuted||0),p95Ms:p95?.ms??null,byTool:byTool.results,recent:recent.results};
}
