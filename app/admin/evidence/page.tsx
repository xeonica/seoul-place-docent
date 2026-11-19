'use client';
import {useState} from 'react';

const example={recordId:'원본 자료 ID',passageId:'기존 D1 본문 ID',placeKey:'juso-building:주소 검색의 건물관리번호',mediaType:'article',relationType:'exact_building',status:'pending_review',expectedRevision:0,expectedFingerprint:'본문 조회에서 받은 fingerprint',payload:{relationEvidenceId:'장소 연결 근거 ID',relationBasis:'원문에서 확인한 장소 관계와 해당 문단을 기록하세요.',sourceVerified:false,contentVerified:false,placeVerified:false,claimVerified:false,citationAllowed:false,aiAllowed:false,rightsEvidenceUrl:'https://example.org/rights',rightsNote:'실제 인용 및 AI 처리 허락의 범위',eventDate:null,publishedAt:null,aliases:[],segments:[]}};
export default function EvidenceAdmin(){
 const [key,setKey]=useState(''),[token,setToken]=useState(''),[passage,setPassage]=useState(''),[body,setBody]=useState(JSON.stringify(example,null,2)),[result,setResult]=useState<unknown>(null),[busy,setBusy]=useState(false);
 async function run(mode:'diagnose'|'passage'|'save'){
  setBusy(true);try{
   const params=new URLSearchParams(mode==='passage'?{passageId:passage}:{token});
   const response=await fetch('/api/admin/evidence'+(mode==='save'?'':'?'+params),{method:mode==='save'?'POST':'GET',headers:{'x-archive-admin':key,...(mode==='save'?{'Content-Type':'application/json'}:{})},...(mode==='save'?{body:JSON.stringify(JSON.parse(body))}:{}),cache:'no-store'});
   const data=await response.json() as Record<string,unknown>;setResult({httpStatus:response.status,...data});
   if(mode==='passage'&&response.ok){const draft=JSON.parse(body);draft.passageId=data.id;draft.expectedFingerprint=data.fingerprint;setBody(JSON.stringify(draft,null,2));}
  }catch{setResult({error:'요청 또는 JSON 입력을 확인해 주세요.'});}finally{setBusy(false);}
 }
 return <main className="mx-auto max-w-4xl space-y-6 px-5 py-10">
  <a href="/archive">← 자료실</a><h1 className="text-3xl font-bold">장소 근거 검토 및 진단</h1>
  <p>기존 자료실에서 출처와 짧은 본문을 등록하고 본문 검토를 완료한 뒤, 여기서 장소 연결과 인용·AI 처리 권한을 별도로 검토합니다. 원문을 실제 확인하지 않은 항목은 승인하지 마세요.</p>
  <label className="block">관리자 키<input type="password" autoComplete="off" value={key} onChange={e=>setKey(e.target.value)} className="block w-full rounded border p-2"/></label>
  <p className="text-sm text-neutral-600">키는 현재 화면 메모리에서만 사용합니다.</p>
  <section className="space-y-2"><h2 className="text-xl font-semibold">장소별 후보 진단</h2><label className="block">주소 검색 후보 token<input value={token} onChange={e=>setToken(e.target.value)} className="block w-full rounded border p-2"/></label><button disabled={busy||!key||!token} onClick={()=>run('diagnose')} className="rounded bg-emerald-900 px-4 py-2 text-white disabled:opacity-40">후보·승인·누락 사유 조회</button></section>
  <section className="space-y-2"><h2 className="text-xl font-semibold">본문 및 검토 이력</h2><label className="block">D1 본문 ID<input value={passage} onChange={e=>setPassage(e.target.value)} className="block w-full rounded border p-2"/></label><button disabled={busy||!key||!passage} onClick={()=>run('passage')} className="rounded border px-4 py-2">최신 본문·지문·검토 기록 조회</button></section>
  <section className="space-y-2"><h2 className="text-xl font-semibold">장소 연결·권리 검토 저장</h2><p className="text-sm">status: pending_review / approved / rejected / revoked. expectedRevision은 해당 자료·본문·장소 조합의 최신 리비전입니다. 철회도 새 이력으로 저장되며 삭제하지 않습니다. 별칭에는 확인된 사용 시기와 근거를 기록하세요.</p><label className="block">검토 JSON<textarea value={body} onChange={e=>setBody(e.target.value)} rows={24} spellCheck={false} className="w-full rounded border p-3 font-mono text-sm"/></label><button disabled={busy||!key} onClick={()=>run('save')} className="rounded bg-emerald-900 px-4 py-2 text-white disabled:opacity-40">검토 이력 저장</button></section>
  <section aria-live="polite"><h2 className="text-xl font-semibold">{busy?'조회 중…':'실행 결과'}</h2><pre className="max-h-[40rem] overflow-auto whitespace-pre-wrap rounded bg-neutral-100 p-4 text-sm">{result?JSON.stringify(result,null,2):'아직 실행하지 않았습니다.'}</pre></section>
 </main>;
}
