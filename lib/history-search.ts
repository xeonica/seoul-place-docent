import type {DocumentRow} from './document-research';
import type {PhotoResearchItem} from './photo-research';
import {loadDistrictResearchIndex} from './district-history-index';
import type {Address} from './providers';
import type {VideoRelation} from './video-catalog-types';

export type HistoryRelationCode = 'A' | 'B' | 'C' | 'D' | 'U';
export type HistoryCandidate = {
  id: string;
  originalRecordId: string;
  mediaType: 'article' | 'photo' | 'map';
  title: string;
  description: string | null;
  sourceInstitution: string | null;
  sourceUrl: string | null;
  originalDate: string | null;
  eventDate: string | null;
  historicalPeriod: string | null;
  district: string | null;
  legalDong: string | null;
  administrativeDong: string | null;
  address: string | null;
  buildingName: string | null;
  latitude: number | null;
  longitude: number | null;
  verificationStatus: string;
  locationRelation: {code: HistoryRelationCode; label: string; basis: string};
  rightsStatus: string | null;
  previewUrl: string | null;
  citationEligible: boolean;
  originalRecordUrl: string | null;
  sourceRow: string | null;
};

export type HistorySearchResult = {
  placeId: string;
  articles: HistoryCandidate[];
  photos: HistoryCandidate[];
  counts: {
    articleCandidates: number;
    articleMatchedCandidates: number;
    articleReturned: number;
    photoCandidates: number;
    photoMatchedCandidates: number;
    photoReturned: number;
    articleRegisteredInDistrict: number;
    photoRegisteredInDistrict: number;
    hasMore: boolean;
    page: number;
    pageSize: number;
    indexes: string[];
    elapsedMs: number;
  };
  note: string;
};

export type DocentVideoCandidate = {
  id: string; title: string; url: string | null; provider: string; historicalPeriods: string[];
  relation: VideoRelation; independentlyVerified: boolean; date: string; dateType: string;
  sources: {id: string; url: string | null; rights: string}[];
};

type ScoredCandidate = {record: HistoryCandidate; score: number; localMatch: boolean};
const MAX_PAGE = 50;
const PAGE_SIZE = 5;
const STOP_WORDS = new Set(['역사', '자료', '사진', '기사', '안내', '알려줘', '알려주세요', '해설', '설명', '무엇', '어떤', '관련', '주변', '서울', '특별시', '오늘', '현재', '과거', '모습', '동네']);

function normalized(value: string) {
  return value.normalize('NFKC').toLocaleLowerCase().replace(/[\s_·ㆍ()[\]{}.,:;!?/\\-]/g, '');
}

function value(values: Record<string, string>, names: string[]): string | null {
  const entries = Object.entries(values);
  for (const name of names) {
    const needle = normalized(name);
    const found = entries.find(([key, item]) => normalized(key) === needle && item.trim());
    if (found) return found[1].trim();
  }
  for (const name of names) {
    const needle = normalized(name);
    const found = entries.find(([key, item]) => normalized(key).includes(needle) && item.trim());
    if (found) return found[1].trim();
  }
  return null;
}

