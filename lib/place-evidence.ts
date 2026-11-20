import {searchAddressHistory} from './history-search';
import {DocentTrace} from './docent-runtime';
import rawDocuments from '../data/document-research/bundle.json';
import {documentPlaceResearch,type DocumentBundle,safeDocumentUrl} from './document-research';
import {articleCandidates} from './article-evidence';
import {reviewedEvidence,type CommonEvidence} from './reviewed-evidence';
import {bigQueryPlaceCandidates,bigQueryGitHubCandidates,bigQueryHansungArchive} from './bigquery-place';
import {getDocentVideoCandidates} from './docent-videos';
import {evidencePlace} from './evidence-place';
import type {Address} from './providers';
const mediaType=(value:unknown)=>/video|영상/i.test(String(value))?'video':/article|news|기사|신문/i.test(String(value))?'article':/photo|image|map|사진|지도/i.test(String(value))?'photo':'document';

export const evidenceInstructions='evidence.records 중 usableAsVerifiedEvidence=true인 개별 claims만 새 기사·영상·문헌의 확정 근거로 사용하세요. exact_building → exact_parcel → historical_site → nearby → dong_context → district_context 순으로 활용하며 지역 배경을 건물 자체의 사건으로 바꾸지 마세요. 모든 인용에 evidenceId와 claimId, 제목·기관·원문 링크를 붙이세요. 기사 publishedAt(발행일)과 eventDate(사건일)는 별개입니다. classification의 전승·추정 한정을 보존하세요. 영상은 사용 가능한 주장만 설명하고 구간이 없으면 전체 공식 원문 링크로 안내하세요. 시간 링크는 media.verifiedSegments에 있는 실제 확인 구간만 사용하세요. metadata_link_only/candidate_link_only는 조사 후보 소개이며 역사적 주장의 근거가 아닙니다. 사진 승인과 이미지 표시 권한은 별개이며 기존 visuals.photos만 표시하세요. validate_place_answer의 evidenceClaims에 인용한 개별 주장을 제출하세요. 서버의 의미 검증은 not_checked이며 사용자 AI가 원문 의미와 답변을 대조해야 합니다.';

/** Static indices contain metadata only. The live D1 ledger is the sole authority
 * for newly introduced claims; it is deliberately not cached with these indices. */
