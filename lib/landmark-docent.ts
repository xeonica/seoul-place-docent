import {searchResearchRecords} from './research-catalog';
import {getFullDocentStory} from './docent-data';
import type {Address} from './providers';
import type {MapLocation} from './map-address';
import type {DocentStory, StoryScene} from './docent-story';

/**
 * Landmarks such as bridges, parks and plazas have no road address, so the address
 * pipeline cannot reach them. This builds the same story shape from the research
 * catalog so the seven-part tour can be produced from a place name alone.
 * Records are unreviewed research rows; they are used as narrative material with
 * source links, and their review state is kept in the source list.
 */
const MAX_RECORDS = 36;
const yearOf = (date: string) => {
  const match = date.match(/(1[5-9]\d\d|20\d\d)/);
  return match ? Number(match[1]) : null;
};

export function landmarkResearch(place: string, district?: string) {
  const records: ReturnType<typeof searchResearchRecords>['records'] = [];
  let total = 0;
  for (let offset = 0; offset < MAX_RECORDS; offset += 12) {
    const page = searchResearchRecords({query: place, district, offset, limit: 12});
    total = page.total;
    records.push(...page.records);
    if (page.nextOffset === null) break;
  }
  return {total, records};
}

function guessDistrict(records: ReturnType<typeof landmarkResearch>['records']) {
  const counts = new Map<string, number>();
  for (const record of records) for (const o of record.observations) {
    const names = [o.district, ...o.relations.map(r => r.place?.district)].filter((d): d is string => !!d && /^[가-힣]+구$/.test(d));
    for (const name of new Set(names)) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? '';
}

/**
 * location comes from Kakao keyword search plus reverse geocoding. When present, the legal dong's
 * story (with its archive photos) is merged after the landmark's own research records.
 */
export function landmarkStory(place: string, location?: MapLocation | null) {
  // Search the whole catalog: a bridge's records can sit under either bank's district.
  const research = landmarkResearch(place);
  const resolvedDistrict = location?.address.sggNm || guessDistrict(research.records);
  const dong = location?.address.emdNm || '';
  const scenes: StoryScene[] = research.records.flatMap(record => {
    const o = record.observations[0];
    if (!o) return [];
    const restricted = record.contentUse === 'prohibited';
    const year = yearOf(o.date || '');
    // Some catalog rows put a long survey note in the date column; keep only the year there.
    const date = !o.date ? '시기 미상' : o.date.length > 20 ? (year ? String(year) : '시기 미상') : o.date;
    return [{
      id: o.evidenceId || record.id,
      kind: 'document' as const,
      date,
      year,
      order: 0,
      title: o.title || place,
      // Rows whose rights forbid AI use keep only their title and link.
      text: restricted ? o.title : [o.description || o.title, o.location && `위치: ${o.location}`].filter(Boolean).join(' '),
      scope: 'district' as const,
      photos: [],
      cutCount: 0,
      evidence: [{title: o.title || place, url: record.sourceUrl || null, institution: o.institution || '', note: `조사자료 · 검토 상태: ${o.reviewStatus || '미검토'} · 권리: ${o.rights || '미확인'}`}],
    }];
  }).filter((scene, index, all) => all.findIndex(other => other.title === scene.title) === index)
    .sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999) || a.id.localeCompare(b.id))
    .map((scene, index) => ({...scene, order: index}));
  let neighborhood: DocentStory | null = null;
  if (resolvedDistrict && dong) {
    try { neighborhood = getFullDocentStory(resolvedDistrict, dong); } catch { neighborhood = null; }
  }
  const seen = new Set(scenes.map(scene => scene.id));
  const merged = [...scenes, ...(neighborhood?.scenes ?? []).filter(scene => !seen.has(scene.id))].map((scene, index) => ({...scene, order: index}));
  const story: DocentStory = {district: resolvedDistrict, dong, scenes: merged, total: merged.length,
    photoRecords: neighborhood?.photoRecords ?? 0, photoGroups: neighborhood?.photoGroups ?? 0,
    unpictured: scenes.length + (neighborhood?.unpictured ?? 0), version: neighborhood ? `landmark-research-1+${neighborhood.version}` : 'landmark-research-1'};
  const address: Address = {roadAddr: place, jibunAddr: location?.address.jibunAddr || '', siNm: '서울특별시', sggNm: resolvedDistrict, emdNm: dong, admCd: location?.address.admCd || '', bdMgtSn: '', bdNm: place, lnbrMnnm: '', lnbrSlno: '', mtYn: '0', zipNo: ''};
  return {story, address, research, landmarkSceneCount: scenes.length, neighborhoodSceneCount: merged.length - scenes.length};
}

export const LANDMARK_INSTRUCTIONS = '이 요청은 도로명주소가 없는 장소(다리·광장·공원 등)를 장소명으로 찾은 결과입니다. address 필드는 실제 주소가 아니라 장소명입니다. 7부 구조를 그대로 유지하세요. landmark.coordinates가 있으면 카카오 장소 검색으로 찾은 지점이고, dong은 그 지점의 법정동입니다. 다리처럼 여러 동에 걸친 곳은 그 동의 기록과 사진을 주변 맥락으로만 소개하고 장소 자체의 기록처럼 쓰지 마세요. neighborhood.records는 조사 자료 원문에서 가져온 기록이며 검토 전이어도 해설에 사용할 수 있습니다. 기록 제목·날짜·설명을 "서울기록원 기록에 따르면"처럼 소장기관과 함께 서술하고 원문 링크를 붙이세요. 기록에 없는 연도·수치·원인은 일반적으로 알려진 내용이라고 밝히고 쓰세요. 4부(건물 및 부지의 역사)는 이 구조물 자체의 건설·개통·사고·복구 기록으로 채우세요. 검토 상태와 권리 정보는 본문에서 반복하지 말고 마지막 "출처 및 검증 정보"에 한 번만 정리하세요.';
