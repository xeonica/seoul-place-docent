import {placeEntity} from './place-entity';
import type {Address} from './providers';
import type {PlaceAnswer} from './place-answer';
import type {buildingInfo} from './building-info';
import type {getDocentVideoCandidates} from './docent-videos';
import type {guidePhotos} from './place-answer';
import type {placeResearchCandidates} from './research-catalog';

export const PLACE_OUTPUT_SCHEMA={type:'object',anyOf:[{required:['place','facts','history','media','sources','limitations','verification','retrievalStatus']},{required:['needsChoice','candidates']}],properties:{
 place:{type:'object'},facts:{type:'object'},history:{type:'object'},media:{type:'object'},sources:{type:'array',items:{type:'object'}},limitations:{type:'array',items:{type:'string'}},verification:{type:'object'},retrievalStatus:{type:'object'},
},additionalProperties:true};
export type IntegratedPlaceEvidence=ReturnType<typeof integratedEvidence>;
export function integratedEvidence(input:{address:Address;packet:PlaceAnswer;building:Awaited<ReturnType<typeof buildingInfo>>;research:ReturnType<typeof placeResearchCandidates>;photos:ReturnType<typeof guidePhotos>;videos:Awaited<ReturnType<typeof getDocentVideoCandidates>>;closedStatus:Record<string,unknown>}){
 const {address,packet,building,research,photos,videos}=input;
 const entity=placeEntity(address);
 return {
  facts:{building:{...building,scope:'building',matchStatus:building.status==='verified'?'exact':'unverified'},complex:{status:'unverified',apartmentComplexCode:null,records:[],note:'K-apt API 연동·접근 권한은 확인되지 않았습니다.'}},
  history:{direct:[],parcel:packet.place.records.filter(row=>row.register==='폐쇄말소대장').map(row=>({...row,evidenceType:'closed_register',scope:'parcel',matchStatus:'associated'})),neighborhood:packet.neighborhood.records.map((row,index)=>({id:row.id,evidenceType:'neighborhood',scope:row.scope,matchStatus:'context_only',recordRef:'/neighborhood/records/'+index})),research:{status:research.status,total:research.total,nextOffset:research.nextOffset,records:research.records.map((row,index)=>({id:row.id,scope:'district',matchStatus:'unverified',recordRef:'/research/records/'+index}))}},
  media:{photos:photos.map(photo=>({...photo,mediaId:'photo:'+photo.evidenceId,evidenceIds:[photo.evidenceId],matchStatus:'context_only',dateMeaning:'원자료의 역사 시기이며 촬영일로 단정하지 않음',displayPermission:'provided_preview_only',buildingMatch:'unverified'})),videos:videos.records.map(video=>({...video,mediaId:'video:'+video.id,evidenceIds:[],scope:video.relation==='legal_dong_candidate'?'dong':'district',matchStatus:'unverified',displayPermission:'official_link_only',timeRangeVerified:video.verifiedSegments.length>0}))},
  sources:[...packet.neighborhood.records.map(row=>({id:row.id,title:row.source.title,url:row.source.url,institution:row.source.institution,evidenceType:'neighborhood',scope:row.scope,matchStatus:'context_only'})),...building.records.map(row=>({id:row.id,url:building.sourceUrl,evidenceType:'building_register',scope:'building',matchStatus:building.status==='verified'?'exact':'unverified',queriedAt:building.queriedAt})),...research.records.map(row=>({id:row.id,url:row.sourceUrl,evidenceType:'research_candidate',scope:'district',matchStatus:'unverified'}))],
  limitations:[...entity.limitations,...(building.status==='verified'?[]:['건축물대장 조회 상태: '+building.status]),'건물의 최초 건립연도·직접 역사·K-apt 코드·세대수 추가 검증이 필요할 수 있습니다. 사용승인일로 건축연도를 추정하지 않습니다.','조사 후보는 원문·장소·이용조건 독립 검증 전 확정 근거가 아닙니다.'],
  verification:{level:'mechanical_only',semanticVerified:false,entity,buildingFieldsTool:'validate_place_answer.buildingClaims',historicalStatus:'unverified'},
  retrievalStatus:{building:building.status,closed:input.closedStatus,history:packet.neighborhood.records.length?'available':'no_records',research:research.status,video:videos.records.length?'candidates':'no_records'},
 };
}
