'use client';
import {loadSdk} from '@/lib/kakao-map-sdk';
import {useEffect, useRef, useState} from 'react';
import {MapPin, Loader2, ExternalLink, Info, LocateFixed} from 'lucide-react';
import type {CoordinateResult} from '@/lib/providers';
import {placeMapView,verifiedMapPoint} from '@/lib/mcp-map-view';
import type {Parcel} from '@/lib/place-context';
type LatLng = {getLat: () => number; getLng: () => number};
type MapObject = {relayout: () => void; setCenter: (point: LatLng) => void; setLevel: (level: number) => void; setBounds: (bounds: unknown) => void; addControl: (control: unknown, position: unknown) => void; setZoomable: (value: boolean) => void};
type Marker = {setMap: (map: MapObject | null) => void; setPosition: (point: LatLng) => void; getPosition: () => LatLng};
export type Maps = {load: (callback: () => void) => void; LatLng: new(lat: number, lng: number) => LatLng; LatLngBounds: new(sw: LatLng, ne: LatLng) => unknown; Map: new(node: HTMLElement, options: Record<string, unknown>) => MapObject;
  Marker: new(options: Record<string, unknown>) => Marker; Polygon: new(options: Record<string, unknown>) => {setMap: (map: MapObject | null) => void};
  ZoomControl: new() => unknown; MapTypeControl: new() => unknown; ControlPosition: {RIGHT: unknown; TOPRIGHT: unknown};
  event: {addListener: (target: unknown, name: string, handler: (event?: {latLng: LatLng}) => void) => void; removeListener: (target: unknown, name: string, handler: (event?: {latLng: LatLng}) => void) => void}};
