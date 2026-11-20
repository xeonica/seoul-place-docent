import publicationSnapshot from '../data/museum-publications-cache.json';
import {assertSeoul, checkedFetch, parcelParams, ServiceError, type Address} from './providers';
import {cleanText, readProviderXml} from './archives';

export type PlaceContextSecrets = {CLOSED_BUILDING_API_KEY?: string; VWORLD_API_KEY?: string; SEOUL_OPEN_DATA_API_KEY?: string};
export const CLOSED_SOURCE = 'https://www.data.go.kr/data/15137093/openapi.do';
export const PARCEL_SOURCE = 'https://www.vworld.kr/dev/v4dv_2ddataguide2_s002.do?svcIde=cadastral';
export const PUBLICATIONS_SOURCE = 'https://data.seoul.go.kr/dataList/OA-23062/S/1/datasetView.do';
const text = (r: Record<string, unknown>, k: string) => String(r[k] ?? '').trim();
export type ClosedBuilding = {id: string; name: string; use: string; lotAddress: string; roadAddress: string; approved: string; area: string; above: string; below: string; closureType: string};
export type Parcel = {pnu: string; address: string; jibun: string; referenceYear: string; polygons: number[][][][]; sourceUrl: string; queriedAt: string};
export type ClosedResult = {items: ClosedBuilding[]; total: number; truncated: boolean; sourceUrl: string; queriedAt: string};
export type ContextSection<T> = {status: 'ok'; data: T} | {status: 'unavailable'; message: string; code: string};
export type PlaceContext = {closed: ContextSection<ClosedResult>; parcel: ContextSection<Parcel>; queriedAt: string};

