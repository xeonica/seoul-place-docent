'use client';
import {useEffect, useMemo, useState} from 'react';
import {ArrowLeft, ArrowUpRight, BookOpen, ChevronLeft, ChevronRight, Download, FileText, FolderTree, Info, Loader2, Search, X} from 'lucide-react';
import {documentLabels, documentTables, isDocumentTable, safeDocumentUrl, type DocumentFilters, type DocumentMeta, type DocumentRow, type DocumentTable, type DocumentTarget} from '@/lib/document-research';

type Context = {sources: {id: string; title: string; url: string | null; status: string}[]; claims: {id: string; text: string; sourceIds: string[]; status: string; locator: string}[]};
type Results = {table: DocumentTable; total: number; page: number; pageSize: number; rows: DocumentRow[]; counts: Record<DocumentTable, number>; context: Context};
type View = DocumentFilters & {table: DocumentTable; page: number};
const initialView: View = {table: 'drafts', page: 1};
const num = (n: number) => n.toLocaleString('ko-KR');
function External({value, children}: {value: string; children?: React.ReactNode}) {
  const url = safeDocumentUrl(value);
  return url ? <a href={url} target="_blank" rel="noopener noreferrer">{children || value}<ArrowUpRight size={13}/></a> : <>{value}</>;
}

