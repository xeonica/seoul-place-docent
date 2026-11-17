'use client';
import {useRef,useState} from 'react';
import type {mcpUsageStats} from '@/lib/mcp-audit';
import '../../docent.css';
type Stats=Awaited<ReturnType<typeof mcpUsageStats>>;
export default function McpAdminPage() {
 const generation=useRef(0);
 const [key,setKey]=useState(''),[stats,setStats]=useState<Stats|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function refresh(){const current=++generation.current;setBusy(true);setError('');setStats(null);try {const r=await fetch('/api/admin/mcp-stats',{headers:{'x-archive-admin':key},cache:'no-store'});const body=await r.json() as Stats & {error?:string};if(!r.ok)throw new Error(body.error||'조회 실패');if(current===generation.current)setStats(body);}catch(e){if(current===generation.current)setError(e instanceof Error?e.message:'조회 실패');}finally{if(current===generation.current)setBusy(false);}}
 return <main className="mcp-admin"><a href="/">← 홈페이지</a><h1>MCP 사용 통계</h1><p>관리자 전용 · 오늘은 서울 시간 기준입니다. 키는 이 화면의 메모리에서만 사용합니다.</p>
  <form onSubmit={e=>{e.preventDefault();void refresh();}}><label>관리자 키<input type="password" autoComplete="off" value={key} onChange={e=>setKey(e.target.value)}/></label><button disabled={busy}>{busy?'조회 중':'통계 조회'}</button><button type="button" onClick={()=>{generation.current++;setBusy(false);setKey('');setStats(null);setError('');}}>잠그기</button></form>
  {error&&<p role="alert">{error}</p>}
  {stats&&<><p>서버 호출 성공과 자료 반환은 기록으로 확인합니다. AI 답변 생성·토큰 소비·자료의 실제 사용은 서버만으로 증명할 수 없습니다.</p>{'calls' in stats?<>
   <dl className="mcp-metrics">{[['오늘 호출',stats.calls],['성공',stats.succeeded],['오류',stats.errors],['자료 반환',stats.returned],['평균 응답 ms',stats.averageMs],['P95 ms',stats.p95Ms],['BigQuery 조회',stats.bigQueryCalls],['BigQuery 반환',stats.bigQueryRecords],['BigQuery 복구',stats.bigQueryFallbacks],['BigQuery 평균 ms',stats.bigQueryAverageMs],['검증 요청',stats.validationRequests],['검증 실행',stats.validationsExecuted]].map(([label,value])=><div key={String(label)}><dt>{String(label)}</dt><dd>{value==null?'—':Math.round(Number(value)).toLocaleString()}</dd></div>)}</dl>
   <h2>도구별 호출</h2><ul>{stats.byTool?.map((row,i)=><li key={i}>{String(row.tool)}: {String(row.calls)}</li>)}</ul>
   <h2>최근 50건 · 서버 요청 ID 대조</h2><p>{stats.clientIdentity}</p><div className="mcp-table"><table><thead><tr>{['요청 ID','도구','서울 시각','성공','자료 수','ms','오류','클라이언트(미인증)','검증 실행','자료 소스','BigQuery 건수','BigQuery ms','복구','작업 ID'].map(t=><th key={t}>{t}</th>)}</tr></thead><tbody>{stats.recent?.map((r,i)=><tr key={i}>{[r.request_id,r.tool,new Date(Number(r.at)).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}),r.ok,r.records,r.ms,r.error_type??'—',r.client,r.validation,r.data_source??'json',r.bigquery_records??'—',r.bigquery_ms??'—',r.bigquery_fallback??'—',r.bigquery_job_id??'—'].map((v,j)=><td key={j}>{String(v)}</td>)}</tr>)}</tbody></table></div>
  </>:<p>{stats.note}</p>}</>}
 </main>;
}
