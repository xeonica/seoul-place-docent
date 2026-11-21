import raw from '../data/research-catalog.json';
import {classifyPlaceMatch} from './place-linking';
type Observation={file:string;line:number;recordId:string;originalUrl:string;title:string;institution:string;mediaType:string;date:string;district:string;location:string;scope:string;relation:string;reviewStatus:string;rights:string;checkedAt:string;description:string;notes:string;permissions:{display:string;thumbnail:string;embed:string};relations:{relation_type:string;relation_evidence:string;link_review_status:string;place:{place_name:string;district:string;legal_dong:string;location_review_status:string}|null}[]};
type RecordItem={id:string;sourceUrl:string;observations:Observation[]};
const catalog=raw as unknown as {meta:typeof raw.meta;items:RecordItem[]};
export const researchCatalogStatus=catalog.meta;
const norm=(s:string)=>s.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g,'');
const spatial=(o:Observation)=>[o.district,o.location,...o.relations.flatMap(r=>r.place?[r.place.place_name,r.place.district,r.place.legal_dong]:[])].join(' ');
const searchable=(o:Observation)=>[o.title,o.institution,o.mediaType,o.date,spatial(o),o.scope,o.relation].join(' ');
const prohibited=(o:Observation)=>/RESTRICTED_AI_USE|AI[^;。]*금지/i.test(o.rights);
const relationName=(v:string)=>({EXACT_SITE:'exact_site',PARCEL:'parcel',NEARBY:'nearby',DISTRICT_CONTEXT:'district_context',DONG_CONTEXT:'district_context',UNCERTAIN:'uncertain'} as Record<string,string>)[v.toUpperCase()]||'uncertain';
export type ResearchSearch={query?:string;district?:string;offset?:number;limit?:number;dong?:string;placeName?:string};
/** All results are metadata candidates. No rights or exact-site approval is inferred. */
export function searchResearchRecords(input:ResearchSearch={}){
 const words=(input.query||'').normalize('NFKC').toLocaleLowerCase().trim().split(/\s+/).filter(Boolean).map(norm);
 const localTerms=[input.dong,input.placeName].filter((x):x is string=>!!x&&x.length>=2).map(norm);
 const offset=Math.max(0,Math.floor(input.offset||0)),limit=Math.min(12,Math.max(1,Math.floor(input.limit||6)));
 const hits=catalog.items.flatMap(record=>{
  const matched=record.observations.filter(o=>{
   if(words.length&&!words.every(t=>norm(searchable(o)).includes(t)))return false;
   if(!input.dong&&input.district&&o.district!==input.district&&!o.relations.some(r=>r.place?.district===input.district))return false;
   if(input.dong&&input.district&&o.district&&o.district!==input.district&&/^[가-힣]+구$/.test(o.district))return false;
   if(localTerms.length&&!localTerms.some(t=>norm(spatial(o)+' '+o.title).includes(t)))return false;
   return true;
  });
  return matched.length?[{record,matched}]:[];
 });
 return {dataset:{contentSha256:catalog.meta.contentSha256,uniqueSources:catalog.meta.uniqueSources,inputRows:catalog.meta.inputRows},status:'research_candidates_only',query:input.query||null,total:hits.length,offset,nextOffset:offset+limit<hits.length?offset+limit:null,
  records:hits.slice(offset,offset+limit).map(({record,matched})=>({id:record.id,sourceUrl:record.sourceUrl,candidate:true,usableAsVerifiedEvidence:false,buildingMatch:'unverified',imageUrl:null,embedUrl:null,observationCount:record.observations.length,
   // A restrictive variant applies to the whole URL even if another CSV omits it.
   contentUse:record.observations.some(prohibited)?'prohibited':'unverified',
   observations:matched.map(o=>({...o,description:record.observations.some(prohibited)?'':o.description.slice(0,600),evidenceId:o.recordId||record.id,provenance:{path:o.file,line:o.line},relations:o.relations.map(link=>{
    const declared=relationName(link.relation_type||'');
    const match=classifyPlaceMatch({relationDeclared:declared,reviewStatus:/^APPROVED$/i.test(link.link_review_status)?'approved':/^REJECTED$/i.test(link.link_review_status)?'rejected':'pending',placeReviewStatus:/^(VERIFIED|APPROVED)$/i.test(link.place?.location_review_status||'')?'verified':'pending',recordDistrict:o.district,placeDistrict:link.place?.district,sourceUrl:record.sourceUrl,institution:o.institution,evidence:link.relation_evidence});
    return {...link,declaredRelation:declared,relation:match.relation,matchMethod:match.matchMethod,distanceMeters:match.distanceMeters,reviewStatus:match.reviewStatus,approvable:match.approvable,classificationReason:match.reason};
   })})),
   otherProvenance:record.observations.filter(o=>!matched.includes(o)).map(o=>({path:o.file,line:o.line,recordId:o.recordId,reviewStatus:o.reviewStatus,rights:o.rights,permissions:o.permissions}))})),
  note:'GitHub 조사 CSV의 메타데이터 후보입니다. 원문 URL별로 중복을 묶고 각 조사행의 출처·검토·권리·장소 판정을 보존했습니다. 현재 건물·필지와의 일치와 촬영 장면은 미검증입니다. 원문 확인 전 확정 역사 근거로 인용하거나 이미지·영상을 표시하지 마세요.'};
}
export function placeResearchCandidates(district:string,dong:string,placeName=''){
 // Prefer explicit neighborhood/place mentions; a broad district alone cannot prove a local match.
 return searchResearchRecords({district,dong,placeName,limit:6});
}