export function normalizeClosedBuildings(body: Record<string, any>, address: Address): ClosedResult {
  const response = body.response;
  const code = String(response?.header?.resultCode ?? body.OpenAPI_ServiceResponse?.cmmMsgHeader?.returnReasonCode ?? 'UNKNOWN');
  if (!['00', '0'].includes(code)) {
    const reason = code === '31' ? '폐쇄말소대장 API 이용 기간이 만료되었습니다.' : ['20', '30'].includes(code) ? '폐쇄말소대장 API 활용신청·인증 상태를 확인해야 합니다.' : '폐쇄말소대장 제공기관의 응답을 확인하지 못했습니다.';
    throw new ServiceError('CLOSED_' + code, reason, 503);
  }
  const p = parcelParams(address);
  const raw = response.body?.items?.item;
  const rows: Record<string, unknown>[] = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? [raw] : [];
  const items = rows.filter(r => text(r, 'sigunguCd') === p.sigunguCd && text(r, 'bjdongCd') === p.bjdongCd && text(r, 'platGbCd') === p.platGbCd && text(r, 'bun').padStart(4, '0') === p.bun && text(r, 'ji').padStart(4, '0') === p.ji)
    .map(r => ({id: text(r, 'mgmBldrgstPk'), name: text(r, 'bldNm'), use: text(r, 'mainPurpsCdNm'), lotAddress: text(r, 'platPlc'), roadAddress: text(r, 'newPlatPlc'), approved: text(r, 'useAprDay'), area: text(r, 'totArea'), above: text(r, 'grndFlrCnt'), below: text(r, 'ugrndFlrCnt'), closureType: text(r, 'shtGbCdNm')}));
  const total = Number(response.body?.totalCount ?? 0);
  return {items, total, truncated: total > rows.length, sourceUrl: CLOSED_SOURCE, queriedAt: new Date().toISOString()};
}
export async function closedBuildings(address: Address, secrets: PlaceContextSecrets) {
  if (!secrets.CLOSED_BUILDING_API_KEY) throw new ServiceError('CLOSED_KEY', '폐쇄말소대장 연결을 준비 중입니다.', 503);
  const u = new URL('https://apis.data.go.kr/1613000/ShtRgstHubService/getSrTitleInfo');
  Object.entries({...parcelParams(address), serviceKey: secrets.CLOSED_BUILDING_API_KEY, _type: 'json', pageNo: '1', numOfRows: '100'}).forEach(([k,v]) => u.searchParams.set(k,v));
  const raw = await (await checkedFetch(u, {redirect: 'error'})).text();
  let body: Record<string, any>;
  try {body = raw.trim().startsWith('<') ? readProviderXml(raw) : JSON.parse(raw);} catch {throw new ServiceError('CLOSED_FORMAT', '폐쇄말소대장 응답 형식을 확인하지 못했습니다.');}
  return normalizeClosedBuildings(body, address);
}
export function parcelNumber(address: Address) {
  assertSeoul(address); const p = parcelParams(address);
  return address.admCd + (address.mtYn === '1' ? '2' : '1') + p.bun + p.ji;
}
export function normalizeParcel(body: Record<string, any>, pnu: string): Parcel {
  const r = body.response;
  if (r?.status === 'NOT_FOUND') throw new ServiceError('PARCEL_NOT_FOUND', '현재 지번과 일치하는 필지 도형을 확인하지 못했습니다.', 404);
  if (r?.status !== 'OK') throw new ServiceError('PARCEL_PROVIDER', '브이월드 인증키·등록 도메인 또는 제공기관 응답을 확인해야 합니다.', 503);
  const feature = r.result?.featureCollection?.features?.find((f: any) => String(f.properties?.pnu) === pnu);
  if (!feature) throw new ServiceError('PARCEL_MISMATCH', '응답 필지와 현재 지번의 일치를 확인하지 못했습니다.', 404);
  const geometry = feature.geometry;
  const polygons = geometry?.type === 'Polygon' ? [geometry.coordinates] : geometry?.type === 'MultiPolygon' ? geometry.coordinates : null;
  if (!Array.isArray(polygons) || !polygons.length || polygons.length > 50 || !polygons.every(poly => Array.isArray(poly) && poly.length > 0 && poly.length <= 50 && poly.every((ring: any) => Array.isArray(ring) && ring.length >= 4 && ring.length <= 10000 && ring.every((pt: any) => Array.isArray(pt) && pt.length >= 2 && typeof pt[0] === 'number' && typeof pt[1] === 'number' && Number.isFinite(pt[0]) && Number.isFinite(pt[1]) && pt[0] >= 126.7 && pt[0] <= 127.3 && pt[1] >= 37.4 && pt[1] <= 37.8)))) throw new ServiceError('PARCEL_GEOMETRY', '표시할 수 있는 서울 필지 도형을 확인하지 못했습니다.');
  return {pnu, address: cleanText(feature.properties.addr), jibun: cleanText(feature.properties.jibun), referenceYear: cleanText(feature.properties.gosi_year), polygons, sourceUrl: PARCEL_SOURCE, queriedAt: new Date().toISOString()};
}
export async function currentParcel(address: Address, secrets: PlaceContextSecrets) {
  if (!secrets.VWORLD_API_KEY) throw new ServiceError('PARCEL_KEY', '필지 경계 연결을 준비 중입니다.', 503);
  const pnu = parcelNumber(address); const u = new URL('https://api.vworld.kr/req/data');
  Object.entries({service: 'data', version: '2.0', request: 'GetFeature', data: 'LP_PA_CBND_BUBUN', key: secrets.VWORLD_API_KEY, domain: 'https://seoul-place-history.xeonire.chatgpt.site', format: 'json', crs: 'EPSG:4326', attrFilter: 'pnu:=:' + pnu, size: '1', geometry: 'true'}).forEach(([k,v]) => u.searchParams.set(k,v));
  const response = await checkedFetch(u, {redirect: 'error'});
  let body: Record<string, any>; try {body = await response.json();} catch {throw new ServiceError('PARCEL_FORMAT', '브이월드 응답 형식을 확인하지 못했습니다.');}
  return normalizeParcel(body, pnu);
}

