import {photoResearchBundle as bundle} from '../../../../lib/photo-research-data';
import districtSummary from '../../../../data/photo-research/district-summary.json';
import {filterPhotoResearch, placePhotoResearch, type PhotoResearchFilters} from '../../../../lib/photo-research';
const headers = {'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff'};
let districtPhotosPromise: Promise<{items: typeof bundle.items}> | undefined;
async function loadDistrictPhotos(request: Request) {
  districtPhotosPromise ||= (async () => {
    const response = await fetch(new URL('/research/seoul-district-collection/photos-index.json.gz', request.url));
    if (!response.ok || !response.body) throw new Error('사진·지도 조사자료 인덱스를 읽지 못했습니다.');
    const stream = response.body.pipeThrough(new DecompressionStream('gzip'));
    return await new Response(stream).json() as {items: typeof bundle.items};
  })();
  return districtPhotosPromise;
}
export async function GET(request: Request) {
  const incoming = await loadDistrictPhotos(request);
  const items = [...bundle.items, ...incoming.items];
  const sourceCounts = new Map<string, number>();
  const previewCounts = new Map<string, number>();
  for (const item of items) {
    if (item.sourceUrl) sourceCounts.set(item.sourceKey, (sourceCounts.get(item.sourceKey) || 0) + 1);
    if (item.previewUrl) previewCounts.set(item.previewUrl, (previewCounts.get(item.previewUrl) || 0) + 1);
  }
  const mergedBundle = {...bundle, meta: {...bundle.meta, files: [...bundle.meta.files, ...(districtSummary as unknown as {files: typeof bundle.meta.files}).files]}, items: items.map(item => ({...item, sameSourceCount: sourceCounts.get(item.sourceKey) || 0, samePreviewCount: previewCounts.get(item.previewUrl || '') || 0}))};
  const p = new URL(request.url).searchParams;
  if (p.get('mode') === 'place') return Response.json(placePhotoResearch(mergedBundle, (p.get('district') || '').slice(0, 20), p.getAll('dong').slice(0, 20), Number(p.get('visualPage') || 1)), {headers});
  const batch = p.get('batch') || '';
  if (batch && !mergedBundle.meta.files.some(f => f.id === batch)) return Response.json({error: '사진 조사묶음을 확인해 주세요.'}, {status: 400, headers});
  const filters: PhotoResearchFilters = {
    query: (p.get('q') || '').slice(0, 150), district: p.get('district') || '', batch,
    provider: p.get('provider') || '', scope: p.get('scope') || '', source: p.get('source') || '', id: bundle.meta.integratedResearch?.idAliases[p.get('id') || ''] || p.get('id') || '',
    review: p.get('review') || '', previewOnly: p.get('preview') === '1', repeatsOnly: p.get('repeats') === '1', conflictsOnly: p.get('conflicts') === '1',
    recordType: p.get('type') || '', mediaType: p.get('media') || '',
    dong: (p.get('dong') || '').slice(0, 30), target: (p.get('target') || '').slice(0, 60),
  };
  const rows = filterPhotoResearch(mergedBundle, filters);
  const pageValue = Number(p.get('page') || 1);
  const page = Math.min(Math.max(1, Number.isFinite(pageValue) ? Math.floor(pageValue) : 1), Math.max(1, Math.ceil(rows.length / 20)));
  const download = p.get('download') === '1';
  return Response.json({total: rows.length, page, pageSize: 20, rows: download ? rows : rows.slice((page - 1) * 20, page * 20),
    sourceUrlCount: new Set(rows.filter(r => r.sourceUrl).map(r => r.sourceUrl)).size,
    candidateCount: rows.filter(r => r.candidate).length,
    ...(download ? {provenance: bundle.meta, filters} : {})}, {headers: {...headers,
    ...(download ? {'Content-Disposition': 'attachment; filename="seoul-neighborhood-photo-research.json"'} : {})}});
}