export async function prepareEvidence(request:Request,db:D1Database|undefined,address:Address,question='',videoLimit=3,videoOffset=0,trace=new DocentTrace(),options:{deferExternalCandidates?:boolean}={}){
 const deferred={source:'bigquery',status:'deferred',diagnosticStatus:'deferred',records:[],nextOffset:null,diagnostics:{backendStatus:'not_queried',candidateCount:0,placeLinkedCount:0,approvedCount:0,usableEvidenceCount:0,reasonCodes:['external_candidates_deferred']}};
 const reviewTask=trace.measure('d1_current_approvals',()=>reviewedEvidence(db,address));
 const placeQuery=reviewTask.then(reviewed=>trace.measure('bigquery_place',async()=>options.deferExternalCandidates?deferred:await bigQueryPlaceCandidates(request,address,6,0,reviewed.records.filter(r=>r.usableAsVerifiedEvidence&&['exact_building','exact_parcel','historical_site'].includes(r.relationType)).flatMap(r=>r.aliases.map(a=>a.name)))));
 const [reviewed,articles,videos,bigQueryGitHubResearch,hansungArchive,bigQueryResearch,researchCandidates]=await Promise.all([
  reviewTask,trace.measure('article_metadata',()=>articleCandidates(address,question)),
  trace.measure('video_metadata',()=>getDocentVideoCandidates(address.sggNm,address.emdNm,{query:question,placeName:address.bdNm,limit:videoLimit,offset:videoOffset})),
  trace.measure('bigquery_github',async()=>options.deferExternalCandidates?deferred:await bigQueryGitHubCandidates(request,{district:address.sggNm,dong:address.emdNm,placeName:address.bdNm})),
  trace.measure('bigquery_hansung',async()=>options.deferExternalCandidates?deferred:await bigQueryHansungArchive(request,{roadAddr:address.roadAddr,district:address.sggNm})),placeQuery,
  trace.measure('district_candidate_index',()=>searchAddressHistory({baseUrl:request.url,address,question}).catch(()=>null)),
 ]);
 const documents=documentPlaceResearch(rawDocuments as unknown as DocumentBundle,address.sggNm,[address.emdNm]);
 const documentCandidates=documents.context.sources.map(s=>({evidenceId:'candidate:document:'+s.id,recordId:s.id,mediaType:'document',title:s.title,sourceUrl:safeDocumentUrl(s.url||''),relationType:documents.scope==='legal_dong'?'dong_context':'district_context',reviewStatus:s.status,usableAsVerifiedEvidence:false,claims:[],claimReferences:documents.context.claims.filter(c=>c.sourceIds.includes(s.id)).map(c=>({claimId:c.id,sourceLocator:c.locator})),timelineReferences:documents.timeline.map(t=>t.id)}));
 const videoCandidates=videos.records.map(v=>({evidenceId:'candidate:video:'+v.id,recordId:v.id,mediaType:'video',title:v.title,sourceInstitution:v.provider,sourceUrl:v.url,relationType:'uncertain',reviewStatus:'candidate',usableAsVerifiedEvidence:false,claims:[],videoVerificationStatus:'metadata_only',usageMode:'candidate_link_only'}));
 const queried=[...bigQueryResearch.records,...(bigQueryGitHubResearch?.records||[]),...(hansungArchive?.records||[])];
 const bqCandidates=queried.map(row=>{const r=row as Record<string,unknown>;return {evidenceId:'candidate:'+mediaType(r.media_type||r.record_type)+':'+String(r.originalRecordId||r.record_id||r.research_id||r.import_row_id||r.source_url),recordId:String(r.originalRecordId||r.record_id||r.research_id||r.import_row_id||''),mediaType:mediaType(r.media_type||r.record_type),title:String(r.record_title||r.title||''),sourceUrl:safeDocumentUrl(String(r.source_url||'')),relationType:'uncertain',usableAsVerifiedEvidence:false,claims:[],reviewStatus:'candidate'};});
 const approvedIds=new Set(reviewed.records.map(r=>r.recordId));
 const candidates=[...articles.records.map(r=>({...r,recordId:r.id})),...documentCandidates,...videoCandidates,...bqCandidates].filter(r=>!approvedIds.has(r.recordId));
 // Deduplicate records, never URLs: one original may support multiple claims.
 const unique=[...new Map(candidates.map(r=>[r.evidenceId,r])).values()].map(r=>({eventDate:null,publishedAt:null,placeId:null,relationReviewStatus:'unverified',rightsStatus:'metadata_link_only',sourceInstitution:null,media:{videoUrl:null,verifiedSegments:[]},verification:{level:'not_checked'},usageMode:'candidate_link_only',acquisition:'mcp_candidate_index',...r}));
 const counts=Object.fromEntries(['article','video','photo','document'].map(type=>[type,{candidateCount:unique.filter(r=>r.mediaType===type).length,approvedCount:reviewed.records.filter(r=>r.mediaType===type&&r.reviewStatus==='approved'&&r.verification.approvalActive).length,usableEvidenceCount:reviewed.records.filter(r=>r.mediaType===type&&r.usableAsVerifiedEvidence).length}]));
 return {researchCandidates,bigQueryResearch,bigQueryGitHubResearch,hansungArchive,videos,evidence:{place:evidencePlace(address),status:reviewed.status==='no_candidates'&&unique.length?'candidates_unlinked':reviewed.status,records:reviewed.records,candidates:unique,diagnostics:{...reviewed.diagnostics,candidateCount:reviewed.diagnostics.candidateCount+unique.length,unlinkedCandidateCount:unique.length,byMediaType:counts,articleIndex:{status:articles.status,total:articles.total},videoIndex:{candidateCount:videos.candidateCount,searchedCount:videos.searchedCount,returnedCount:videos.returnedCount},bigquery:bigQueryResearch.diagnosticStatus},semanticVerification:'not_checked'}};
}

export type SubmittedEvidenceClaim={evidenceId:string;claimId:string;text:string;relationType?:string;eventDate?:string|null;publishedAt?:string|null;segmentId?:string};
/** Conservative mechanical check: no unverified paraphrase is rubber stamped. */
export function validateEvidenceClaims(records:CommonEvidence[],submitted:SubmittedEvidenceClaim[]){
 const results=submitted.map(item=>{
  const evidence=records.find(r=>r.evidenceId===item.evidenceId),claim=evidence?.claims.find(c=>c.claimId===item.claimId),reasons:string[]=[];
  if(!evidence||!evidence.usableAsVerifiedEvidence)reasons.push('evidence_unavailable_or_revoked');
  if(!claim)reasons.push('claim_unknown');
  if(claim&&item.text.trim()!==claim.text.trim())reasons.push('claim_text_requires_source_review');
  if(item.relationType!==undefined&&item.relationType!==evidence?.relationType)reasons.push('place_scope_mismatch');
  if(item.eventDate!==undefined&&item.eventDate!==evidence?.eventDate)reasons.push('event_date_mismatch');
  if(item.publishedAt!==undefined&&item.publishedAt!==evidence?.publishedAt)reasons.push('publication_date_mismatch');
  if(item.segmentId&&!evidence?.media.verifiedSegments.some(s=>s.segmentId===item.segmentId))reasons.push('segment_not_verified');
  return {evidenceId:item.evidenceId,claimId:item.claimId,valid:!reasons.length,reasonCodes:reasons,semanticVerification:'not_checked'};
 });
 return {valid:results.every(r=>r.valid),checked:results.length,results,semanticVerification:'not_checked'};
}
