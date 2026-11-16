import {getDocentStory} from './docent-data';
import {enrichMcpPlace} from './mcp-place-context';
import {photoResearchThumbnail} from './photo-research';
import {sceneSource} from './place-answer';
import {verifyAddress} from './providers';

export async function readMcpPlaceHistory(token: string, env: Cloudflare.Env, offset = 0, limit = 6, includeRegister = true) {
  const address = await verifyAddress(token, env);
  const {story, context} = await enrichMcpPlace(address,
    getDocentStory(address.sggNm, address.emdNm, [address.bdNm].filter(Boolean)), env, includeRegister);
  const scenes = story.scenes.slice(offset, offset + limit).map(scene => ({
    id: scene.id, kind: scene.kind, date: scene.date, year: scene.year, title: scene.title,
    text: scene.text, scope: scene.scope, spatialRelation: context.relations.get(scene.id), cutCount: scene.cutCount,
    photos: scene.photos.slice(0, 1).map(photo => ({
      previewUrl: photoResearchThumbnail(photo), sourceUrl: photo.sourceUrl, provider: photo.provider,
      relation: photo.relation, note: '이미지 이용조건과 장소 관계는 제공기관 원문을 확인해 주세요.',
    })),
    evidence: scene.evidence,
  }));
  const mapped = story.scenes.flatMap(scene => {
    const spatialRelation = context.relations.get(scene.id);
    if (!spatialRelation?.point || !['direct', 'nearby'].includes(spatialRelation.category)) return [];
    return [{...sceneSource(scene), text: scene.text, spatialRelation}];
  });
  const direct = mapped.filter(record => record.spatialRelation.category === 'direct');
  const nextOffset = offset + scenes.length;
  return {
    address,
    place: {records: direct, status: direct.length ? 'verified_parcel' : 'unverified', buildingRegister: context.register,
      note: direct.length ? '출처에서 확인한 필지의 역사 기록입니다.' : '이 주소와 직접 연결된 역사 기록은 확인되지 않았습니다.'},
    spatial: {origin: context.origin, coordinateStatus: context.coordinateStatus, radiusMeters: context.radiusMeters,
      distanceMethod: 'straight_line_between_reference_points'},
    mappedRecords: mapped,
    neighborhood: {district: story.district, dong: story.dong, scenes, total: story.total, offset,
      nextOffset: nextOffset < story.scenes.length ? nextOffset : null, sceneCount: story.scenes.length,
      photoRecords: story.photoRecords, photoGroups: story.photoGroups, unpictured: story.unpictured},
    note: '각 장면의 출처와 공간 관계를 확인하세요. 인근 및 지역 배경 자료는 입력한 건물·부지와 별개입니다.',
  };
}

type History = Awaited<ReturnType<typeof readMcpPlaceHistory>>;
export type VisitEvidence = {
  mappedRecords: History['mappedRecords'];
  spatial: History['spatial'];
  sources: {title: string; url: string; institution: string}[];
  returned: number;
  available: number;
  receipt: {requestId: string; auditPersisted: boolean} | null;
};
