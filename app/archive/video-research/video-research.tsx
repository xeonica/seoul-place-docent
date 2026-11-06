'use client';

import {useMemo, useState} from 'react';
import {ArrowLeft, ArrowUpRight, BookOpen, Check, ChevronLeft, ChevronRight, Download, FileText, Film, Info, Search} from 'lucide-react';
import type {HistoryReportItem, HistoryReportFilters} from '@/lib/history-report';
import {filterHistoryReport} from '@/lib/history-report';

type Report = {
  document: {
    title: string; filename: string; pdfPath: string; pageCount: number; sha256: string;
    sizeBytes: number; printedAt: string; importedOn: string; origin: string;
    reportedCumulativeCount: number; visibleRecordCount: number; completeVideoUrlCount: number;
    independentlyVerifiedVideoCount: number; idMismatchCount: number; rightsNote: string;
  };
  batches: {number: number; count: number}[];
  items: HistoryReportItem[];
};
const PAGE_SIZE = 20;
const number = (n: number) => n.toLocaleString('ko-KR');

export default function VideoResearch({report}: {report: Report}) {
  const [filters, setFilters] = useState<HistoryReportFilters>({});
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState<'items' | 'document'>('items');
  const doc = report.document;
  const items = useMemo(() => filterHistoryReport(report.items, filters), [report.items, filters]);
  const channels = [...new Set(report.items.map(item => item.channelName))];
  const topics = [...new Set(report.items.map(item => item.topic))];
  const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const visible = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  function change<K extends keyof HistoryReportFilters>(key: K, value: HistoryReportFilters[K]) {
    setFilters(previous => ({...previous, [key]: value}));
    setPage(1);
  }
  function reset() {setFilters({}); setPage(1);}
  function paginate(next: number) {
    setPage(next);
    document.getElementById('research-results')?.scrollIntoView({behavior: 'smooth', block: 'start'});
  }

  return <div className="research-page">
    <a href="#research-content" className="skip-link">본문으로 건너뛰기</a>
    <header className="research-top">
      <a href="/archive"><ArrowLeft size={16}/>역사자료 DB</a>
      <a href="/" className="research-brand">서울 <b>장소 도슨트</b></a>
      <span>영상 조사자료</span>
    </header>

    <section className="research-hero" id="research-content">
      <div>
        <span className="research-eyebrow"><Film size={15}/>도시의 변화를 찾는 영상 조사</span>
        <h1>서울의 도시사,<br/><em>영상의 단서에서 시작하다.</em></h1>
        <p>교량과 지하철, 공공시설과 생활공간의 변화.<br/>제공된 보고서의 조사 항목과 확인이 필요한 출처를 함께 읽습니다.</p>
        <div className="research-actions">
          <a href={doc.pdfPath} target="_blank" rel="noopener noreferrer" className="research-primary"><BookOpen size={16}/>보고서 원본 열기<ArrowUpRight size={15}/></a>
          <a href="/api/archive/reports/city-history?download=1" className="research-download"><Download size={15}/>조사 목록 내려받기</a>
        </div>
      </div>
      <aside className="research-document-card">
        <FileText size={28} strokeWidth={1.3}/>
        <span>제공 문서 · PDF {doc.pageCount}쪽</span>
        <h2>{doc.title}</h2>
        <p>120~133차 수집 보고<br/>문서 출력 2026.10.20 · 사이트 수록 2026.10.21</p>
        <div><b>{doc.visibleRecordCount}</b><span>개의 문서 내 조사 항목</span></div>
      </aside>
    </section>

    <div className="research-metrics" aria-label="제공 문서의 수록 범위">
      <div><span>추출한 자료 항목</span><b>{number(doc.visibleRecordCount)}<small>개</small></b></div>
      <div><span>문서의 수집 차수</span><b>{report.batches.length}<small>개</small></b></div>
      <div><span>완전한 영상 URL</span><b>{doc.completeVideoUrlCount}<small>개</small></b></div>
      <div><span>식별자 불일치</span><b>{doc.idMismatchCount}<small>개</small></b></div>
    </div>

    <section className="research-scope-note" aria-label="자료 확인 상태">
      <Info size={19}/><div><h2>보고서의 수록 범위와 영상 원본 확인 상태</h2>
      <p>문서는 누적 {number(doc.reportedCumulativeCount)}건 구축을 보고합니다. 이 PDF에서 확인되는 자료 항목은 {doc.visibleRecordCount}개이며, 반복 등장하는 사건도 포함돼 있습니다. 오른쪽이 잘린 영상 URL과 설명은 복원하지 않았습니다. 항목 수는 고유 영상 수나 검증 완료 건수가 아닙니다.</p>
      <p>아래 내용은 <b>문서에 적힌 미검토 주장</b>입니다. 영상 원본·날짜·장소·이용조건을 확인한 뒤 역사 설명과 연표에 연결합니다.</p></div>
    </section>

    <div className="research-tabs" role="tablist" aria-label="보고서 보기" onKeyDown={event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 'items' : event.key === 'End' ? 'document' : tab === 'items' ? 'document' : 'items';
      setTab(next);
      requestAnimationFrame(() => document.getElementById(`research-${next}-tab`)?.focus());
    }}>
      <button type="button" role="tab" id="research-items-tab" aria-controls="research-items-panel" aria-selected={tab === 'items'} tabIndex={tab === 'items' ? 0 : -1} onClick={() => setTab('items')}>조사 항목 <span>{doc.visibleRecordCount}</span></button>
      <button type="button" role="tab" id="research-document-tab" aria-controls="research-document-panel" aria-selected={tab === 'document'} tabIndex={tab === 'document' ? 0 : -1} onClick={() => setTab('document')}>문서 정보·검토 기준</button>
    </div>

    {tab === 'items' ? <section role="tabpanel" id="research-items-panel" aria-labelledby="research-items-tab">
      <div className="research-filter-panel">
        <label className="research-search"><Search size={18}/><span className="sr-only">문서 내 조사 항목 검색</span><input value={filters.query || ''} onChange={event => change('query', event.target.value)} placeholder="시설명·날짜·REC ID·문서 표기 채널 검색" maxLength={120}/></label>
        <div className="research-filters">
          <label>수집 차수<select value={filters.batch || ''} onChange={event => change('batch', event.target.value)}><option value="">전체 차수</option>{report.batches.map(batch => <option key={batch.number} value={batch.number}>{batch.number}차 · {batch.count}개</option>)}</select></label>
          <label>문서 표기 채널<select value={filters.channel || ''} onChange={event => change('channel', event.target.value)}><option value="">전체 채널</option>{channels.map(channel => <option key={channel}>{channel}</option>)}</select></label>
          <label>내용별 탐색<select value={filters.topic || ''} onChange={event => change('topic', event.target.value)}><option value="">전체 주제</option>{topics.map(topic => <option key={topic}>{topic}</option>)}</select></label>
          <label>문서 표기 사건 연도<select value={filters.period || ''} onChange={event => change('period', event.target.value)}><option value="">전체 연도</option><option value="before2000">2000년 이전</option><option value="from2000">2000년 이후</option></select></label>
        </div>
        <div className="research-filter-bottom"><label><input type="checkbox" checked={!!filters.issuesOnly} onChange={event => change('issuesOnly', event.target.checked)}/>식별자 불일치만 보기</label><button type="button" onClick={reset}>검색 조건 초기화</button></div>
      </div>

      <div className="research-results-heading" id="research-results"><h2>문서 내 조사 항목</h2><span role="status" aria-live="polite">{items.length}개 · {page}/{pages}페이지</span></div>
      <p className="research-list-note">표시 연도는 촬영·업로드 날짜가 아닌 문서 속 사건 연도입니다. 주제는 탐색을 위한 내용 분류입니다.</p>
      <div className="research-items">
        {visible.map(item => <article key={item.id} className="research-item">
          <div className="research-item-meta"><span>{item.batch}차</span><span>{item.channelName} <small>문서 표기</small></span><span>{item.topic}</span><span className="research-pending">원본 확인 대기</span></div>
          <h3>{item.claimExcerpt}<span aria-label="문장이 잘림">…</span></h3>
          <div className="research-item-identifiers"><span>{item.recordId}</span><span>{item.dateLabel || '연도 미상'} · 문서 표기</span><span>본문 잘림</span>{item.idMismatch && <strong>자료·주장 연결 ID 불일치</strong>}</div>
          {item.idMismatch && <p className="research-id-issue">자료 행은 <b>{item.recordId}</b>, 주장 행의 연결 값은 <b>{item.claimRecordId}</b>입니다. 같은 차수의 {report.items.filter(row => row.batch === item.batch).findIndex(row => row.id === item.id) + 1}번째 행끼리 임시 대조했으며, 연결 확정이 필요합니다.</p>}
          <div className="research-item-actions"><a href={`${doc.pdfPath}#page=${item.claimPage}`} target="_blank" rel="noopener noreferrer"><FileText size={14}/>문서 {item.claimPage}쪽 보기<ArrowUpRight size={13}/></a></div>
          <details className="research-raw"><summary>문서 식별자·추출 행 확인</summary><dl><div><dt>자료 행</dt><dd>{item.recordPage}쪽 · {item.recordId}</dd></div><div><dt>주장 행</dt><dd>{item.claimPage}쪽 · {item.claimId} → {item.claimRecordId}</dd></div><div><dt>영상 원본</dt><dd>완전한 URL 미확보 · 재생·타임코드·임베드·이용조건 미확인</dd></div></dl><p>PDF에 보이는 문자만 보존했습니다. 잘린 문장 끝과 URL을 추측해 채우지 않았습니다.</p><pre>{item.recordLine}{'\n'}{item.claimLine}</pre></details>
        </article>)}
        {!visible.length && <div className="research-empty"><Search size={28}/><h3>조건에 맞는 항목이 없습니다.</h3><p>검색어나 선택한 조건을 바꿔 보세요.</p><button type="button" onClick={reset}>전체 항목 보기</button></div>}
      </div>
      <nav className="research-pagination" aria-label="조사 항목 페이지"><span>{items.length ? `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, items.length)} / ${items.length}개` : '0개'}</span><div><button type="button" onClick={() => paginate(page - 1)} disabled={page <= 1}><ChevronLeft size={15}/>이전</button><button type="button" onClick={() => paginate(page + 1)} disabled={page >= pages}>다음<ChevronRight size={15}/></button></div></nav>
    </section> : <section className="research-document-info" role="tabpanel" id="research-document-panel" aria-labelledby="research-document-tab">
      <section><h2>첨부 문서의 범위</h2><dl><div><dt>자료명</dt><dd>{doc.title}</dd></div><div><dt>자료 성격</dt><dd>{doc.origin}</dd></div><div><dt>출력 시각</dt><dd>2026년 10월 20일 21:05 · PDF 표기, 한국시간</dd></div><div><dt>직접 확인한 범위</dt><dd>120~133차 · 215개 자료 행과 215개 주장 행 · 15쪽</dd></div><div><dt>누적 보고 수</dt><dd>2,000건 · 문서의 주장, 전체 데이터 파일은 첨부되지 않음</dd></div><div><dt>PDF 지문</dt><dd className="research-hash">SHA-256 {doc.sha256}</dd></div><div><dt>PDF 용량</dt><dd>{number(doc.sizeBytes)}바이트</dd></div><div><dt>원본</dt><dd><a href={doc.pdfPath} target="_blank" rel="noopener noreferrer">첨부 PDF 열기<ArrowUpRight size={13}/></a></dd></div></dl></section>
      <section><h2>확인 결과</h2><ul className="research-checks"><li><Check size={17}/><span>문서 내 215개 자료 행과 215개 주장 행을 빠짐없이 추출하고 쪽수를 연결했습니다.</span></li><li><Info size={17}/><span>모든 자료 행과 주장 행의 오른쪽이 잘려 있습니다. 완전한 영상 URL은 0개입니다.</span></li><li><Info size={17}/><span>121차의 REC_YT_1709와 REC_YT_1809 불일치를 원문대로 보존했습니다.</span></li><li><Info size={17}/><span>문서에 같은 사건이 반복 등장합니다. ID가 다르다는 이유만으로 서로 다른 영상으로 확정하지 않습니다.</span></li></ul></section>
      <section><h2>후속 검토 기준</h2><ol><li>실제 채널과 영상 상세 페이지를 찾아 제목·완전한 URL·게시일을 기록합니다.</li><li>영상의 해당 장면과 타임코드를 확인하고, 촬영 시기와 사건 발생일을 구분합니다.</li><li>공식 문헌으로 연대·시설명·장소를 대조하고 반복 항목과 상충 서술을 검토합니다.</li><li>이용조건과 건물·부지·주변·동네의 관계 범위를 확인한 뒤 검토된 설명에 연결합니다.</li></ol></section>
      <section><h2>이용 범위</h2><p>{doc.rightsNote}</p></section>
    </section>}

    <footer className="research-footer"><a href="/archive/photo-research">사진 조사자료 보기<ArrowUpRight size={14}/></a><a href="/archive">역사자료 DB로 돌아가기<ChevronRight size={14}/></a><span>영상 원본 확인 전 조사자료 · 첨부 문서의 출처와 불확실성을 함께 보존합니다.</span></footer>
  </div>;
}