export type MuseumPublication = {id: string; title: string; published: string; registered: string; museum: string; category: string; ebookUrl: string | null; description: string};
export function normalizePublications(body: Record<string, any>) {
  const data = body.HisMuseumPublica; const code = data?.RESULT?.CODE ?? body.RESULT?.CODE;
  if (code === 'INFO-200') return {items: [] as MuseumPublication[], total: 0};
  if (code !== 'INFO-000' || !Array.isArray(data?.row)) throw new ServiceError('PUBLICATIONS_' + String(code || 'FORMAT'), code === 'INFO-100' ? '서울 열린데이터광장 인증키를 확인해야 합니다.' : '박물관 간행물 제공기관의 응답을 확인하지 못했습니다.', 503);
  const items: MuseumPublication[] = data.row.map((r: Record<string, unknown>) => {
    let ebookUrl: string | null = null;
    try {const u = new URL(text(r, 'EBOOKURL')); if (u.hostname === 'museum.seoul.go.kr' && ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password) {u.protocol = 'https:'; ebookUrl = u.href;}} catch {}
    return {id: text(r, 'SEQ'), title: cleanText(r.TITLE), published: cleanText(r.PUBLISHDT), registered: cleanText(r.REGDT), museum: cleanText(r.MUSEUMNM) || '서울역사박물관', category: cleanText(r.BOOKCTGNM), ebookUrl, description: cleanText(r.CONTENTS).slice(0, 600)};
  });
  return {items, total: Number(data.list_total_count ?? items.length)};
}
let publicationCache: {expires: number; items: MuseumPublication[]; total: number; queriedAt: string; mode: 'live' | 'snapshot'} | undefined;
export async function museumPublications(terms: string[], secrets: PlaceContextSecrets) {
  if (!secrets.SEOUL_OPEN_DATA_API_KEY) throw new ServiceError('PUBLICATIONS_KEY', '박물관 간행물 연결을 준비 중입니다.', 503);
  const queries = [...new Set(terms.map(q => q.trim()).filter(q => q.length >= 2 && q.length <= 40).flatMap(q => [q, q.replace(/동\d가$/, '동')]))];
  if (!queries.length) throw new ServiceError('PUBLICATIONS_QUERY', '검색할 지역을 선택해 주세요.', 400);
  if (!publicationCache || publicationCache.expires < Date.now()) {
    // Seoul's official API endpoint uses HTTP on port 8088; the key stays server-side.
    const url = 'http://openapi.seoul.go.kr:8088/' + encodeURIComponent(secrets.SEOUL_OPEN_DATA_API_KEY) + '/json/HisMuseumPublica/1/1000/';
    try {
      const response = await checkedFetch(url, {redirect: 'error'});
      let body: Record<string, any>; try {body = await response.json();} catch {throw new ServiceError('PUBLICATIONS_FORMAT', '박물관 간행물 응답 형식을 확인하지 못했습니다.');}
      publicationCache = {...normalizePublications(body), expires: Date.now() + 60 * 60 * 1000, queriedAt: new Date().toISOString(), mode: 'live'};
    } catch (error) {
      if (error instanceof ServiceError && error.code === 'PUBLICATIONS_INFO-100') throw error;
      publicationCache = {...normalizePublications(publicationSnapshot.data), expires: Date.now() + 5 * 60 * 1000, queriedAt: publicationSnapshot.queriedAt, mode: 'snapshot'};
    }
  }
  const items = publicationCache.items.filter(item => queries.some(q => (item.title + ' ' + item.description).includes(q)));
  return {items: items.slice(0, 8), total: items.length, providerTotal: publicationCache.total, truncated: publicationCache.total > 1000 || items.length > 8, terms: queries, mode: publicationCache.mode, queriedAt: publicationCache.queriedAt, sourceUrl: PUBLICATIONS_SOURCE};
}
export type MuseumPublications = Awaited<ReturnType<typeof museumPublications>>;
