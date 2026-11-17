import {publicPhotoItem} from '@/lib/photo-verification';
import {photoResearchBundle as bundle} from '../../../../lib/photo-research-data';
import districtSummary from '../../../../data/photo-research/district-summary.json';
import {filterPhotoResearch, placePhotoResearch, type PhotoResearchFilters, type PhotoResearchItem} from '../../../../lib/photo-research';
import {isSeoulDistrict, loadDistrictResearchIndex, seoulDistrictNames} from '../../../../lib/district-history-index';

const headers = {'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff'};
const PAGE_SIZE = 20;
const summary = districtSummary as unknown as {files: typeof bundle.meta.files; count: number};
const meta = {...bundle.meta, files: [...bundle.meta.files, ...summary.files], recordCount: bundle.meta.recordCount + summary.count};

function pageNumber(rawPage: string | null) {
  const value = Number(rawPage || 1);
  return Math.min(5000, Math.max(1, Number.isFinite(value) ? Math.floor(value) : 1));
}

function selectPage(rows: PhotoResearchItem[], start: number, end: number, selected: PhotoResearchItem[], tail: PhotoResearchItem[]) {
  const from = Math.max(0, start);
  const to = Math.min(rows.length, end);
  if (from < to) selected.push(...rows.slice(from, to));
  tail.push(...rows);
  if (tail.length > PAGE_SIZE) tail.splice(0, tail.length - PAGE_SIZE);
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const district = (params.get('district') || '').slice(0, 20);
  if (params.get('mode') === 'place') {
    if (!isSeoulDistrict(district)) return Response.json({error: '서울 자치구를 선택해 주세요.'}, {status: 400, headers});
    const index = await loadDistrictResearchIndex<PhotoResearchItem>(request.url, 'photos', district);
    const mergedBundle = {...bundle, meta, items: [...bundle.items, ...index.rows]};
    return Response.json(placePhotoResearch(mergedBundle, district, params.getAll('dong').slice(0, 20), Number(params.get('visualPage') || 1)), {headers});
  }

  const batch = params.get('batch') || '';
  if (batch && !meta.files.some((file) => file.id === batch)) return Response.json({error: '사진 조사묶음을 확인해 주세요.'}, {status: 400, headers});
  const filters: PhotoResearchFilters = {
    query: (params.get('q') || '').slice(0, 150), district, batch,
    provider: params.get('provider') || '', scope: params.get('scope') || '', source: params.get('source') || '', id: bundle.meta.integratedResearch?.idAliases[params.get('id') || ''] || params.get('id') || '',
    review: params.get('review') || '', previewOnly: params.get('preview') === '1', repeatsOnly: params.get('repeats') === '1', conflictsOnly: params.get('conflicts') === '1',
    recordType: params.get('type') || '', mediaType: params.get('media') || '', dong: (params.get('dong') || '').slice(0, 30), target: (params.get('target') || '').slice(0, 60),
  };
  const requestedPage = pageNumber(params.get('page'));
  const download = params.get('download') === '1';
  const selected: PhotoResearchItem[] = [];
  const tail: PhotoResearchItem[] = [];
  const sourceUrls = new Set<string>();
  let total = 0;
  let candidateCount = 0;
  let start = 0;
  const lower = (requestedPage - 1) * PAGE_SIZE;
  const upper = lower + PAGE_SIZE;
  const legacy = filterPhotoResearch(bundle, filters);
  total += legacy.length;
  candidateCount += legacy.filter((item) => item.candidate).length;
  for (const item of legacy) if (item.sourceUrl) sourceUrls.add(item.sourceUrl);
  if (download) selected.push(...legacy);
  else selectPage(legacy, lower, upper, selected, tail);
  start += legacy.length;

  let districts = seoulDistrictNames();
  if (filters.district) districts = isSeoulDistrict(filters.district) ? [filters.district] : [];
  if (batch) {
    const batchDistrict = meta.files.find((file) => file.id === batch)?.district;
    districts = batchDistrict && isSeoulDistrict(batchDistrict) ? [batchDistrict] : [];
  }
  for (const currentDistrict of districts) {
    const index = await loadDistrictResearchIndex<PhotoResearchItem>(request.url, 'photos', currentDistrict);
    const rows = filterPhotoResearch({meta, items: index.rows}, filters);
    total += rows.length;
    candidateCount += rows.filter((item) => item.candidate).length;
    for (const item of rows) if (item.sourceUrl) sourceUrls.add(item.sourceUrl);
    if (download) selected.push(...rows);
    else selectPage(rows, lower - start, upper - start, selected, tail);
    start += rows.length;
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, pages);
  const rows = !download && page !== requestedPage ? tail : selected;
  return Response.json({total, page, pageSize: PAGE_SIZE, rows:download?rows:rows.map(item=>publicPhotoItem(item)), sourceUrlCount: sourceUrls.size, candidateCount,
    ...(download ? {provenance: meta, filters} : {})}, {headers: {...headers,
    ...(download ? {'Content-Disposition': 'attachment; filename="seoul-neighborhood-photo-research.json"'} : {})}});
}