function safeUrl(input: string | null) {
  if (!input) return null;
  try {
    const url = new URL(input);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

function coordinate(values: Record<string, string>, key: 'latitude' | 'longitude'): number | null {
  const raw = value(values, key === 'latitude' ? ['위도', 'latitude', 'lat'] : ['경도', 'longitude', 'lng', 'lon']);
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || (key === 'latitude' ? Math.abs(parsed) > 90 : Math.abs(parsed) > 180)) return null;
  return parsed;
}

function relationFor(district: string | null, targetDistrict: string, dong: string, legalDong: string | null) {
  // Only an explicit structured legal-dong field can receive C. Free-form
  // place notes can mention a neighboring dong and are not code-reconciled.
  if (legalDong && dong && normalized(legalDong) === normalized(dong)) {
    return {code: 'C' as const, label: '법정동 표기 일치 후보', basis: '조사자료의 구조화된 법정동 표기와 주소 응답이 일치함; 법정동 코드 및 원문 독립 검증은 미완료'};
  }
  if (district && district === targetDistrict) {
    return {code: 'D' as const, label: '자치구 배경 후보', basis: '같은 자치구의 조사자료이며 건물·필지·동네 관계는 확인되지 않음'};
  }
  return {code: 'U' as const, label: '위치 미확정', basis: '검색 주소와의 공간 관계를 확인할 정보가 없음'};
}

function termsFor(question?: string) {
  return [...new Set((question || '').normalize('NFKC').match(/[\p{L}\p{N}]{2,}/gu) || [])]
    .map((term) => term.toLocaleLowerCase())
    .filter((term) => !STOP_WORDS.has(term));
}

function matchScore(record: HistoryCandidate, questionTerms: string[], dong: string, buildingName: string): ScoredCandidate {
  const locationText = normalized([record.address, record.legalDong, record.administrativeDong, record.title].filter(Boolean).join(' '));
  const sameDong = Boolean(dong) && locationText.includes(normalized(dong));
  const buildingMatch = Boolean(buildingName) && normalized([record.title, record.description, record.address].filter(Boolean).join(' ')).includes(normalized(buildingName));
  const searchText = normalized([record.title, record.description, record.address, record.legalDong, record.administrativeDong].filter(Boolean).join(' '));
  const topicMatches = questionTerms.filter((term) => searchText.includes(normalized(term))).length;
  return {record, localMatch: sameDong || topicMatches > 0 || buildingMatch, score: (sameDong ? 100 : 0) + (buildingMatch ? 35 : 0) + topicMatches * 5 + (record.sourceUrl ? 1 : 0)};
}

function articleCandidate(row: DocumentRow, address: Address): HistoryCandidate {
  const values = row.values;
  const sourceStatus = value(values, ['검토상태', 'verification_status', 'verification grade']) || row.status;
  const legalDong = value(values, ['현재 법정동', 'legal_dong', '법정동']);
  const relation = relationFor(row.district, address.sggNm, address.emdNm, legalDong);
  return {
    id: row.id,
    originalRecordId: value(values, ['기사 ID', 'article_id', 'article id', '자료ID']) || row.id,
    mediaType: 'article',
    title: value(values, ['기사 원제목', 'original_title', '기사제목', '자료명', 'title']) || row.label,
    description: value(values, ['독립 핵심요약', '기사요약', 'article_summary', 'summary', '내용설명']),
    sourceInstitution: value(values, ['신문사', 'publisher', '언론사', '발행처']),
    sourceUrl: safeUrl(value(values, ['원문URL', 'original_url', '기사URL'])),
    originalDate: value(values, ['신문 발행일', 'published_date', 'publication_date', '발행일']),
    eventDate: value(values, ['사건 발생일', 'event_date', '사건일자', '사건발생일']),
    historicalPeriod: value(values, ['사건 시기 원문표현', 'historical_period', '시대', '사건시기']),
    district: address.sggNm || null,
    legalDong,
    administrativeDong: value(values, ['현재 행정동', 'administrative_dong', '행정동']),
    address: value(values, ['도로명주소', '관련주소', 'address', '현재주소']),
    buildingName: value(values, ['건물명', 'building_name']),
    latitude: coordinate(values, 'latitude'),
    longitude: coordinate(values, 'longitude'),
    verificationStatus: `후보 · ${sourceStatus || '독립 원문 검증 상태 미확인'}`,
    locationRelation: relation,
    rightsStatus: value(values, ['저작권 이용조건', '이용조건', 'rights_status']),
    previewUrl: null,
    citationEligible: false,
    originalRecordUrl: safeUrl(value(values, ['원문URL', 'original_url', '기사URL'])),
    sourceRow: value(values, ['조사 CSV']) && value(values, ['CSV 행']) ? `${value(values, ['조사 CSV'])} 행 ${value(values, ['CSV 행'])}` : null,
  };
}

function photoCandidate(item: PhotoResearchItem, address: Address): HistoryCandidate {
  const values = item.values;
  const sourceStatus = item.reviewStatus || value(values, ['검토상태']) || '원문 독립 검증 상태 미확인';
  const legalDong = value(values, ['현재 법정동', 'legal_dong', '법정동']);
  const relation = relationFor(item.district, address.sggNm, address.emdNm, legalDong);
  const mediaText = `${item.mediaType} ${value(values, ['자료 분류', '자료유형']) || ''}`;
  const mediaType = /지도/.test(mediaText) ? 'map' as const : 'photo' as const;
  return {
    id: item.id,
    originalRecordId: value(values, ['기관자료ID', '자료ID', 'photo_id']) || item.id,
    mediaType,
    title: value(values, ['자료명', 'photo_title', 'title']) || '제목 미확인',
    description: value(values, ['원문 설명', 'description', 'caption', '자료설명']),
    sourceInstitution: value(values, ['제공기관·채널', 'provider', '제공기관', '기관']) || item.provider || null,
    sourceUrl: safeUrl(item.sourceUrl || value(values, ['원문URL', 'original_url'])),
    originalDate: value(values, ['촬영시기', 'photo_date', '촬영일', '촬영연도']),
    eventDate: null,
    historicalPeriod: value(values, ['역사적 대상 시기', 'historical_period']),
    district: item.district || address.sggNm || null,
    legalDong,
    administrativeDong: value(values, ['현재 행정동', 'administrative_dong', '행정동']),
    address: value(values, ['도로명주소', '현재주소', 'address']),
    buildingName: value(values, ['건물명', 'building_name']),
    latitude: coordinate(values, 'latitude'),
    longitude: coordinate(values, 'longitude'),
    verificationStatus: `후보 · ${sourceStatus}`,
    locationRelation: relation,
    rightsStatus: value(values, ['이용조건', 'rights_status', '저작권 이용조건']),
    previewUrl: safeUrl(item.previewUrl || value(values, ['미리보기URL', 'preview_url'])),
    citationEligible: false,
    originalRecordUrl: safeUrl(item.sourceUrl || value(values, ['원문URL', 'original_url'])),
    sourceRow: value(values, ['조사 CSV']) && value(values, ['CSV 행']) ? `${value(values, ['조사 CSV'])} 행 ${value(values, ['CSV 행'])}` : null,
  };
}

function rankCandidates<T extends ScoredCandidate>(items: T[], page: number) {
  const local = items.filter((item) => item.localMatch);
  const selected = (local.length ? local : items).sort((a, b) => b.score - a.score || a.record.id.localeCompare(b.record.id));
  const offset = (page - 1) * PAGE_SIZE;
  return {candidateCount: items.length, matchedCandidateCount: local.length, records: selected.slice(offset, offset + PAGE_SIZE).map((item) => item.record), hasMore: offset + PAGE_SIZE < (local.length || items.length)};
}

export function stablePlaceId(address: Address): string {
  if (address.bdMgtSn) return `juso-building-${address.bdMgtSn}`;
  const parcel = [address.admCd, address.mtYn, address.lnbrMnnm.padStart(4, '0'), (address.lnbrSlno || '0').padStart(4, '0')].join('-');
  return `juso-parcel-${parcel}`;
}

export function normalizeVideoCandidate(video: DocentVideoCandidate, address: Address): HistoryCandidate {
  const relation = video.relation === 'legal_dong_candidate'
    ? {code: 'C' as const, label: '법정동 관련 영상 후보', basis: '기존 영상 카탈로그의 법정동 연결이며 건물·필지 관계와 영상 내용은 별도 확인 필요'}
    : video.relation === 'district_background'
      ? {code: 'D' as const, label: '자치구 배경 영상 후보', basis: '기존 영상 카탈로그의 자치구 연결이며 특정 동네·건물의 직접 자료가 아님'}
      : {code: 'U' as const, label: '지명·범위 미확정 영상 후보', basis: '기존 영상 카탈로그의 지명 후보이며 현재 행정구역·장소 일치는 미확정'};
  return {
    id: `VIDEO-${video.id}`,
    originalRecordId: video.id,
    mediaType: 'video',
    title: video.title,
    description: video.historicalPeriods.join(' · ') || null,
    sourceInstitution: video.provider || null,
    sourceUrl: safeUrl(video.url),
    originalDate: video.date || null,
    eventDate: null,
    historicalPeriod: video.historicalPeriods.join(' · ') || null,
    district: address.sggNm || null,
    legalDong: null,
    administrativeDong: null,
    address: null,
    buildingName: null,
    latitude: null,
    longitude: null,
    verificationStatus: video.independentlyVerified ? '영상 메타데이터 일부 독립 확인 · 내용 및 장소관계 별도 확인 필요' : '후보 · 영상 원문 및 사실관계 독립 검증 안 됨',
    locationRelation: relation,
    rightsStatus: video.sources.map((source) => source.rights).filter(Boolean).join(' · ') || '이용조건 원문 확인 필요',
    previewUrl: null,
    citationEligible: false,
    originalRecordUrl: safeUrl(video.url),
    sourceRow: video.sources.map((source) => source.id).filter(Boolean).join(', ') || null,
  };
}

export async function searchAddressHistory(input: {baseUrl: string; address: Address; question?: string; page?: number}): Promise<HistorySearchResult> {
  const startedAt = Date.now();
  const page = Math.min(MAX_PAGE, Math.max(1, Math.floor(input.page || 1)));
  const [articleIndex, photoIndex] = await Promise.all([
    loadDistrictResearchIndex<DocumentRow>(input.baseUrl, 'articles', input.address.sggNm),
    loadDistrictResearchIndex<PhotoResearchItem>(input.baseUrl, 'photos', input.address.sggNm),
  ]);
  const terms = termsFor(input.question);
  const articles = articleIndex.rows.map((row) => articleCandidate(row, input.address)).map((record) => matchScore(record, terms, input.address.emdNm, input.address.bdNm));
  const photos = photoIndex.rows.map((row) => photoCandidate(row, input.address)).map((record) => matchScore(record, terms, input.address.emdNm, input.address.bdNm));
  const articlePage = rankCandidates(articles, page);
  const photoPage = rankCandidates(photos, page);
  return {
    placeId: stablePlaceId(input.address),
    articles: articlePage.records,
    photos: photoPage.records,
    counts: {
      articleCandidates: articlePage.candidateCount,
      articleMatchedCandidates: articlePage.matchedCandidateCount,
      articleReturned: articlePage.records.length,
      photoCandidates: photoPage.candidateCount,
      photoMatchedCandidates: photoPage.matchedCandidateCount,
      photoReturned: photoPage.records.length,
      articleRegisteredInDistrict: articleIndex.registered,
      photoRegisteredInDistrict: photoIndex.registered,
      hasMore: articlePage.hasMore || photoPage.hasMore,
      page,
      pageSize: PAGE_SIZE,
      indexes: ['district-articles', 'district-photos'],
      elapsedMs: Math.max(0, Date.now() - startedAt),
    },
    note: '자치구 조사 인덱스의 기사·사진 후보입니다. 원문 독립 검증이 완료되지 않았으므로 역사적 사실의 인용 근거로 사용할 수 없습니다. 기사 발행일과 사건 발생일, 원문 촬영 시기와 자료 게시일을 구분하세요.',
  };
}

export function historyCandidateFromArticle(row: DocumentRow, address: Address) {
  return articleCandidate(row, address);
}

export function rankArticleCandidates(rows: DocumentRow[], address: Address, question: string | undefined, page = 1) {
  const terms = termsFor(question);
  return rankCandidates(rows.map((row) => matchScore(articleCandidate(row, address), terms, address.emdNm, address.bdNm)), page);
}
