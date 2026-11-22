import {validateMapPoint} from './map-address';
import type {Secrets} from './providers';

export type KakaoPlace = {name: string; x: number; y: number; category: string; addressName: string; roadAddressName: string; placeUrl: string};
type KakaoDocument = {place_name?: string; x?: string; y?: string; category_name?: string; address_name?: string; road_address_name?: string; place_url?: string};

const compact = (value: string) => value.normalize('NFKC').replace(/\s+/g, '').toLocaleLowerCase('ko-KR');

/**
 * Find a Seoul landmark (bridge, plaza, park) by name with Kakao keyword search.
 * Returns null when the key is missing, the request fails, or nothing in Seoul matches,
 * so the caller can continue with the research catalog alone.
 */
export async function searchKakaoPlace(query: string, secrets: Secrets): Promise<KakaoPlace | null> {
  if (!secrets.KAKAO_REST_API_KEY) return null;
  const url = new URL('https://dapi.kakao.com/v2/local/search/keyword.json');
  url.search = new URLSearchParams({query, size: '10'}).toString();
  let documents: KakaoDocument[];
  try {
    const response = await fetch(url, {headers: {Authorization: 'KakaoAK ' + secrets.KAKAO_REST_API_KEY}, signal: AbortSignal.timeout(8000)});
    if (!response.ok) return null;
    const body = await response.json() as {documents?: unknown};
    if (!Array.isArray(body.documents)) return null;
    documents = body.documents as KakaoDocument[];
  } catch {
    return null;
  }
  const target = compact(query);
  const seoul = documents.filter(doc => /^서울/.test(doc.address_name || ''));
  // Prefer the exact name, then a name that starts with the query (e.g. not "성수대교 북단 주차장").
  const ranked = [
    ...seoul.filter(doc => compact(doc.place_name || '') === target),
    ...seoul.filter(doc => compact(doc.place_name || '').startsWith(target)),
    ...seoul.filter(doc => compact(doc.place_name || '').includes(target)),
  ];
  for (const doc of ranked) {
    const x = Number(doc.x), y = Number(doc.y);
    try { validateMapPoint(x, y); } catch { continue; }
    return {name: doc.place_name || query, x, y, category: doc.category_name || '', addressName: doc.address_name || '', roadAddressName: doc.road_address_name || '', placeUrl: doc.place_url || ''};
  }
  return null;
}
