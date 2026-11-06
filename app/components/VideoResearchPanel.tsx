'use client';
import {useEffect, useState} from 'react';
import {ArrowUpRight, Film, Loader2} from 'lucide-react';
import type {CatalogueVideo} from '@/lib/district-video-research';
import regions from '@/data/seoul-regions.json';
import './video-research-panel.css';
type Data = {total: number; page: number; pageSize: number; items: CatalogueVideo[]; catalogue: {identified: number; candidates: number; segments: number; records: number; references: {filename: string; pages: number}[]}; meta: {uniqueVideoCount: number; segmentCount: number; excludedCount: number; normalizedUrlCount: number; invalidTimeCount: number; groupCounts: Record<string, number>}};
function Video({video}: {video: CatalogueVideo}) {
  const report = video.report;
  const link = report?.url || video.research.find(r => r.url)?.url;
  const timed = (url: string, start: number) => {
    const result = new URL(url);
    if (result.hostname === 'www.youtube.com') result.searchParams.set('t', start + 's');
    return result.href;
  };
  const originalLabel = report?.url || video.identity ? '영상 원문 보기' : '조사표 링크 열기';
  return <article className="video-record">
    <div className="video-record-meta">
      <span>{report ? (report.group === 'A' ? '보고서 A군' : '보고서 B군') : video.identity ? '엑셀 조사 영상' : '영상 식별 검토 후보'}</span>
      {video.scope && <span>{video.scope}</span>}
    </div>
    <h4>{video.title}</h4>
    {report && <><p>{report.place}</p><small>{report.channel} · {report.id} · {report.date}</small>
      {report.reason && <p className="video-candidate-note">{report.reason}</p>}</>}
    {link && <div className="video-record-actions"><a href={link} target="_blank" rel="noopener noreferrer">{originalLabel}<ArrowUpRight size={13}/></a></div>}
    {!!report?.segments.length && <details><summary>기존 보고서 장면 · {report.segments.length}개</summary>
      {report.segments.map((s, i) => <div className="video-segment" key={i}>
        <b>{s.startLabel}–{s.endLabel}</b><p>{s.description}</p><small>{s.place} · {s.basis}</small>
        {report.url && s.validTime && s.start !== null && <a href={timed(report.url, s.start)} target="_blank" rel="noopener noreferrer">원문에서 이 시간 열기</a>}
      </div>)}
    </details>}
    {video.research.map(r => <details key={r.id}>
      <summary>엑셀 조사 출처 · {r.district} · {r.sourceId}</summary>
      <p>{r.title} · {r.channel} · {r.period}</p><p>{r.description}</p>
      <p>{[r.places, r.address, r.legalDong && '법정동 ' + r.legalDong, r.administrativeDong && '행정동 ' + r.administrativeDong].filter(Boolean).join(' · ')}</p>
      <small>{r.file} / {r.sheet} / {r.row}행</small>
      <p>{[r.review, r.playback, r.urlStatus, r.rights, r.notes].filter(Boolean).join(' · ')}</p>
      {r.sourceUrl && <a href={r.sourceUrl} target="_blank" rel="noopener noreferrer">조사 출처 페이지 열기</a>}
      {r.segmentNotes?.map(note => <p key={note}>영상 설명란 목차 참고 · {note}</p>)}
      {(r.segments || []).map((s, i) => <div className="video-segment" key={i}>
        <b>{s.startRaw}–{s.endRaw}</b><p>{s.evidence}</p><small>{s.sheet} / {s.row}행</small>
        {r.identity?.startsWith('youtube:') && r.url && s.startSeconds !== null &&
          <a href={timed(r.url, s.startSeconds)} target="_blank" rel="noopener noreferrer">조사표 시간으로 원문 열기</a>}
      </div>)}
    </details>)}
    <p className="video-review-note">보고서·조사표의 기록 · 사이트 독립 검증 전</p>
  </article>;
}
export default function VideoResearchPanel({district = '', dong = '', administrativeDong = '', address = '', building = '', parcel = '', archive = false}: {
  district?: string; dong?: string; administrativeDong?: string; address?: string; building?: string; parcel?: string; archive?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('all');
  const [archiveDistrict, setArchiveDistrict] = useState('');
  const [archiveDong, setArchiveDong] = useState('');
  const [archiveAdmin, setArchiveAdmin] = useState('');
  const [period, setPeriod] = useState('');
  const [channel, setChannel] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {setPage(1);}, [district, dong, query, group, archiveDistrict, archiveDong, archiveAdmin, period, channel, status]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setData(null);
    const params = new URLSearchParams({
      catalogue: '1', q: query, group, page: String(page), period, channel, status,
      district: archive ? archiveDistrict : district, dong: archive ? archiveDong : dong,
      administrativeDong: archive ? archiveAdmin : administrativeDong,
    });
    if (!archive) {
      params.set('place', '1');
      params.set('address', address);
      params.set('building', building);
      params.set('parcel', parcel);
    }
    fetch('/api/archive/video-research?' + params, {signal: controller.signal}).then(async response => {
      const body = await response.json() as Data & {error?: string};
      if (!response.ok) throw new Error(body.error || '영상을 불러오지 못했습니다.');
      if (!controller.signal.aborted) setData(body);
    }).catch(e => {if (!controller.signal.aborted) setError(e instanceof Error ? e.message : '영상을 불러오지 못했습니다.');})
      .finally(() => {if (!controller.signal.aborted) setLoading(false);});
    return () => controller.abort();
  }, [district, dong, administrativeDong, address, building, parcel, archive, query, group, page, attempt, archiveDistrict, archiveDong, archiveAdmin, period, channel, status]);
  return <section className="video-research-panel" aria-label="첨부 역사 영상 자료">
    <header><span><Film size={18}/>영상으로 보는 동네의 시간</span>{!archive && <a href="/archive/video-research">전체 영상 보기<ArrowUpRight size={14}/></a>}</header>
    <h3>{archive ? '역사 영상과 장면을 찾아보세요' : `${district} ${dong}의 영상 기록`}</h3>
    <p>옛 지명과 시설, 장면별 시간을 함께 살펴보세요. 보고서의 조사 설명과 원문 영상을 연결했습니다.</p>
    {archive && <>
      <div className="video-source-links">
        <a href="/research/consolidated-20261106/seoul_historical_video_consolidated_report.md" target="_blank" rel="noopener noreferrer">첨부 보고서 원본</a>
        <a href="/api/archive/video-research?group=all&download=1">기존 보고서 목록·제외 사유 내려받기</a>
      </div>
      <div className="video-filters">
        <label>제목·설명·장소<input value={query} onChange={e => setQuery(e.target.value)} placeholder="예: 삼선동, 중앙청"/></label>
        <label>자치구<select value={archiveDistrict} onChange={e => setArchiveDistrict(e.target.value)}>
          <option value="">전체</option>{regions.districts.map(r => <option key={r.name}>{r.name}</option>)}
        </select></label>
        <label>법정동<input value={archiveDong} onChange={e => setArchiveDong(e.target.value)}/></label>
        <label>행정동<input value={archiveAdmin} onChange={e => setArchiveAdmin(e.target.value)}/></label>
        <label>역사적 시기<input value={period} onChange={e => setPeriod(e.target.value)}/></label>
        <label>제작기관·채널<input value={channel} onChange={e => setChannel(e.target.value)}/></label>
        <label>자료 분류<select value={group} onChange={e => setGroup(e.target.value)}>
          <option value="all">전체</option><option value="A">보고서 A군</option>
          <option value="B">보고서 B군</option><option value="excel">엑셀 조사 자료</option>
        </select></label>
        <label>검토 상태<select value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">전체</option><option value="identified">영상 식별자 있음</option>
          <option value="candidate">영상 식별 검토 필요</option>
          <option value="pending">엑셀 조사 · 독립 검증 대기</option><option value="report">기존 보고서 분류 있음</option>
        </select></label>
      </div>
      {data && <><p className="video-import-summary">고유 영상 {data.catalogue.identified.toLocaleString('ko-KR')}개 · 식별 후보 {data.catalogue.candidates}개 · 장면 표기 {data.catalogue.segments.toLocaleString('ko-KR')}개</p>
        <p>기존 보고서 A군 {data.meta.groupCounts.A}개 · B군 {data.meta.groupCounts.B}개 · 제외 {data.meta.excludedCount}개</p>
        <details><summary>별도 참고 PDF {data.catalogue.references.length}개</summary>
          <ul>{data.catalogue.references.map(ref => <li key={ref.filename}>{ref.filename} · {ref.pages}쪽 · 첨부 ZIP에서 열람</li>)}</ul>
        </details></>}
    </>}
    {loading ? <p role="status"><Loader2 size={16} className="spin"/>영상 자료를 불러오는 중입니다.</p> : error ? <p role="alert">{error} <button type="button" onClick={() => setAttempt(n => n + 1)}>다시 불러오기</button></p> : data && <>
      <p className="video-scope-note">{archive ? '기존 보고서와 엑셀 조사 자료' : '주소·시설·동네·자치구의 관련 수준을 구분해 표시합니다'} · 제공 보고서의 확인 상태와 사이트의 독립 검증은 구분합니다.</p>
      <div className="video-record-grid">{data.items.map(item => <Video key={item.id} video={item}/>)}</div>
      {!data.items.length && <p>{archive ? '조건에 맞는 등록 자료가 없습니다.' : '이 주소에 연결된 등록 자료가 없습니다. 미조사 장소에도 자료가 있을 수 있습니다.'}</p>}
      {data.total > data.pageSize && <nav className="video-pagination" aria-label="영상 목록 페이지"><button type="button" disabled={data.page <= 1} onClick={() => setPage(data.page - 1)}>이전</button><span>{data.page} / {Math.ceil(data.total / data.pageSize)} · {data.total}개</span><button type="button" disabled={data.page * data.pageSize >= data.total} onClick={() => setPage(data.page + 1)}>다음</button></nav>}
      {archive && <p className="video-scope-note">유튜브 URL {data.meta.normalizedUrlCount}개의 형식을 정리했습니다. 시간 표기가 맞지 않는 {data.meta.invalidTimeCount}개 장면은 바로 재생 기능을 제공하지 않습니다. 제외 목록은 원본과 내려받기 파일에 보존합니다.</p>}
    </>}
  </section>;
}
