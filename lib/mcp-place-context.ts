import {buildings, coordinates, parcelParams, roadAddressKey, type Address, type Building, type Secrets} from './providers';
import type {DocentStory, StoryScene} from './docent-story';

type Point = {latitude: number; longitude: number};
type Landmark = {
  scene: StoryScene;
  point: Point;
  district: string;
  dong: string;
  roadAddress: string;
  locationSource: string;
  // Only enter a lot here when the historical source describes this facility
  // and a separate address source confirms the matching road and lot.
  reviewedLot?: {main: number; sub: number};
};
const landmarks: Landmark[] = [{
  scene: {
    id: 'landmark:cheonggyecheon-museum-opening', kind: 'document',
    date: '2005년 9월 26일', year: 2005, order: 20050926,
    title: '청계천박물관 개관',
    text: '청계천박물관은 청계천 복원공사 준공에 맞춰 2005년 9월 26일 개관했어요.',
    scope: 'dong', photos: [], cutCount: 0,
    evidence: [{
      title: '청계천박물관 FAQ', institution: '서울역사박물관 청계천박물관',
      url: 'https://museum.seoul.go.kr/cgcm/community/faq.jsp',
      note: '박물관의 개관일입니다. 다른 건물의 사용승인일이나 건립일이 아닙니다.',
    }],
  },
  point: {latitude: 37.5712861, longitude: 127.0350222},
  district: '성동구', dong: '마장동', roadAddress: '서울특별시 성동구 청계천로 530',
  locationSource: 'https://museum.seoul.go.kr/cgcm/information/guideMap.jsp',
  reviewedLot: {main: 527, sub: 4},
}];

export type SpatialRelation = {
  category: 'direct' | 'nearby' | 'regional_background' | 'location_unconfirmed';
  accuracy: 'source_map_point' | 'legal_dong' | 'district' | 'unknown';
  distanceMeters: number | null;
  point: Point | null;
  locationSource: string | null;
  identity: 'reviewed_parcel' | 'unconfirmed';
};

export function distanceMeters(a: Point, b: Point) {
  const valid = ({latitude, longitude}: Point) => Number.isFinite(latitude) && Number.isFinite(longitude)
    && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
  if (!valid(a) || !valid(b)) return null;
  const radians = Math.PI / 180;
  const deltaLat = (b.latitude - a.latitude) * radians;
  const deltaLon = (b.longitude - a.longitude) * radians;
  const h = Math.sin(deltaLat / 2) ** 2
    + Math.cos(a.latitude * radians) * Math.cos(b.latitude * radians) * Math.sin(deltaLon / 2) ** 2;
  return 6371008.8 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}

export function classifyLandmark(address: Address, origin: Point | null, landmark: Landmark, radius: number): SpatialRelation {
  const sameDong = address.sggNm === landmark.district && address.emdNm === landmark.dong;
  const lot = landmark.reviewedLot;
  const direct = !!lot && sameDong && roadAddressKey(address.roadAddr) === roadAddressKey(landmark.roadAddress)
    && address.mtYn === '0' && Number(address.lnbrMnnm) === lot.main && Number(address.lnbrSlno || '0') === lot.sub;
  const distance = origin ? distanceMeters(origin, landmark.point) : null;
  const category = direct ? 'direct' : distance !== null && distance <= radius ? 'nearby'
    : sameDong ? 'regional_background' : 'location_unconfirmed';
  return {
    category, accuracy: 'source_map_point', distanceMeters: distance === null ? null : Math.round(distance),
    point: landmark.point, locationSource: landmark.locationSource,
    identity: direct ? 'reviewed_parcel' : 'unconfirmed',
  };
}

function regionalRelation(scene: StoryScene): SpatialRelation {
  // A photo catalog location does not specify the depicted subject or shooting point.
  const hasAreaEvidence = scene.kind === 'document' && scene.evidence.some(source => !!source.url
    && !/(?:촬영|정확한|구체적)\s*(?:장소|위치).{0,10}(?:미확인|미상|불명)/.test(source.note || ''));
  return {
    category: hasAreaEvidence ? 'regional_background' : 'location_unconfirmed',
    accuracy: hasAreaEvidence ? scene.scope === 'dong' ? 'legal_dong' : 'district' : 'unknown',
    distanceMeters: null, point: null, locationSource: null, identity: 'unconfirmed',
  };
}

const buildingSource = {institution: '국토교통부 건축물대장 표제부', url: 'https://www.data.go.kr/data/15134735/openapi.do'};