declare global {interface Window {kakao?: {maps: Maps}}}
export {loadSdk} from '@/lib/kakao-map-sdk';
export default function KakaoMapPanel({address, point, message, parcel, parcelMessage, onPick, picking = false}: {
  address?: string; point?: CoordinateResult; message?: string; parcel?: Parcel; parcelMessage?: string;
  onPick?: (point: {x: number; y: number}) => void; picking?: boolean;
}) {
  const container = useRef<HTMLDivElement>(null); const mapRef = useRef<MapObject | null>(null); const mapsRef = useRef<Maps | null>(null); const markerRef = useRef<Marker | null>(null);
  const propsRef = useRef({point, onPick}); propsRef.current = {point, onPick};
  const [state, setState] = useState('loading'); const [error, setError] = useState(''); const [attempt, setAttempt] = useState(0);
  const verified = verifiedMapPoint(point);
  useEffect(() => {
    let cancelled = false; let resize: ResizeObserver | undefined;
    let clickHandler: ((event?: {latLng: LatLng}) => void) | undefined; let dragHandler: (() => void) | undefined;
    const node = container.current; setState('loading'); setError('');
    loadSdk().then(maps => {
      if (cancelled || !node) return;
      mapsRef.current = maps;
      const selected = propsRef.current.point;
      const hasPoint = verifiedMapPoint(selected);
      const center = new maps.LatLng(hasPoint ? selected!.y! : 37.5665, hasPoint ? selected!.x! : 126.978);
      const map = new maps.Map(node, {center, level: hasPoint ? 3 : 7}); mapRef.current = map;
      if (!hasPoint) map.setBounds(new maps.LatLngBounds(new maps.LatLng(37.425, 126.764), new maps.LatLng(37.701, 127.184)));
      map.setZoomable(false); map.addControl(new maps.ZoomControl(), maps.ControlPosition.RIGHT); map.addControl(new maps.MapTypeControl(), maps.ControlPosition.TOPRIGHT);
      const marker = new maps.Marker({position: center, draggable: !!propsRef.current.onPick, title: '선택한 위치'}); markerRef.current = marker;
      if (hasPoint) marker.setMap(map);
      const pick = (position: LatLng) => {if (!propsRef.current.onPick) return; marker.setPosition(position); marker.setMap(map); propsRef.current.onPick({x: position.getLng(), y: position.getLat()});};
      clickHandler = event => {if (event?.latLng) pick(event.latLng);}; dragHandler = () => pick(marker.getPosition());
      maps.event.addListener(map, 'click', clickHandler); maps.event.addListener(marker, 'dragend', dragHandler);
      resize = new ResizeObserver(() => map.relayout()); resize.observe(node); setState('ready');
    }).catch(error => {if (!cancelled) {setError(error instanceof Error ? error.message : '지도를 불러오지 못했습니다.'); setState('error');}});
    return () => {cancelled = true; resize?.disconnect(); if (mapsRef.current && mapRef.current && clickHandler) mapsRef.current.event.removeListener(mapRef.current, 'click', clickHandler);
      if (mapsRef.current && markerRef.current && dragHandler) mapsRef.current.event.removeListener(markerRef.current, 'dragend', dragHandler);
      markerRef.current?.setMap(null); markerRef.current = null; mapRef.current = null; mapsRef.current = null; node?.replaceChildren();};
  }, [attempt]);
  useEffect(() => {
    const maps = mapsRef.current, map = mapRef.current, marker = markerRef.current;
    if (!maps || !map || !marker) return;
    if(!verified){marker.setMap(null);return;}
    const center = new maps.LatLng(point!.y!, point!.x!); marker.setPosition(center); marker.setMap(map); map.setCenter(center);
    if (point?.source !== 'map-click') map.setLevel(3);
  }, [point?.x, point?.y, point?.source, verified, state]);
  const parcelKey = parcel?.pnu + ':' + parcel?.queriedAt;
  useEffect(() => {
    const maps = mapsRef.current, map = mapRef.current; if (!maps || !map || !parcel) return;
    const polygons = parcel.polygons.map(polygon => new maps.Polygon({map, path: polygon.map(ring => ring.map(([x, y]) => new maps.LatLng(y, x))), strokeWeight: 3, strokeColor: '#c77f34', strokeOpacity: .9, fillColor: '#deb26b', fillOpacity: .15}));
    return () => polygons.forEach(polygon => polygon.setMap(null));
  }, [parcelKey, state]);
  function centerMap(all: boolean) {const maps = mapsRef.current, map = mapRef.current; if (!maps || !map) return; if (all || !verified) {map.setBounds(new maps.LatLngBounds(new maps.LatLng(37.425, 126.764), new maps.LatLng(37.701, 127.184))); return;} map.setCenter(new maps.LatLng(all || !verified ? 37.5665 : point!.y!, all || !verified ? 126.978 : point!.x!)); map.setLevel(all || !verified ? 7 : 3);}
  const external=placeMapView(address||'서울',point).externalUrl;
  return <section className="live-map-panel map-picker" aria-label="지도에서 서울 주소 선택">
    <div className="live-map-heading"><div><span className="overline">EXPLORE SEOUL ON THE MAP</span><h4><MapPin size={17}/>지도에서 위치를 선택하세요</h4></div><div className="map-picker-tools"><button type="button" onClick={() => centerMap(true)} disabled={state !== 'ready'}>서울 전체</button>{verified && <button type="button" onClick={() => centerMap(false)} disabled={state !== 'ready'}><LocateFixed size={13}/>선택한 위치</button>}<a href={external} target="_blank" rel="noopener noreferrer">큰 지도<ExternalLink size={13}/></a></div></div>
    <p className="map-picker-intro">지도를 이동한 뒤 원하는 곳을 클릭하거나 터치하세요. 표시된 핀을 옮겨 다시 선택할 수도 있습니다.</p>
    <div className="live-map-frame"><div ref={container} className="live-map-canvas" aria-label="서울 지도. 클릭하거나 핀을 끌어 위치를 선택할 수 있습니다."/>
      {state !== 'ready' && <div className="live-map-overlay" role={state === 'error' ? 'alert' : 'status'}>{state === 'loading' ? <><Loader2 size={23} className="spin"/><p>서울 지도를 불러오는 중입니다.</p></> : <><Info size={23}/><p>{error}</p><a href={external} target="_blank" rel="noopener noreferrer">외부 지도에서 주소 확인</a><button className="outline-button" onClick={() => setAttempt(value => value + 1)}>지도 다시 불러오기</button></>}</div>}
      {state === 'ready' && picking && <div className="map-picker-busy" role="status"><Loader2 size={15} className="spin"/>선택한 지점의 주소 확인 중</div>}
    </div>
    <div className="map-picker-selection" aria-live="polite"><MapPin size={16}/><div><strong>{picking ? '주소를 확인하고 있습니다.' : address || '지도에 핀을 찍으면 주소와 관련 사진을 찾아드립니다.'}</strong>{!picking && (message||!verified) && <p>{message||'확인된 좌표가 없어 주소 검색 링크를 제공합니다. 지도 중심은 선택한 주소의 위치가 아닙니다.'}</p>}</div></div>
    {parcel && <p className="live-map-parcel"><span/>주황색 선: 현재 지번과 일치하는 필지 참고 경계 · <a href={parcel.sourceUrl} target="_blank" rel="noopener noreferrer">브이월드 연속지적도</a></p>}{parcelMessage && <p className="help-text">필지 경계: {parcelMessage}</p>}
    <p className="help-text">확대·축소 버튼으로 지도를 조절할 수 있습니다. 지도·스카이뷰는 현재 모습이며, 사진과 개별 건물·필지의 역사적 일치는 별도 확인이 필요합니다.</p>
  </section>;
}
