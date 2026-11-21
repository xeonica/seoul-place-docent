import {FIELD_DOCENT_RULES} from './docent-experience';
type ObjectValue=Record<string,unknown>;
type BriefPacket=ObjectValue&{
 evidence:ObjectValue&{candidates:ObjectValue[];records:ObjectValue[]};
 visuals:ObjectValue&{photos:ObjectValue[];sourceOnlyRecords:unknown};
 neighborhood:ObjectValue&{records:ObjectValue[]};
 storytelling:ObjectValue&{historicalEvents:ObjectValue[]};
 videos:ObjectValue&{records:ObjectValue[]};
 registerDiagnostics:ObjectValue&{sections:Record<string,ObjectValue>};
 bigQueryResearch:ObjectValue&{status:string};
 instructions:string;
};
const asObject=(value:unknown):ObjectValue=>value&&typeof value==='object'&&!Array.isArray(value)?value as ObjectValue:{};
const pick=(value:ObjectValue,names:string[])=>Object.fromEntries(names.filter(k=>value[k]!==undefined).map(k=>[k,value[k]]));
/** Explicit opt-in DTO. standard/full retain the previous response contract. */
export function briefDocent(packet:BriefPacket,token:string){
 const original=packet.evidence.candidates,counts=new Map<unknown,number>();
 const candidates=original.filter(r=>{const mediaType=r.mediaType,n=counts.get(mediaType)||0;counts.set(mediaType,n+1);return n<2;}).map(r=>pick(r,['evidenceId','recordId','mediaType','title','sourceUrl','sourceInstitution','publishedAt','eventDate','relationType','reviewStatus','rightsStatus','usableAsVerifiedEvidence','usageMode']));
 const photos=packet.visuals.photos.map((p:ObjectValue)=>pick(p,['evidenceId','title','date','scope','credit','caption','note','imageUrl','displayImageUrl','originalImageUrl','sourceUrl','sourcePageUrl','sourceRecordId','mediaId','license','displayable','verificationStatus','alternateUrls','relation_type','locationVerification']));
 // All current approvals, all their claims, and reviewed counter-evidence remain.
 const records=packet.evidence.records.map((r:ObjectValue)=>pick(r,['evidenceId','recordId','mediaType','title','sourceInstitution','sourceUrl','eventDate','publishedAt','placeId','relationType','relationReviewStatus','reviewStatus','rightsStatus','usableAsVerifiedEvidence','claims','media','verification','videoVerificationStatus','usageMode']));
 return {version:'brief-docent-1',mode:packet.mode,status:packet.status,generation:packet.generation,address:packet.address,district:packet.district,dong:packet.dong,question:packet.question,
  place:packet.place,map:packet.map,coordinates:packet.coordinates,
  neighborhood:{...pick(packet.neighborhood,['district','dong','selected','available']),records:packet.neighborhood.records.map((r:ObjectValue)=>({...pick(r,['id','date','year','title','text','scope','cutCount','evidence']),source:pick(asObject(r.source),['institution','url'])}))},
  evidence:{...packet.evidence,records,candidates},
  historicalEvents:packet.storytelling.historicalEvents.map((e:ObjectValue)=>pick(e,['eventId','placeId','eventDate','claimId','classification','relationType','documentEvidenceIds','articleEvidenceIds','photoEvidenceIds','videoEvidenceIds','verificationStatus','crossSourceEventIdentity'])),
  videos:{...pick(packet.videos,['candidateCount','searchedCount','returnedCount']),records:packet.videos.records.slice(0,2).map((v:ObjectValue)=>pick(v,['id','title','provider','date','dateType','url','relation','verificationStatus','contentVerified','independentlyVerified','verifiedSegments','playbackStatus']))},
  visuals:{photos,sourceOnlyRecords:packet.visuals.sourceOnlyRecords,photoCount:photos.length},
  registerDiagnostics:{sections:Object.fromEntries(Object.entries(packet.registerDiagnostics.sections).map(([name,s])=>[name,pick(s as ObjectValue,['status','code','message','ms','cache'])]))},
  provenance:packet.provenance,timing:packet.timing,tourPlan:packet.tourPlan,
  validationContext:{token,question:packet.question},answerSchema:packet.answerSchema,
  details:{tool:'prepare_place_answer',detailLevel:'full',reuse:'validationContext.token + question',candidateRowsOmitted:original.length-candidates.length,externalCandidatesDeferred:packet.bigQueryResearch.status==='deferred',note:'추가 원문·후보·사진은 같은 token으로 full 조회합니다. 지연 조회는 자료 없음이나 검증 완료가 아닙니다.'},
  instructions:packet.instructions+' '+FIELD_DOCENT_RULES+' brief의 짧은 분량도 종합 도슨트라면 7부 각각에 맞춰 배분하세요. 승인된 claims의 한정·상충을 생략하지 마세요. 후보는 사실 근거가 아닙니다. 외부 후보가 deferred이면 필요할 때만 같은 token·question으로 detailLevel=full 조회하세요. 기본 근거가 충분하면 get_place_history와 prepare를 반복 호출하지 마세요. 검증 시 validationContext를 사용하세요. 사진 실패는 제목·원문 링크로 안내하며 검색 사진으로 바꾸지 마세요. 지도는 map.externalUrl을 사용하고 좌표가 null이면 추정하지 마세요.'};
}
