import regions from '../data/seoul-regions.json';

export type DistrictResearchKind = 'articles' | 'photos';
export type DistrictResearchIndex<T> = {district: string; rows: T[]; registered: number};

const districtNames = new Set(regions.districts.map((district) => district.name));
const cache = new Map<string, Promise<DistrictResearchIndex<unknown>>>();
const MAX_CACHED_SHARDS = 4;

export function isSeoulDistrict(value: string): boolean {
  return districtNames.has(value);
}

export function seoulDistrictNames(): string[] {
  return regions.districts.map((district) => district.name);
}

function shardUrl(baseUrl: string, kind: DistrictResearchKind, district: string) {
  if (!isSeoulDistrict(district)) throw new Error('서울 자치구를 확인해 주세요.');
  return new URL(`/research/seoul-district-collection/shards/${kind}/${encodeURIComponent(district)}.json.gz`, baseUrl);
}

function parseRows(value: unknown, kind: DistrictResearchKind): unknown[] {
  if (!value || typeof value !== 'object') throw new Error('역사자료 인덱스 형식이 올바르지 않습니다.');
  const rows = (value as Record<string, unknown>)[kind === 'articles' ? 'rows' : 'items'];
  if (!Array.isArray(rows)) throw new Error('역사자료 인덱스에 자료 목록이 없습니다.');
  return rows;
}

async function load<T>(baseUrl: string, kind: DistrictResearchKind, district: string): Promise<DistrictResearchIndex<T>> {
  const url = shardUrl(baseUrl, kind, district);
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`${district} ${kind} 인덱스를 읽지 못했습니다.`);
  const stream = response.body.pipeThrough(new DecompressionStream('gzip'));
  const parsed = await new Response(stream).json();
  const rows = parseRows(parsed, kind);
  if (rows.some((row) => !row || typeof row !== 'object' || (row as Record<string, unknown>).district !== district)) {
    throw new Error(`${district} ${kind} 인덱스의 지역 정보가 일치하지 않습니다.`);
  }
  return {district, rows: rows as T[], registered: rows.length};
}

/**
 * Read one compressed district shard at a time. Only four shards are retained
 * per Worker instance so a broad archive search cannot pin all 50k rows in memory.
 */
export function loadDistrictResearchIndex<T>(baseUrl: string, kind: DistrictResearchKind, district: string): Promise<DistrictResearchIndex<T>> {
  const url = shardUrl(baseUrl, kind, district);
  const key = `${kind}:${url.href}`;
  const existing = cache.get(key);
  if (existing) {
    cache.delete(key);
    cache.set(key, existing);
    return existing as Promise<DistrictResearchIndex<T>>;
  }
  const task = load<T>(baseUrl, kind, district);
  cache.set(key, task as Promise<DistrictResearchIndex<unknown>>);
  while (cache.size > MAX_CACHED_SHARDS) cache.delete(cache.keys().next().value!);
  task.catch(() => cache.delete(key));
  return task;
}

export function clearDistrictResearchIndexCacheForTests() {
  cache.clear();
}
