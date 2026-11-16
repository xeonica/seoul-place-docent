'use client';

import {useEffect, useMemo, useRef, useState} from 'react';
import {ArrowUpRight, ChevronDown, FileText, MapPin} from 'lucide-react';
import type {AISummary} from '@/lib/ai-summary';
import type {VisitEvidence} from '@/lib/mcp-place-history';
import {photoResearchUrl} from '@/lib/photo-research';
import {loadSdk} from './KakaoMapPanel';
import './docent-visit.css';

type Point = {latitude: number; longitude: number};
function validPoint(point: Point | null | undefined): point is Point {
  return !!point && Number.isFinite(point.latitude) && Number.isFinite(point.longitude)
    && Math.abs(point.latitude) <= 90 && Math.abs(point.longitude) <= 180;
}

function Source({url, children}: {url?: string | null; children: React.ReactNode}) {
  const href = photoResearchUrl(url || undefined);
  return href ? <a className="visit-source" href={href} target="_blank" rel="noopener noreferrer">{children}<ArrowUpRight size={14}/></a> : null;
}

function MiniMap({address, point, records, en}: {address: string; point?: Point; records: VisitEvidence['mappedRecords']; en: boolean}) {
  const canvas = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [mapState, setMapState] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [showMap, setShowMap] = useState(false);
  const visible = useMemo(() => records.filter(record => validPoint(record.spatialRelation.point)), [records]);
  const lat = point?.latitude, lng = point?.longitude;
  const current = validPoint(point);
  useEffect(() => {
    if (!showMap || lat === undefined || lng === undefined || !validPoint({latitude:lat, longitude:lng})) return;
    const node = canvas.current;
    if (!node) return;
    let active = true;
    let dispose = () => {};
    setMapState('loading');
    loadSdk().then(maps => {
      if (!active) return;
      const center = new maps.LatLng(lat, lng);
      const map = new maps.Map(node, {center, level:4, scrollwheel:false});
      map.addControl(new maps.ZoomControl(), maps.ControlPosition.RIGHT);
      const marker = new maps.Marker({map, position:center, title:address, zIndex:2, clickable:true});
      const clear = () => setSelected(null);
      maps.event.addListener(marker,'click',clear);
      const bounds = new maps.LatLngBounds();
      bounds.extend(center);
      let distributed = false;
      const pins = visible.flatMap(record => {
        const loc = record.spatialRelation.point;
        if (!loc) return [];
        const position = new maps.LatLng(loc.latitude, loc.longitude);
        bounds.extend(position);
        if (Math.hypot(loc.latitude - lat, loc.longitude - lng) > .00015) distributed = true;
        const item = new maps.Marker({map, position, title:record.title, clickable:true, zIndex:3});
        const select = () => setSelected(record.id);
        maps.event.addListener(item,'click',select);
        return [{item, select}];
      });
      if (distributed) map.setBounds(bounds);
      const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => map.relayout());
      observer?.observe(node);
      dispose = () => {
        observer?.disconnect();
        maps.event.removeListener(marker,'click',clear);
        marker.setMap(null);
        for (const {item,select} of pins) {
          maps.event.removeListener(item,'click',select);
          item.setMap(null);
        }
      };
      setMapState('ready');
    }).catch(() => {if (active) setMapState('unavailable');});
    return () => {active = false; dispose(); node.replaceChildren();};
  }, [address, attempt, lat, lng, showMap, visible]);
  const details = visible.find(record => record.id === selected);
  return <section className="visit-map" id="visit-map" aria-label={en ? 'Historical places map' : '현장 미니맵'}>
    <div className="visit-map-heading"><h3><MapPin size={20}/>{en ? 'Places around you' : '현장 미니맵'}</h3>
      {current && <Source url={`https://map.kakao.com/link/map/${encodeURIComponent(address)},${lat},${lng}`}>{en ? 'Open Kakao Map' : '큰 지도'}</Source>}
    </div>
    {!current ? <p className="visit-note">{en ? 'A confirmed address point is needed for the map.' : '선택한 주소의 좌표를 확인하면 지도에 표시할 수 있어요.'}</p> :
      !showMap ? <button type="button" className="visit-action" onClick={()=>setShowMap(true)}>{en ? 'Open mini map' : '미니맵 열기'}</button> :
      <div className="visit-map-frame">
        <div ref={canvas} className="visit-map-canvas" aria-label={en ? 'Selected location and historical places' : '선택한 위치와 역사 장소 지도'}/>
        {mapState !== 'ready' && <div className="visit-map-message">
          <p role="status">{mapState === 'loading' ? (en ? 'Loading the map…' : '지도를 불러오는 중이에요.') : (en ? 'The map is unavailable. Use the place list below.' : '지도를 열 수 없어요. 아래 장소 목록에서 자료를 볼 수 있어요.')}</p>
          {mapState === 'unavailable' && <button type="button" className="visit-action" onClick={()=>setAttempt(value=>value+1)}>{en ? 'Try again' : '지도 다시 열기'}</button>}
        </div>}
      </div>}
    {current && <p className="visit-note">{en ? 'Distances are straight lines between confirmed reference points.' : '거리 표시는 확인된 두 지점 사이의 직선거리예요.'}</p>}
    {visible.length > 0 ? <div className="visit-marker-list" role="group" aria-label={en ? 'Historical places' : '역사 장소 선택'}>
      {visible.map(record => <button type="button" key={record.id} className="visit-action" aria-pressed={selected === record.id}
        onClick={()=>setSelected(record.id)}>
        {record.title}{record.spatialRelation.distanceMeters != null ? ` · ${record.spatialRelation.distanceMeters.toLocaleString(en?'en':'ko-KR')}m` : ''}
      </button>)}
    </div> : current && <p className="visit-note">{en ? 'No historical reference points confirmed nearby.' : '주변 자료 중 지도에 표시할 위치가 확인된 기록은 아직 없어요.'}</p>}
    {details && <article className="visit-map-detail" aria-live="polite">
      <h4>{details.title}</h4>
      <p className="visit-note">{details.date} · {details.spatialRelation.category === 'direct' ? (en ? 'Confirmed parcel' : '필지 관련 기록') : (en ? 'Nearby record' : '주변 참고 기록')}</p>
      <p>{details.text}</p>
      <div className="visit-links">
        <Source url={details.url}>{en ? 'Original record' : '자료 원문'}</Source>
        <Source url={details.spatialRelation.locationSource}>{en ? 'Location source' : '위치 출처'}</Source>
        {details.photo && <Source url={details.photo.sourceUrl}>{en ? 'Photo and terms' : '사진·이용 조건 보기'}</Source>}
      </div>
      {details.photo && <p className="visit-note">{details.photo.credit} · {details.photo.terms}</p>}
    </article>}
  </section>;
}