export default function DocumentResearch({meta, targets}: {meta: DocumentMeta; targets: DocumentTarget[]}) {
  const [view, setView] = useState<View>(initialView);
  const [ready, setReady] = useState(false);
  const [data, setData] = useState<Results | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const target = targets.find(t => t.id === params.get('target'));
    const table = params.get('table') || 'drafts';
    setView({table: isDocumentTable(table) ? table : 'drafts', page: Math.max(1, Number(params.get('page')) || 1),
      query: params.get('q') || '', district: params.get('district') || target?.district || '',
      target: target?.id || '', source: params.get('source') || '', evidence: params.get('evidence') || '',
      id: params.get('id') || '', issuesOnly: params.get('issues') === '1'});
    setReady(true);
  }, [targets]);
  const query = useMemo(() => {
    const p = new URLSearchParams({table: view.table, page: String(view.page)});
    for (const [key, value] of Object.entries({q: view.query, district: view.district, target: view.target, source: view.source, evidence: view.evidence, id: view.id, issues: view.issuesOnly ? '1' : ''})) if (value) p.set(key, value);
    return p.toString();
  }, [view]);
  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    setLoading(true); setError('');
    const timer = setTimeout(() => {
      window.history.replaceState({}, '', `/archive/document-research?${query}`);
      fetch(`/api/archive/document-research?${query}`, {signal: controller.signal}).then(async response => {
        const result = await response.json() as Results & {error?: string};
        if (!response.ok) throw new Error(result.error || '조사자료를 불러오지 못했습니다.');
        if (!controller.signal.aborted) setData(result);
      }).catch(e => {if (!controller.signal.aborted) setError(e instanceof Error ? e.message : '조사자료를 불러오지 못했습니다.');})
        .finally(() => {if (!controller.signal.aborted) setLoading(false);});
    }, 200);
    return () => {clearTimeout(timer); controller.abort();};
  }, [query, ready, refresh]);
  function change(patch: Partial<View>) {setView(previous => ({...previous, ...patch, page: 1}));}
  function open(table: DocumentTable, patch: Partial<View>) {
    const target = targets.find(t => t.id === patch.target);
    setView({...initialView, table, district: target?.district || '', ...patch});
    document.getElementById('document-results')?.scrollIntoView({behavior: 'smooth', block: 'start'});
  }
  function reference(id: string) {open('claims', {id});}
  const districtTargets = targets.filter(t => t.level === '자치구');
  const dongs = targets.filter(t => t.level === '법정동' && (!view.district || t.district === view.district));
  const selectedTarget = targets.find(t => t.id === view.target);
  const active = data && data.table === view.table ? data : null;
  const pages = Math.max(1, Math.ceil((active?.total || 0) / 20));
  const selectedFile = meta.files.find(f => f.key === view.table)!;

  function evidenceText(text: string) {
    return text.split(/(E\d{6})/g).map((part, i) => /^E\d{6}$/.test(part)
      ? <button type="button" className="doc-evidence-ref" key={i} onClick={() => reference(part)} title={active?.context.claims.find(c => c.id === part)?.text || '주장과 원문 위치 확인'}>{part}</button> : part);
  }
  function definition(row: DocumentRow, fields: string[]) {
    return <dl className="doc-definition">{fields.filter(field => row.values[field] && row.values[field] !== '해당 없음').map(field => <div key={field}><dt>{field}</dt><dd>{row.values[field]}</dd></div>)}</dl>;
  }
  function renderRow(row: DocumentRow) {
    const r = row.values;
    const table = view.table;
    const label = table === 'drafts' ? `${r['동·권역명']}의 역사` : table === 'claims' ? r['동·권역명'] + ' · ' + row.label : table === 'timeline' ? `${r['동·권역명']} · ${r['시기표기']}` : row.label;
    return <article className="doc-card" key={row.id} id={`record-${row.id}`}>
      <div className="doc-card-meta"><span>{row.district}</span>{r['지역구분'] && <span>{r['지역구분']}</span>}<code>{row.id}</code>{row.status && <span className="doc-status">자료 표기 · {row.status}</span>}</div>
      <h3>{label}</h3>
      {!!row.issues.length && <div className="doc-warning"><Info size={16}/><div>{row.issues.map(issue => <p key={issue}>{issue}</p>)}</div></div>}
      {table === 'drafts' && <><p className="doc-prose">{evidenceText(r['본문초안'])}</p>{definition(row, ['작성일', '미확보주제', '상충·주의사항'])}</>}
      {table === 'sources' && <>
        <p className="doc-institution">{r['발행기관'] || r['제공기관·채널']} · {r['저자·편찬자']} · {r['발행연도'] || '발행연도 미확인'}</p>
        <p className="doc-prose">{r['내용설명']}</p>
        <div className="doc-source-actions"><External value={r['원문URL']}>제공기관 원문 열기</External>{safeDocumentUrl(r['이용조건근거URL']) && <External value={r['이용조건근거URL']}>이용조건 근거</External>}
        <button type="button" onClick={() => open('claims', {source: row.id})}>이 문헌의 주장 보기<ChevronRight size={13}/></button></div>
        {definition(row, ['역사적대상시기', '자료유형', '직접확인여부', '원문열람범위', '관련장·절', '인쇄쪽수', 'PDF페이지', '확인일'])}
        <div className="doc-rights"><b>자료에 기록된 이용조건</b><p>{r['이용조건']}</p><p>{r['이용조건확인내용']}</p><small>원본 보관 {r['원본보관가능여부']} · 사이트 표시 {r['사이트표시가능여부']} · 변형 이용 {r['변형이용가능여부']}</small></div>
      </>}
      {table === 'articles' && <>
        <p className="doc-institution">{r['신문사'] || r['언론사'] || r['publisher'] || '언론사 미확인'} · {r['신문 발행일'] || r['신문_발행일'] || r['published_date'] || '발행일 미확인'}{r['지면/면수'] || r['page'] ? ` · ${r['지면/면수'] || r['page']}` : ''}</p>
        <p className="doc-prose">{r['기사요약'] || r['요약'] || r['summary'] || r['내용설명'] || '첨부된 조사 CSV에 기사 메타데이터가 수록되어 있습니다.'}</p>
        <div className="doc-source-actions"><External value={r['원문URL'] || r['original_url'] || r['article_url']}>기사 원문 열기</External></div>
        {definition(row, ['사건명', '기사주제', '사건일자', '기사_원제목', '발행일_정밀도', '검증등급', '검토상태', '확인일', '저작권·이용조건', '이용조건'])}
      </>}
      {table === 'claims' && <><p className="doc-prose">{r['역사적주장']}</p>{definition(row, ['시기표기', '근거유형', '원문위치', '자료간상충여부', '추가확인사항'])}</>}
      {table === 'timeline' && <><p className="doc-prose">{evidenceText(r['사건'])}</p>{definition(row, ['상충·주의사항'])}</>}
      {table === 'links' && <><p className="doc-prose">{r['지역관련근거']}</p>{definition(row, ['동·권역명', '대상ID', '조사단계', '관련장·절', '인쇄쪽수', 'PDF페이지', '추가확인사항'])}<div className="doc-source-actions"><External value={r['근거URL']}>지역 연결 근거 열기</External></div></>}
      {table === 'leads' && <><p className="doc-lead-label">사진·영상 탐색 제안</p><p className="doc-prose">{r['찾을장면']}</p>{definition(row, ['동·권역', '옛지명·별칭', '관련시기'])}<p className="doc-caption">실제 시각자료와 촬영 위치·시기·이용조건은 별도 확인 대상입니다.</p></>}
      {table === 'targets' && <>
        {definition(row, ['조사단계', '법정동코드', '목록기준일', '처리상태', '원문확인고유문헌수', '기존문헌연결수', '확인주장수', '본문초안상태', '추가조사필요사항', '마지막확인일', '다음작업'])}
        <div className="doc-source-actions"><button type="button" onClick={() => open('drafts', {target: row.id})}>이 지역 본문 보기<ChevronRight size={13}/></button><button type="button" onClick={() => open('sources', {target: row.id})}>연결 문헌 보기<ChevronRight size={13}/></button></div>
      </>}
      {table === 'progress' && <>{definition(row, ['문헌목록확보상태', '원문열람상태', '사실·근거정리상태', '본문초안상태', '추가조사필요여부', '미확보주제', '다음작업', '최종확인일'])}<p className="doc-caption">제공 CSV의 조사 시점 기록입니다. 현재 예약 작업의 진행 상태와 별도로 표시합니다.</p></>}
      {table !== 'sources' && row.sourceIds.length > 0 && <div className="doc-citations"><b>근거 문헌</b>{row.sourceIds.map(id => {
        const source = active?.context.sources.find(s => s.id === id);
        return <div key={id}><button type="button" onClick={() => open('sources', {id})}>{source?.title || id}<ChevronRight size={13}/></button><code>{id}</code></div>;
      })}</div>}
      {row.evidenceIds.length > 0 && table !== 'claims' && <div className="doc-references"><span>주장 근거</span>{row.evidenceIds.map(id => <button key={id} type="button" title={active?.context.claims.find(c => c.id === id)?.text} onClick={() => reference(id)}>{id}</button>)}</div>}
      <details className="doc-raw"><summary>원본 CSV 항목 전체 보기</summary><dl>{Object.entries(r).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{safeDocumentUrl(value) ? <External value={value}/> : value || '빈 값'}</dd></div>)}</dl></details>
    </article>;
  }

  return <main className="doc-page">
    <a href="#document-content" className="skip-link">본문으로 건너뛰기</a>
    <header className="doc-top"><a href="/"><ArrowLeft size={15}/>장소 탐색</a><a href="/" className="doc-brand">서울 <b>장소 도슨트</b></a><a href="/archive">역사자료 DB<ArrowUpRight size={15}/></a></header>
    <section className="doc-hero" id="document-content"><div><span className="doc-eyebrow"><BookOpen size={16}/>서울 역사 문헌 조사자료</span><h1>동네의 기록에서,<br/><em>이야기의 근거까지.</em></h1><p>서울 전체와 25개 자치구, 467개 법정동.<br/>문헌·주장·본문·연표를 원본의 식별자로 이어 읽습니다.</p><span className="doc-date">자료 확인일 {meta.dateRange.join(' ~ ')} · 홈페이지 반영 {meta.importedOn}</span></div>
    <aside className="doc-hero-aside"><FolderTree size={25}/><p>하나의 역사 서술을<br/>출처까지 거슬러 올라갑니다.</p><div><span>본문 초안</span><ChevronRight size={14}/><span>주장·근거</span><ChevronRight size={14}/><span>문헌 원문</span></div><small>대괄호 안의 근거 ID를 눌러 확인하세요.</small></aside></section>
    <div className="doc-metrics">{([['기사 조사자료', meta.counts.articles, '25개 구별 CSV · 원문 링크와 조사 표기 보존'], ['문헌 레코드', meta.counts.sources, '서로 다른 URL ' + meta.sourceUrlCount + '개'], ['주장·근거', meta.counts.claims, '원문 위치·근거 유형 보존'], ['지역별 본문 초안', meta.counts.drafts, '서울 1 · 자치구 25 · 법정동 24'], ['지역별 연표', meta.counts.timeline, '원본 사건 순서·시기 표기 보존']] as const).map(([label, count, caption]) => <div key={label}><span>{label}</span><b>{num(count)}<small>개</small></b><p>{caption}</p></div>)}</div>
    <div className="doc-scope"><Info size={18}/><p>{meta.scopeNote}</p></div>
    <details className="doc-files"><summary><FileText size={16}/>문헌 CSV 8개와 기사 CSV 25개 · 기사 {num(meta.counts.articles)}건 · 구별 원본 ZIP 내려받기<ChevronRight size={16}/></summary><div className="doc-files-content"><div className="doc-file-list">{meta.files.map((file, index) => <a href={file.path} download={file.filename} key={`${file.key}-${index}`}><Download size={15}/><span><b>{file.title || file.filename}</b><small>{num(file.count)}개 행 · ZIP {(file.sizeBytes / (1024 * 1024)).toFixed(1)} MB</small><code>SHA-256 {file.sha256}</code></span></a>)}</div><div className="doc-quality"><h2>연결 점검 결과</h2><p>참조 대상이 없는 ID {meta.missingReferenceCount}개 · 명칭과 대상 ID 차이 {meta.invalidLinkCount}개</p><p>지역 연결 983개 중 6개는 검토 대기로 보존하고 자동 지역 연결에서 제외했습니다. 대상 목록과 법정동 코드는 기존 운영 DB를 덮어쓰지 않습니다.</p>{meta.warnings.map(warning => <button key={warning.id} type="button" onClick={() => open('links', {id: warning.id})}><code>{warning.id}</code><span>{warning.reason}</span></button>)}<p>같은 URL을 사용하는 문헌 그룹 {meta.repeatedUrlGroupCount}개는 서로 다른 레코드로 보존했습니다. URL 수를 고유 원전 수나 검증 완료 수로 해석하지 않습니다.</p><p>진행표는 42개 지역만 수록합니다. 미수록 지역을 미조사 또는 완료 상태로 간주하지 않습니다.</p></div></div></details>
    <section className="doc-filter" aria-label="문헌 조사자료 검색"><label className="doc-search"><Search size={19}/><span className="sr-only">조사자료 검색</span><input value={view.query || ''} onChange={e => change({query: e.target.value, id: ''})} placeholder="동네·자료명·시설·사건·근거 ID 검색" maxLength={150}/></label>
      <div className="doc-filter-row"><label>자치구<select value={view.district || ''} onChange={e => change({district: e.target.value, target: '', id: ''})}><option value="">서울 전체 범위</option><option value="서울전체">서울 통사 자료만</option>{districtTargets.map(t => <option value={t.district} key={t.id}>{t.name}</option>)}</select></label><label>법정동<select value={selectedTarget?.level === '법정동' ? selectedTarget.id : ''} onChange={e => {const t = targets.find(t => t.id === e.target.value); change({target: e.target.value, district: t?.district || view.district, id: ''});}}><option value="">선택 범위의 모든 동</option>{dongs.map(t => <option key={t.id} value={t.id}>{view.district ? t.name : `${t.district} ${t.name}`}</option>)}</select></label><label className="doc-issues-filter"><input type="checkbox" checked={!!view.issuesOnly} onChange={e => change({issuesOnly: e.target.checked, id: ''})}/>연결 차이·상충 확인 항목</label><button type="button" className="doc-reset" onClick={() => setView({...initialView, table: view.table})}>검색 초기화</button></div>
      {(view.id || view.evidence || view.source || selectedTarget && selectedTarget.level !== '법정동') && <div className="doc-active-reference"><span>연결 탐색: {view.id || view.evidence || view.source || selectedTarget?.name}</span><button type="button" onClick={() => change({id: '', evidence: '', source: '', target: selectedTarget?.level === '법정동' ? view.target : ''})} aria-label="연결 탐색 해제"><X size={14}/></button></div>}
    </section>
    <nav className="doc-tabs" aria-label="조사자료 종류">{documentTables.map(table => <button type="button" key={table} aria-pressed={view.table === table} onClick={() => change({table, id: ''})}>{documentLabels[table]}<span>{num((active?.counts || meta.counts)[table])}</span></button>)}</nav>
    <section id="document-results" className="doc-results" aria-busy={loading}><div className="doc-results-heading"><h2>{selectedTarget ? selectedTarget.name + ' · ' : ''}{documentLabels[view.table]}<span>{num(active?.total || 0)}개</span></h2><a href={`/api/archive/document-research?${query}&download=1`}><Download size={14}/>현재 조건 JSON</a></div>
      <p className="doc-caption">원본 {selectedFile.filename} · 상태와 확인일은 첨부 자료의 표기입니다.</p>
      {loading ? <div className="doc-empty" role="status"><Loader2 className="spin" size={24}/><p>조사자료를 불러오는 중입니다.</p></div> : error ? <div className="doc-empty" role="alert"><Info size={24}/><p>{error}</p><button type="button" onClick={() => setRefresh(v => v + 1)}>다시 불러오기</button></div> : <div className="doc-list">{active?.rows.map(renderRow)}{!active?.rows.length && <div className="doc-empty"><Search size={25}/><h3>이 조건에 수록된 항목이 없습니다.</h3><p>지역의 역사나 조사자료가 없다는 의미는 아닙니다. 다른 자료 종류나 검색 조건을 확인해 보세요.</p><button type="button" onClick={() => setView({...initialView, table: view.table})}>전체 범위 보기</button></div>}</div>}
      {!loading && !error && <nav className="doc-pagination" aria-label="조사자료 페이지"><span>{active?.total ? `${(active.page - 1) * 20 + 1}–${Math.min(active.page * 20, active.total)} / ${num(active.total)}개` : '0개'}</span><div><button type="button" disabled={(active?.page || 1) <= 1} onClick={() => setView(v => ({...v, page: (active?.page || 1) - 1}))}><ChevronLeft size={14}/>이전</button><span>{active?.page || 1} / {pages}</span><button type="button" disabled={(active?.page || 1) >= pages} onClick={() => setView(v => ({...v, page: (active?.page || 1) + 1}))}>다음<ChevronRight size={14}/></button></div></nav>}
    </section>
    <footer className="doc-footer"><a href="/archive/photo-research">사진 조사자료 보기<ArrowUpRight size={14}/></a><a href="/archive/video-research">영상 조사자료 보기<ArrowUpRight size={14}/></a><span>서울 장소 도슨트 · 문헌의 출처와 조사 범위를 함께 보존합니다.</span></footer>
  </main>;
}

