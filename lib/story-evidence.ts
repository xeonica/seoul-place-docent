import type {CommonEvidence} from './reviewed-evidence';

type Photo={evidenceId?:string;sourceUrl?:string|null;verificationStatus?:string;displayable?:boolean};
const relation=(value:string)=>({exact_building:'exact_site',exact_parcel:'same_parcel',dong_context:'neighborhood_context'} as Record<string,string>)[value]||value;
/** Projection of current audited approvals only; discovery never creates claims. */
export function storyEvidence(records:CommonEvidence[],photos:Photo[]=[]){
 const usable=records.filter(r=>r.usableAsVerifiedEvidence&&r.verification.approvalActive&&r.claims.some(c=>c.verified));
 const source=(r:CommonEvidence)=>({evidenceId:r.evidenceId,recordId:r.recordId,title:r.title,sourceUrl:r.sourceUrl,placeId:r.placeId,addressId:r.placeId.startsWith('juso-building:')||r.placeId.startsWith('pnu:')?r.placeId:null,relationType:relation(r.relationType),originalRelationType:r.relationType,publishedAt:r.publishedAt,eventDate:r.eventDate,rightsStatus:r.rightsStatus,verificationStatus:'reviewed_source_claim',claims:r.claims.filter(c=>c.verified)});
 const articles=usable.filter(r=>r.mediaType==='article').map(r=>({...source(r),articleId:r.recordId,publisher:r.sourceInstitution,verifiedExcerpt:r.claims.find(c=>c.verified)?.text||null}));
 const videos=usable.filter(r=>r.mediaType==='video').map(r=>({...source(r),videoId:r.recordId,provider:r.sourceInstitution,filmedAt:null,contentVerificationStatus:'reviewed_claims_only',segmentVerificationStatus:r.media.verifiedSegments.length?'verified':'not_checked',segments:r.media.verifiedSegments.map(s=>({segmentId:s.segmentId,segmentStart:s.startSeconds,segmentEnd:s.endSeconds,segmentDescription:s.sceneDescription,sourceUrl:s.sourceUrl,segmentVerificationStatus:'verified',verificationBasis:s.verificationBasis})),usageNote:'주장은 검토한 범위만 사용합니다. filmedAt은 미확인이며 발행일을 촬영일로 해석하지 않습니다.'}));
 // One approved claim is one event. Equal dates/dongs alone never join events.
 const historicalEvents=usable.flatMap(r=>r.claims.filter(c=>c.verified).map(c=>({eventId:'event:'+r.evidenceId+':'+c.claimId,placeId:r.placeId,eventDate:r.eventDate,description:c.text,classification:c.classification,relationType:relation(r.relationType),claimId:c.claimId,documentEvidenceIds:r.mediaType==='document'?[r.evidenceId]:[],articleEvidenceIds:r.mediaType==='article'?[r.evidenceId]:[],photoEvidenceIds:[...(r.mediaType==='photo'?[r.evidenceId]:[]),...photos.filter(p=>p.displayable&&p.verificationStatus==='VERIFIED'&&p.sourceUrl===r.sourceUrl&&p.evidenceId).map(p=>p.evidenceId!)],videoEvidenceIds:r.mediaType==='video'?[r.evidenceId]:[],sourceUrl:r.sourceUrl,verificationStatus:'reviewed_source_claim',crossSourceEventIdentity:'not_checked'})));
 return {articles,videos,historicalEvents,usage:{status:'awaiting_client_answer',usedEvidenceIds:[] as string[],returnedApprovedEvidenceIds:usable.map(r=>r.evidenceId),note:'반환은 사용의 증명이 아닙니다. 최종 해설의 문단별 evidence_ids와 evidenceClaims를 validate_place_answer에 제출하세요.'},instructions:'historicalEvents의 검토한 주장과 원문만 사용하세요. 서로 다른 사건을 날짜·지역명만으로 연결하지 마세요. 기사·영상이 비어 있으면 사용했다고 쓰지 마세요. 사진의 피사체·장소 관계는 별도입니다. 실제 인용 ID는 검증 결과의 usedEvidenceIds로 추적하고 의미 검증은 사용자 AI가 수행합니다.'};
}

export function evidenceUsage(legacyIds:string[],claims:{evidenceId:string;valid:boolean}[]){
 const accepted=[...new Set([...legacyIds,...claims.filter(c=>c.valid).map(c=>c.evidenceId)])];
 return {usedEvidenceIds:accepted,rejectedEvidenceIds:[...new Set(claims.filter(c=>!c.valid).map(c=>c.evidenceId))],usageBasis:'client_submitted_paragraphs_and_claims',semanticVerification:'not_checked',note:'제출된 문단·주장 범위의 기계 검사입니다. 미제출된 최종 답변이나 이미지 렌더링을 관측한 기록은 아닙니다.'};
}