const emptyRecords: VisitEvidence['mappedRecords'] = [];

export default function DocentVisitEvidence({token, address, point, ai, en, children}: {
  token?: string; address: string; point?: Point; ai: AISummary | null; en: boolean; children: React.ReactNode;
}) {
  const [result, setResult] = useState<{token: string; data: VisitEvidence | null} | null>(null);
  const ready = result?.token === token ? result : null;
  const data = ready?.data;
  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    fetch('/api/docent/visit', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({token}), signal:controller.signal,
    }).then(async response => {
      if (!response.ok) throw new Error('visit lookup');
      const data = await response.json() as VisitEvidence;
      if (!controller.signal.aborted) setResult({token,data});
    }).catch(() => {if (!controller.signal.aborted) setResult({token,data:null});});
    return () => controller.abort();
  }, [token]);
  return <>
    <MiniMap address={address} point={data?.spatial.origin ?? point} records={data?.mappedRecords ?? emptyRecords} en={en}/>
    {children}
    <details className="place-disclosure visit-evidence">
      <summary><FileText size={17}/><span>{en ? 'Sources and MCP verification details' : '데이터 출처 및 MCP 검증 내역 확인하기'}</span><ChevronDown size={17}/></summary>
      <div className="place-disclosure-content">
        <dl className="visit-receipt">
          <dt>{en ? 'Selected address' : '주소 검색 결과'}</dt><dd>{address}</dd>
          <dt>{en ? 'MCP history lookup' : 'MCP 자료 조회'}</dt>
          <dd>{data ? `get_place_history · ${data.returned}/${data.available}${en ? ' records · website lookup' : '건 반환 · 홈페이지 조회'}`
            : !token ? (en ? 'Select a street address to look up history.' : '도로명주소를 선택하면 조회 결과를 확인할 수 있어요.')
              : ready ? (en ? 'Lookup not confirmed' : '이번 조회를 확인하지 못했어요.') : (en ? 'Looking up sources…' : '자료를 확인하는 중이에요.')}</dd>
          <dt>{en ? 'Trace' : 'MCP 추적'}</dt>
          <dd>{data?.receipt ? <><code>{data.receipt.requestId}</code><br/>{data.receipt.auditPersisted ? (en ? 'Audit storage confirmed' : '서버 감사 로그 저장 확인') : (en ? 'Persistent storage not confirmed' : '영구 로그 저장 미확인')}</> : '—'}</dd>
          <dt>{en ? 'Evidence validation' : '근거 검사'}</dt>
          <dd>{en ? 'MCP answer validation was not run on this page.' : '이 화면에서는 MCP 답변 검증(validate_place_answer)을 실행하지 않았어요.'}
            {ai && <p>{en ? `Website AI draft: citation checks, ${ai.omitted} lines excluded.` : `홈페이지 AI 초안은 출처 ID와 인용 구절을 검사했어요. 제외한 문장 ${ai.omitted}개.`}</p>}</dd>
          <dt>{en ? 'AI activity' : '확인 가능한 AI 호출 정보'}</dt>
          <dd>{en ? 'The MCP history tool makes zero model calls.' : '이 MCP 자료 조회의 모델 호출은 0회예요.'}
            {ai && <p>{ai.model} · {ai.cached ? (en?'Saved website explanation':'홈페이지에 저장된 해설') : (en?'Website AI explanation returned':'홈페이지 AI 해설 응답 확인')} · {new Date(ai.generatedAt).toLocaleString(en?'en':'ko-KR',{timeZone:'Asia/Seoul'})}</p>}</dd>
        </dl>
        {!!data?.sources.length && <><h4>{en ? 'Sources in the history lookup' : '이번 조회에 사용한 자료 출처'}</h4>
          <ul className="visit-source-list">{data.sources.map(source => <li key={source.url}><Source url={source.url}>{source.title}</Source> <small>{source.institution}</small></li>)}</ul></>}
        {!!ai?.sentences.length && <><h4>{en ? 'Evidence used in the website explanation' : '홈페이지 해설에 인용한 근거'}</h4>
          <ul className="visit-source-list">{ai.sentences.map((sentence,index) => <li key={sentence.evidenceId+':'+index}>
            <Source url={sentence.sourceUrl}>{sentence.sourceTitle}</Source>
            <p>{sentence.quote}</p>
          </li>)}</ul></>}
        <p className="visit-note">{en ? 'ChatGPT, Claude and Gemini conversations are not visible here.' : 'ChatGPT·Claude·Gemini에서 작성한 답변이나 외부 AI 호출은 이 화면에서 확인할 수 없어요.'}</p>
      </div>
    </details>
  </>;
}
