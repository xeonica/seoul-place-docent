import type {IntegratedResearchSummary} from './integrated-research';
export type PhotoResearchFile = {
  id: string; district: string; dong: string; filename: string; count: number; columns: string[];
  path: string; sha256: string; sizeBytes: number; sourceUrlCount: number; candidateCount: number; previewLinkCount: number;
  collectionScope: 'dong' | 'district' | 'city'; sourceNote: string; headerLine: number;
  visualRecordCount: number; buildingRecordCount: number; correctionCount: number;
  sourceFileRecordCount?: number;
};
export type PhotoResearchItem = {
  id: string; batchId: string; district: string; dong: string; dataRow: number;
  collectionScope: 'dong' | 'district' | 'city'; recordType: 'visual' | 'building'; mediaType: string;
  correctionOf: string | null; correctionIds: string[];
  sourceUrl: string | null; sourceKey: string; sourceLinkType: string; previewUrl: string | null; provider: string;
  reviewStatus: string; relation: string; scope: string; candidate: boolean; conflictMentioned: boolean;
  sameSourceCount: number; samePreviewCount: number; values: Record<string, string>;
  regionLinks?: Record<string, string>[]; previousIds?: string[];
  metadataWarnings?: string[];
  importWarnings?: string[];
};
export type PhotoResearchMeta = {
  id: string; title: string; importedOn: string; recordCount: number; batchCount: number; districtCount: number;
  dongCount: number; districtBatchCount: number; visualRecordCount: number; buildingRecordCount: number; correctionCount: number; mediaTypes: string[];
  sourceUrlCount: number; portalLinkCount: number; missingSourceUrlCount: number; repeatedSourceGroupCount: number;
  repeatedPreviewGroupCount: number; previewLinkCount: number; candidateCount: number; accessUnavailableCount: number;
  downloadedPhotoCount: number; dateRange: string[]; files: PhotoResearchFile[];
  relationCounts: Record<string, number>; scopeCounts: Record<string, number>; providers: string[]; scopeNote: string; rightsNote: string;
  districts?: string[]; places?: {district: string; dong: string}[]; integratedResearch?: IntegratedResearchSummary;
};
export type PhotoResearchBundle = {meta: PhotoResearchMeta; items: PhotoResearchItem[]};
export type PhotoResearchFilters = {
  query?: string; district?: string; batch?: string; provider?: string; scope?: string;
  source?: string; id?: string; review?: string; previewOnly?: boolean; repeatsOnly?: boolean; conflictsOnly?: boolean;
  recordType?: string; mediaType?: string;
  dong?: string; target?: string;
};
export function photoResearchUrl(value: string | undefined) {
  if (!value) return null;
  // Some cells append navigation instructions after the URL. Keep the original cell in values.
  const match = value.match(/^https?:\/\/[^\s<>]+/);
  if (!match) return null;
  try {const url = new URL(match[0]); return url.username || url.password ? null : url.href;}
  catch {return null;}
}
export function filterPhotoResearch(bundle: PhotoResearchBundle, filters: PhotoResearchFilters = {}) {
  const terms = (filters.query || '').normalize('NFKC').toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return bundle.items.filter(item => {
    if (filters.id && item.id !== filters.id) return false;
    if (filters.district && item.district !== filters.district && !item.regionLinks?.some(link => link['자치구'] === filters.district)) return false;
    if (filters.dong && !(item.dong === filters.dong && (!filters.district || item.district === filters.district)) && !item.regionLinks?.some(link => link['법정동'] === filters.dong && (!filters.district || link['자치구'] === filters.district))) return false;
    if (filters.target && !item.regionLinks?.some(link => link['대상ID'] === filters.target)) return false;
    if (filters.batch && item.batchId !== filters.batch) return false;
    if (filters.recordType && item.recordType !== filters.recordType) return false;
    if (filters.mediaType && item.mediaType !== filters.mediaType) return false;
    if (filters.provider && item.provider !== filters.provider) return false;
    if (filters.scope && item.scope !== filters.scope) return false;
    if (filters.source && item.sourceKey !== filters.source) return false;
    if (filters.review === 'candidate' && !item.candidate || filters.review === 'textChecked' && item.candidate) return false;
    if (filters.previewOnly && !item.previewUrl) return false;
    if (filters.repeatsOnly && item.sameSourceCount < 2) return false;
    if (filters.conflictsOnly && !item.conflictMentioned) return false;
    const text = [item.dong, item.id, ...Object.values(item.values), ...(item.regionLinks || []).flatMap(link => [link['자치구'], link['법정동'], link['연결근거']])].join(' ').normalize('NFKC').toLocaleLowerCase();
    return terms.every(term => text.includes(term));
  });
}
/** Provider endpoints were checked against the image links in their public source pages. */
/** Image servers that serve photos without a file extension (성북마을아카이브 files). */
export function trustedImageHost(url: string) {
  try { const u = new URL(url); return u.protocol === 'https:' && u.hostname === 'archive-file.sb.go.kr' && /^\/files\/(?:service|upload)File\/archive\/item\//.test(u.pathname); } catch { return false; }
}
export function photoResearchImageCandidates(item: PhotoResearchItem) {
  if (['사이트표시가능여부', '썸네일표시가능여부'].some(key => /^불가(?:$|[\s(（·:])/.test(item.values[key] || ''))) return [];
  const images: string[] = [];
  const supplied = photoResearchUrl(item.previewUrl || undefined);
  if (supplied?.startsWith('https://') && (/\.(?:avif|gif|jpe?g|png|webp|tmb)$/i.test(new URL(supplied).pathname) || trustedImageHost(supplied))) images.push(supplied);
  const source = photoResearchUrl(item.sourceUrl || undefined);
  if (source) {
    const url = new URL(source);
    const id = (item.values['기관자료ID'] || '').trim();
    if (url.hostname === 'archive.much.go.kr' && /^\d{8,15}$/.test(id)) {
      images.push('https://archive.much.go.kr/archiveImage/thumb.do?idnbr=' + id);
    }
    if (url.hostname === 'museum.seoul.go.kr') {
      const fileId = url.searchParams.get('fileId') || '';
      const fileSn = url.searchParams.get('fileSn') || '';
      if (/^[A-Za-z0-9_-]{1,120}$/.test(fileId) && /^\d{1,12}$/.test(fileSn)) {
        const params = new URLSearchParams({fileSn, fileId, w: '800', h: '800'});
        images.push('https://museum.seoul.go.kr:8088/component/archv/data/ND_thumbnail.tmb?' + params);
      }
    }
  }
  return [...new Set(images)];
}
export function photoResearchThumbnail(item: PhotoResearchItem) {
  return photoResearchImageCandidates(item)[0] || null;
}
/** Accept the owner's review decision in presentation while retaining imported source data. */
export function photoResearchText(value: string) {
  return value.replace(/\s*[·ㆍ|]\s*검토\s*대기/g, '').replace(/검토\s*대기/g, '').trim();
}
export function photoResearchCredit(item: PhotoResearchItem) {
  const creator = item.values['촬영자·제작자'];
  return photoResearchText(item.values['필수출처표시문구'] || [item.values['제공기관·채널'] || item.provider,
    creator && !/^(?:미상|미확인|불명|작자\s*미상)/.test(creator.trim()) ? creator : ''].filter(Boolean).join(' · '));
}
export function placePhotoResearch(bundle: PhotoResearchBundle, district: string, dongs: string[], visualPage = 1) {
  const batches = bundle.meta.files.filter(f => f.collectionScope === 'dong' && f.district === district && dongs.includes(f.dong));
  const districtBatches = bundle.meta.files.filter(f => f.collectionScope === 'district' && f.district === district);
  const batchIds = new Set(batches.map(f => f.id));
  const rows = bundle.items.filter(item => batchIds.has(item.batchId));
  // Address panels show documented neighborhood candidates, without upgrading building/parcel relations.
  const visible = rows.filter(item => !item.candidate && item.relation !== '미확인');
  const integrated = bundle.items.filter(item => item.regionLinks?.some(link => link['조사단계'] === '법정동' && link['자치구'] === district && dongs.includes(link['법정동'])));
  const localVisuals = [...new Map([...visible, ...integrated]
    .filter(item => item.recordType === 'visual' && !item.candidate)
    .map(item => [item.id, item])).values()];
  const districtIds = new Set(districtBatches.map(file => file.id));
  const districtVisuals = bundle.items.filter(item => districtIds.has(item.batchId) && item.recordType === 'visual' && !item.candidate);
  // A district fallback stays explicitly district-wide; it never becomes an address match.
  const visualScope = localVisuals.length ? 'dong' : districtVisuals.length ? 'district' : 'none';
  const relatedVisuals = localVisuals.length ? localVisuals : districtVisuals;
  const visuals = relatedVisuals.filter(item => photoResearchThumbnail(item));
  const sourceOnly = relatedVisuals.filter(item => !photoResearchThumbnail(item));
  const pageSize = 6;
  const page = Math.min(Math.max(1, Number.isFinite(visualPage) ? Math.floor(visualPage) : 1), Math.max(1, Math.ceil(visuals.length / pageSize)));
  return {
    datasetId: bundle.meta.id, batches, districtBatches, districtTotal: districtBatches.reduce((sum, file) => sum + file.count, 0), total: rows.length, eligible: visible.length,
    candidateCount: rows.filter(item => item.candidate).length + (batches.length ? 0 : bundle.items.filter(item => districtIds.has(item.batchId) && item.candidate).length), rows: visible.slice(0, 4),
    integratedTotal: integrated.length, integratedRows: integrated.slice(0, 4),
    visuals: {scope: visualScope, total: visuals.length, page, pageSize, recordTotal: relatedVisuals.length,
      sourceOnlyTotal: sourceOnly.length, sourceOnlyRows: sourceOnly.slice(0, 6),
      thumbnailCount: visuals.filter(item => photoResearchThumbnail(item)).length,
      rows: visuals.slice((page - 1) * pageSize, page * pageSize)},
    relationNote: '선택한 자치구·법정동의 조사묶음입니다. 조사 범위와 촬영 장소는 다를 수 있으며 건물·부지 일치는 미검증입니다.',
  };
}
export type PlacePhotoResearch = ReturnType<typeof placePhotoResearch>;
export const photoProviderLabels: Record<string, string> = {
  'archives.seoul.go.kr': '서울기록원', 'museum.seoul.go.kr': '서울역사박물관',
  'www.archives.go.kr': '국가기록원', 'theme.archives.go.kr': '국가기록원 테마',
  'map.ngii.go.kr': '국토정보플랫폼', 'www.ep.go.kr': '은평구',
  'history.seoul.go.kr': '서울역사편찬원', 'data.si.re.kr': '서울연구데이터서비스',
  'kabc.dongguk.edu': '불교기록문화유산 아카이브',
  'archive.much.go.kr': '대한민국역사박물관', 'www.ydp.go.kr': '영등포구',
  'mediahub.seoul.go.kr': '내 손안에 서울', 'www.heritage.go.kr': '국가유산청',
};