function approvedDate(value: string) {
  const match = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
  if (!match || Number(match[1]) < 1) return null;
  const iso = match.slice(1).join('-');
  const date = new Date(iso + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : null;
}

function nonnegative(value: string | undefined, integer = false) {
  if (!value || !/^\d+(?:\.\d+)?$/.test(value)) return null;
  const number = Number(value);
  return Number.isFinite(number) && (!integer || Number.isSafeInteger(number)) ? number : null;
}

function registerRecord(building: Building) {
  const facts = {
    name: building.name || null, buildingDong: building.dong || null,
    roadAddress: building.roadAddr, lotAddress: building.lotAddr || null,
    useApprovalDate: approvedDate(building.approved), mainUse: building.use || null,
    floorsAboveGround: nonnegative(building.above, true), floorsBelowGround: nonnegative(building.below, true),
    landAreaM2: nonnegative(building.landArea), buildingAreaM2: nonnegative(building.buildingArea),
    grossFloorAreaM2: nonnegative(building.area),
  };
  const name = [facts.name, facts.buildingDong].filter(Boolean).join(' ') || '대장에 등록된 건물';
  const approval = facts.useApprovalDate?.split('-').map(Number);
  const statements = [
    `건축물대장에 ${name}의 도로명주소는 ${facts.roadAddress}로 기록되어 있어요.`,
    facts.lotAddress && `건축물대장에 ${name}의 지번주소는 ${facts.lotAddress}로 기록되어 있어요.`,
    approval && `건축물대장에 ${name}의 사용승인일은 ${approval[0]}년 ${approval[1]}월 ${approval[2]}일로 기록되어 있어요.`,
    facts.mainUse && `건축물대장에 ${name}의 주용도는 ${facts.mainUse}로 기록되어 있어요.`,
    facts.floorsAboveGround !== null && `건축물대장에 ${name}의 지상 층수는 ${facts.floorsAboveGround}층으로 기록되어 있어요.`,
    facts.floorsBelowGround !== null && `건축물대장에 ${name}의 지하 층수는 ${facts.floorsBelowGround}층으로 기록되어 있어요.`,
    ...([['대지면적', facts.landAreaM2], ['건축면적', facts.buildingAreaM2], ['연면적', facts.grossFloorAreaM2]] as const)
      .map(([label, value]) => value !== null && `건축물대장에 ${name}의 ${label}은 ${value}㎡로 기록되어 있어요.`),
  ].filter((value): value is string => typeof value === 'string');
  return {id: 'building-register:' + building.id, title: name, facts, source: buildingSource, statements};
}

async function buildingRegister(address: Address, env: Secrets) {
  const empty = {records: [] as ReturnType<typeof registerRecord>[], parcelCandidates: [] as {name: string; buildingDong: string; roadAddress: string}[]};
  if (!env.BUILDING_API_KEY) return {...empty, status: 'not_configured' as const, note: '건축물대장 조회가 설정되지 않았습니다.'};
  try {
    const result = await buildings(address, env, AbortSignal.timeout(3500));
    const keyCounts = new Map<string, number>();
    for (const row of [...result.items, ...result.parcelCandidates]) {
      keyCounts.set(row.id, (keyCounts.get(row.id) ?? 0) + 1);
    }
    const verified = result.items.filter(row => /^[\w-]{1,140}$/.test(row.id) && keyCounts.get(row.id) === 1);
    const records = verified.slice(0, 30).map(registerRecord);
    const status = !records.length ? 'unconfirmed' : verified.length === 1 && result.items.length === 1
      && !result.parcelCandidates.length && !result.truncated ? 'matched' : 'multiple_or_partial';
    const parcelCandidates = [...result.parcelCandidates, ...result.items.filter(row => !verified.includes(row))]
      .slice(0, 30).map(row => ({name: row.name, buildingDong: row.dong, roadAddress: row.roadAddr}));
    return {...empty, status, records, parcelCandidates,
      match: 'parcel_codes_and_road_address', parcel: parcelParams(address),
      truncated: result.truncated || verified.length > 30, queriedAt: result.queriedAt, source: buildingSource,
      note: '대장 표제부의 건물별 기록입니다. 사용승인일을 최초 건립일이나 역사적 준공일로 해석할 수 없습니다.',
    };
  } catch {
    return {...empty, status: 'unavailable' as const, note: '이번 요청에서 건축물대장을 확인하지 못했습니다.'};
  }
}

export async function enrichMcpPlace(address: Address, story: DocentStory, env: Secrets & {MCP_HISTORY_RADIUS_METERS?: string}, includeRegister = true) {
  const configured = Number(env.MCP_HISTORY_RADIUS_METERS);
  const radiusMeters = Number.isInteger(configured) && configured >= 50 && configured <= 3000 ? configured : 1500;
  const pointLookup = coordinates(address, env, AbortSignal.timeout(3500)).catch(() => ({status: 'unavailable'} as const));
  const [register, coordinate] = await Promise.all([buildingRegister(address, includeRegister ? env : {}), pointLookup]);
  const origin = coordinate.status === 'verified' && 'x' in coordinate
    && coordinate.x !== undefined && coordinate.y !== undefined
    ? {latitude: coordinate.y, longitude: coordinate.x, source: coordinate.source, sourceUrl: coordinate.sourceUrl,
      accuracy: 'address_point' as const} : null;
  const sourced = story.scenes.filter(scene => scene.evidence.some(source => !!source.url) || scene.photos.some(photo => !!photo.sourceUrl));
  const relations = new Map(sourced.map(scene => [scene.id, regionalRelation(scene)]));
  const added: StoryScene[] = [];
  for (const landmark of landmarks) {
    const relation = classifyLandmark(address, origin, landmark, radiusMeters);
    if (relation.category === 'location_unconfirmed') continue;
    if (relation.category === 'regional_background') relation.distanceMeters = null;
    added.push(landmark.scene);
    relations.set(landmark.scene.id, relation);
  }
  const combined = [...sourced, ...added].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  return {
    story: {...story, scenes: combined, total: story.total - (story.scenes.length - sourced.length) + added.length},
    context: {register, origin, coordinateStatus: coordinate.status, relations, radiusMeters,
      targetName: address.bdNm,
      transition: `여기에서 시선을 조금 넓혀 ${story.dong} 일대를 살펴볼게요.`,
    },
  };
}

export type McpPlaceContext = Awaited<ReturnType<typeof enrichMcpPlace>>['context'];

export function distanceStatement(scene: StoryScene, relation: SpatialRelation | undefined) {
  return relation?.category === 'nearby' && relation.distanceMeters !== null
    ? `${scene.title} 자료의 위치 기준점은 선택한 주소 기준점에서 직선으로 약 ${relation.distanceMeters}m 떨어져 있어요.`
    : null;
}
