import legacy from '../data/consolidated-video-research.json';
import imported from '../data/district-video-research.json';
import type {ResearchVideo} from './video-research';

type Segment = {
  sheet: string; row: number; startRaw: string; endRaw: string;
  startSeconds: number | null; endSeconds: number | null; evidence: string;
};
export type DistrictRecord = {
  id: string; sourceId: string; title: string; district: string; identity?: string;
  places?: string; address?: string; legalDong?: string; administrativeDong?: string;
  dongCandidates?: string[]; broadCandidates?: string[]; locationBlocked?: boolean; url?: string; sourceUrl?: string; urlStatus: string;
  channel?: string; period?: string; description?: string; review?: string;
  playback?: string; rights?: string; notes?: string; segments?: Segment[];
  file: string; sheet: string; row: number; independentlyVerified: false;
};

export type CatalogueVideo = {
  id: string;
  report?: ResearchVideo;
  research: DistrictRecord[];
  title: string;
  identity?: string;
  scope?: string;
};

type Filters = {
  q: string; district: string; dong: string; administrativeDong: string;
  period: string; channel: string; status: string; group: string; address: string;
  building: string; parcel: string;
};

const records = imported.records as DistrictRecord[];
const byIdentity = new Map<string, CatalogueVideo>();
for (const report of legacy.items) {
  const identity = 'youtube:' + report.videoId;
  byIdentity.set(identity, {id: report.id, report, title: report.title, identity, research: []});
}
for (const record of records) {
  const key = record.identity || record.id;
  const previous = byIdentity.get(key);
  if (previous) {
    previous.research.push(record);
  } else {
    byIdentity.set(key, {id: key, title: record.title, identity: record.identity, research: [record]});
  }
}
const catalogue = [...byIdentity.values()];
const normalize = (s?: string) => (s || '').normalize('NFKC').trim().toLowerCase();
const normalizeAddress = (s?: string) => normalize(s).replace(/^서울(?:특별시)?\s+/, '').replace(/\s+/g, ' ');
const searchText = new Map(catalogue.map(video => [
  video.id,
  normalize([
    video.id, video.title, video.report?.place, video.report?.channel, video.report?.date,
    ...(video.report?.segments.map(s => s.description) || []),
    ...video.research.flatMap(r => [r.title, r.description, r.places, r.address, r.legalDong,
      r.administrativeDong, ...(r.broadCandidates || []), r.channel, r.period, r.sourceId, r.district]),
  ].join(' ')),
]));

function addressRank(video: CatalogueVideo, filters: Filters) {
  const local = video.research.filter(r => r.district === filters.district && !r.locationBlocked);
  const addresses = [filters.address, filters.parcel].map(normalizeAddress).filter(Boolean);
  if (local.some(r => addresses.includes(normalizeAddress(r.address)))) return 6;
  const building = normalize(filters.building);
  if (building && local.some(r => normalize(r.places) === building)) return 5;
  if (local.some(r => (filters.dong && (r.legalDong === filters.dong || r.dongCandidates?.includes(filters.dong))) ||
      (filters.administrativeDong && r.administrativeDong === filters.administrativeDong)) ||
      video.report?.regionLinks.some(r => r.district === filters.district && r.dong === filters.dong)) return 4;
  const broad = [filters.dong.replace(/\d+가$/, ''), filters.administrativeDong].filter(Boolean);
  if (local.some(r => broad.some(name => r.broadCandidates?.includes(name)))) return 3;
  if (local.length || video.report?.regionLinks.some(r => r.district === filters.district)) return 2;
  if (video.research.some(r => r.district === filters.district)) return 1;
  return 0;
}

const scopes = ['', '장소 관련성 검토 후보', '같은 자치구 배경 자료', '동네 지명 언급 후보',
  '같은 동네 관련 후보', '검색한 시설 이름 일치 후보', '해당 주소 표기 일치 후보'];

export function searchCatalogue(filters: Filters, place: boolean) {
  const terms = normalize(filters.q).split(/\s+/).filter(Boolean);
  const rows = [];
  for (const video of catalogue) {
    if (filters.group === 'excel' && !video.research.length) continue;
    if (['A', 'B'].includes(filters.group) && video.report?.group !== filters.group) continue;
    if (filters.status === 'candidate' && video.identity) continue;
    if (filters.status === 'identified' && !video.identity) continue;
    if (filters.status === 'report' && !video.report) continue;
    if (filters.status === 'pending' && !video.research.length) continue;
    if (!terms.every(term => searchText.get(video.id)?.includes(term))) continue;
    const rank = place ? addressRank(video, filters) : 0;
    if (place && !rank) continue;
    if (!place && (filters.district || filters.dong || filters.administrativeDong || filters.period || filters.channel)) {
      const report = video.report;
      const reportMatch = report && !filters.administrativeDong && !filters.period &&
        normalize(report.channel).includes(normalize(filters.channel)) &&
        ((!filters.district && !filters.dong) || report.regionLinks.some(r =>
          (!filters.district || r.district === filters.district) && (!filters.dong || r.dong === filters.dong)));
      const researchMatch = video.research.some(r =>
        (!filters.district || r.district === filters.district) &&
        (!filters.dong || r.legalDong === filters.dong || r.dongCandidates?.includes(filters.dong) || r.broadCandidates?.includes(filters.dong)) &&
        (!filters.administrativeDong || r.administrativeDong === filters.administrativeDong || r.broadCandidates?.includes(filters.administrativeDong)) &&
        normalize(r.period).includes(normalize(filters.period)) &&
        normalize(r.channel).includes(normalize(filters.channel)));
      if (!reportMatch && !researchMatch) continue;
    }
    rows.push({video, rank});
  }
  if (place) rows.sort((a, b) => b.rank - a.rank);
  return rows.map(({video, rank}) => ({...video, scope: scopes[rank] || undefined}));
}

const sceneCount = (video: CatalogueVideo) => {
  const keys = new Set<string>();
  let unparsed = 0;
  const add = (start: number | null, end: number | null) => {
    if (start === null) unparsed++;
    else keys.add(start + '/' + end);
  };
  for (const s of video.report?.segments || []) add(s.validTime ? s.start : null, s.end);
  for (const record of video.research) {
    for (const s of record.segments || []) add(s.startSeconds, s.endSeconds);
  }
  return keys.size + unparsed;
};

export const catalogueMeta = {
  identified: catalogue.filter(v => v.identity).length,
  candidates: catalogue.filter(v => !v.identity).length,
  segments: catalogue.reduce((count, video) => count + sceneCount(video), 0),
  records: records.length,
  references: imported.references,
};
