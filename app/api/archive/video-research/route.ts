import raw from '../../../../data/consolidated-video-research.json';
import {filterResearchVideos, type ResearchVideo} from '../../../../lib/video-research';
import {catalogueMeta, searchCatalogue} from '../../../../lib/district-video-research';
const items = raw.items as ResearchVideo[];
export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  if (params.get('catalogue') === '1') {
    const get = (name: string) => (params.get(name) || '').slice(0, 200);
    const group = get('group') || 'all';
    const status = get('status');
    if (!['A', 'B', 'all', 'excel'].includes(group) || !['', 'identified', 'candidate', 'report', 'pending'].includes(status)) {
      return Response.json({error: '영상 분류나 검토 상태를 확인해 주세요.'}, {status: 400});
    }
    const district = get('district');
    const rows = searchCatalogue({
      q: get('q'), district, dong: get('dong'), administrativeDong: get('administrativeDong'),
      address: get('address'), building: get('building'), parcel: get('parcel'), channel: get('channel'),
      period: get('period'), group, status,
    }, params.get('place') === '1');
    const requested = Number(get('page'));
    const pageSize = 12;
    const page = Math.min(Math.max(1, Number.isFinite(requested) ? Math.floor(requested) : 1), Math.max(1, Math.ceil(rows.length / pageSize)));
    return Response.json({
      meta: raw.meta, catalogue: catalogueMeta, total: rows.length, page, pageSize,
      items: rows.slice((page - 1) * pageSize, page * pageSize),
    }, {headers: {'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff'}});
  }
  const filters = {query: (params.get('q') || '').slice(0, 150), district: params.get('district') || '', dong: params.get('dong') || '', group: params.get('group') || 'A'};
  if (!['A', 'B', 'all'].includes(filters.group)) return Response.json({error: '영상 분류를 확인해 주세요.'}, {status: 400});
  if (filters.group === 'all') filters.group = '';
  const rows = filterResearchVideos(items, filters);
  const pageNumber = Number(params.get('page') || 1);
  const page = Math.min(Math.max(1, Number.isFinite(pageNumber) ? Math.floor(pageNumber) : 1), Math.max(1, Math.ceil(rows.length / 12)));
  const download = params.get('download') === '1';
  return Response.json({meta: raw.meta, total: rows.length, page, pageSize: 12, items: download ? rows : rows.slice((page - 1) * 12, page * 12), ...(download ? {excluded: raw.excluded} : {})}, {headers: {'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', ...(download ? {'Content-Disposition': 'attachment; filename="seoul-video-research.json"'} : {})}});
}
