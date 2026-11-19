import {z} from 'zod';
import {ServiceError,type Address} from './providers';
import {canonicalUrl,hashText,safeArchiveUrl} from './archive-validation';
import {activePassageReviewSql,passageStateSql,currentPassageSql} from './archive-passage-review';
import {evidencePlace,relationTypes} from './evidence-place';

const text=z.string().trim().min(1).max(200);
const date=z.string().max(80).nullable();
const inputSchema=z.object({recordId:text,passageId:text,placeKey:z.string().min(3).max(300),mediaType:z.enum(['article','document','photo','video']),relationType:z.enum(relationTypes),status:z.enum(['candidate','pending_review','approved','rejected','revoked']),expectedRevision:z.number().int().min(0),expectedFingerprint:z.string().regex(/^[a-f0-9]{64}$/),
 payload:z.object({relationEvidenceId:text,relationBasis:z.string().min(10).max(1500),sourceVerified:z.boolean(),contentVerified:z.boolean(),placeVerified:z.boolean(),claimVerified:z.boolean(),citationAllowed:z.boolean(),aiAllowed:z.boolean(),rightsEvidenceUrl:z.string().url().max(2000),rightsNote:z.string().min(5).max(1000),eventDate:date,publishedAt:date,
 aliases:z.array(z.object({name:z.string().min(2).max(100),validFrom:date,validTo:date,evidenceId:text})).max(10).default([]),
 segments:z.array(z.object({segmentId:text,startSeconds:z.number().finite().min(0),endSeconds:z.number().finite().positive(),sceneDescription:z.string().min(5).max(1000),verificationBasis:z.string().min(10).max(1500),verifiedAt:z.string().datetime(),sourceUrl:z.string().url().max(2000)})).max(20).default([])
 }).strict()}).strict();
type Payload=z.infer<typeof inputSchema>['payload'];
type Row={provider_id:string|null;content_review_id:string;content_review_key:string;classification:string;id:string;record_id:string;passage_id:string;place_key:string;media_type:'article'|'document'|'photo'|'video';relation_type:typeof relationTypes[number];status:string;revision:number;snapshot_json:string;payload_json:string;actor:string;checked_at:string;evidence_id:string;text:string;locator:string;text_kind:string;source_id:string;source_url:string;source_title:string;institution:string;rights:string;reuse_allowed:number;publication_date:string|null;state_json:string;content_active:number;audited:number};
const sourceJoin='FROM archive_passages p JOIN archive_sources s ON s.id=p.source_id JOIN archive_versions pv ON pv.id=p.version_id AND pv.source_id=s.id';
const contentReview="(SELECT cr.id FROM archive_passage_reviews cr WHERE cr.passage_id=p.id ORDER BY cr.revision DESC LIMIT 1)";
const contentClassification="(SELECT json_extract(cr.evidence,'$.classification') FROM archive_passage_reviews cr WHERE cr.passage_id=p.id ORDER BY cr.revision DESC LIMIT 1)";
const projection=`${contentReview} AS content_review_id,${contentClassification} AS classification,s.provider_id,p.id AS passage_key,p.text,p.locator,p.text_kind,p.source_id,s.url AS source_url,s.title AS source_title,s.institution,s.rights,s.reuse_allowed,s.publication_date,${passageStateSql} AS state_json,(${activePassageReviewSql}) AS content_active`;
export type CommonEvidence={evidenceId:string;recordId:string;mediaType:string;title:string;sourceInstitution:string;sourceUrl:string;eventDate:string|null;publishedAt:string|null;placeId:string;relationType:string;relationReviewStatus:string;reviewStatus:string;rightsStatus:string;usableAsVerifiedEvidence:boolean;claims:{claimId:string;text:string;sourceLocator:string;verified:boolean;classification:string}[];media:{videoUrl:string|null;verifiedSegments:{segmentId:string;startSeconds:number;endSeconds:number;sceneDescription:string;sourceUrl:string;verificationBasis:string;verifiedAt:string}[]};verification:{approvalActive:boolean;level:string;reviewId:string;revision:number;reasonCodes:string[]};aliases:Payload['aliases'];videoVerificationStatus:string|null;usageMode:string};
export async function evidenceReviewTarget(db:D1Database,passageId:string){
 const row=await db.prepare(`SELECT ${projection} ${sourceJoin} WHERE p.id=? AND ${currentPassageSql}`).bind(passageId).first<Row>();
 if(!row)throw new ServiceError('EVIDENCE_PASSAGE','현재 본문을 찾지 못했습니다.',404);
 return {...row,id:passageId,fingerprint:await hashText(row.state_json+'\n'+(row.content_review_id||'')),scopeNote:'본문 검토와 장소·인용·AI 처리 권한 승인은 별개입니다.'};
}
/** Called only after requireArchiveAdmin. The existing content review must still be active. */
export async function reviewEvidence(db:D1Database,raw:unknown,actor:string){
 const parsed=inputSchema.safeParse(raw);if(!parsed.success)throw new ServiceError('EVIDENCE_INPUT','장소 연결·권리·검토 입력을 확인해 주세요.',400);
 const input=parsed.data,row=await evidenceReviewTarget(db,input.passageId),p=input.payload;
 if(!actor)throw new ServiceError('EVIDENCE_ACTOR','관리자 인증이 필요합니다.',403);
 if(['historical_site','nearby'].includes(input.relationType)&&!/^juso-building:|^pnu:/.test(input.placeKey))throw new ServiceError('EVIDENCE_SCOPE','과거 장소·인근 자료도 검색 대상 건물 또는 필지 식별자로 연결해야 합니다.',400);
 if(input.relationType==='exact_building'&&!input.placeKey.startsWith('juso-building:')||input.relationType==='exact_parcel'&&!input.placeKey.startsWith('pnu:')||input.relationType==='dong_context'&&!input.placeKey.startsWith('dong:')||input.relationType==='district_context'&&!input.placeKey.startsWith('district:'))throw new ServiceError('EVIDENCE_SCOPE','관계와 장소 식별자 범위가 일치하지 않습니다.',400);
 if(!safeArchiveUrl(p.rightsEvidenceUrl))throw new ServiceError('EVIDENCE_RIGHTS','공식 이용조건 원문 URL이 필요합니다.',400);
 for(const segment of p.segments)if(input.mediaType!=='video'||segment.endSeconds<=segment.startSeconds||Date.parse(segment.verifiedAt)>Date.now()+300000||canonicalUrl(segment.sourceUrl)!==canonicalUrl(row.source_url))throw new ServiceError('EVIDENCE_SEGMENT','실제로 확인한 원문의 구간·시각만 기록해 주세요.',400);
 if(input.status==='approved'&&input.recordId!==row.source_id&&input.recordId!==row.provider_id)throw new ServiceError('EVIDENCE_SOURCE','자료 ID가 등록된 출처의 ID 또는 제공기관 자료 ID와 일치해야 합니다.',400);
 if(input.status==='approved'&&(!row.content_active||!p.sourceVerified||!p.contentVerified||!p.placeVerified||!p.claimVerified||!p.citationAllowed||!p.aiAllowed||row.rights==='unknown'||!row.reuse_allowed||input.relationType==='uncertain'||row.text.length>1200||row.text_kind!=='paraphrase'&&row.text.length>300))throw new ServiceError('EVIDENCE_APPROVAL','현재 본문 검토·장소·주장·개별 인용/AI 권한을 모두 확인해야 합니다. 긴 원문은 제공하지 않습니다.',400);
 if(row.fingerprint!==input.expectedFingerprint)throw new ServiceError('EVIDENCE_STALE','본문이나 출처가 바뀌었습니다. 최신 내용을 다시 확인해 주세요.',409);
 const evidenceId='evidence:'+await hashText([input.recordId,input.passageId,input.placeKey].join('\n'));
 const latest=await db.prepare('SELECT max(revision) AS revision FROM docent_evidence_reviews WHERE evidence_id=?').bind(evidenceId).first<{revision:number|null}>();
 if((latest?.revision||0)!==input.expectedRevision)throw new ServiceError('EVIDENCE_CONFLICT','검토가 변경됐습니다. 최신 리비전을 확인해 주세요.',409);
 const id=crypto.randomUUID(),at=new Date().toISOString();
 try{await db.batch([
  db.prepare(`INSERT INTO docent_evidence_reviews(id,evidence_id,record_id,passage_id,place_key,media_type,relation_type,status,revision,snapshot_json,payload_json,actor,checked_at,content_review_key) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,? ${sourceJoin} WHERE p.id=? AND ${currentPassageSql} AND ${passageStateSql}=? AND coalesce(${contentReview},'')=? AND coalesce((SELECT max(revision) FROM docent_evidence_reviews WHERE evidence_id=?),0)=?`).bind(id,evidenceId,input.recordId,input.passageId,input.placeKey,input.mediaType,input.relationType,input.status,input.expectedRevision+1,row.state_json,JSON.stringify(p),actor,at,row.content_review_id||'',input.passageId,row.state_json,row.content_review_id||'',evidenceId,input.expectedRevision),
  db.prepare('INSERT INTO archive_audit(id,source_id,action,actor,note,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM docent_evidence_reviews WHERE id=?)').bind(crypto.randomUUID(),row.source_id,'evidence_review',actor,JSON.stringify({reviewId:id,evidenceId,status:input.status,revision:input.expectedRevision+1}),at,id)
 ]);}catch{throw new ServiceError('EVIDENCE_CONFLICT','동시 수정 또는 감사 기록 오류로 저장하지 않았습니다.',409);}
 if(!await db.prepare('SELECT id FROM docent_evidence_reviews WHERE id=?').bind(id).first())throw new ServiceError('EVIDENCE_CONFLICT','검토 대상이 바뀌어 저장하지 않았습니다.',409);
 return {reviewId:id,evidenceId,revision:input.expectedRevision+1,status:input.status};
}
export async function reviewedEvidence(db:D1Database|undefined,address:Partial<Address>){
 const place=evidencePlace(address);
 if(!db)return {status:'backend_unavailable',records:[] as CommonEvidence[],diagnostics:{candidateCount:0,placeLinkedCount:0,approvedCount:0,rejectedCount:0,usableEvidenceCount:0,reasonCodes:['d1_unconfigured'],sampled:false}};
 if(!place.keys.length)return {status:'no_candidates',records:[] as CommonEvidence[],diagnostics:{candidateCount:0,placeLinkedCount:0,approvedCount:0,rejectedCount:0,usableEvidenceCount:0,reasonCodes:['identity_missing'],sampled:false}};
 try{
 const rows=(await db.prepare(`SELECT rv.*,${projection},EXISTS(SELECT 1 FROM archive_audit a WHERE a.action='evidence_review' AND a.actor=rv.actor AND json_extract(a.note,'$.reviewId')=rv.id AND json_extract(a.note,'$.evidenceId')=rv.evidence_id AND json_extract(a.note,'$.revision')=rv.revision AND json_extract(a.note,'$.status')=rv.status) AS audited ${sourceJoin} JOIN docent_evidence_reviews rv ON rv.passage_id=p.id WHERE rv.place_key IN (${place.keys.map(()=>'?').join(',')}) AND rv.revision=(SELECT max(n.revision) FROM docent_evidence_reviews n WHERE n.evidence_id=rv.evidence_id) AND ${currentPassageSql} ORDER BY CASE rv.relation_type WHEN 'exact_building' THEN 0 WHEN 'exact_parcel' THEN 1 WHEN 'historical_site' THEN 2 WHEN 'nearby' THEN 3 WHEN 'dong_context' THEN 4 ELSE 5 END,rv.evidence_id LIMIT 201`).bind(...place.keys).all<Row>()).results;
 const records:CommonEvidence[]=rows.slice(0,200).map(row=>{
  let payload:Payload|null=null;try{const parsed=inputSchema.shape.payload.safeParse(JSON.parse(row.payload_json));if(parsed.success)payload=parsed.data;}catch{}
  const active=!!row.audited&&!!row.actor&&row.snapshot_json===row.state_json&&row.content_review_key===row.content_review_id;
  const rights=!!payload?.citationAllowed&&!!payload.aiAllowed&&row.rights!=='unknown'&&!!row.reuse_allowed;
  const usable=(row.record_id===row.source_id||row.record_id===row.provider_id)&&active&&!!row.content_active&&row.status==='approved'&&rights&&!!payload?.sourceVerified&&!!payload.contentVerified&&!!payload.placeVerified&&!!payload.claimVerified&&row.relation_type!=='uncertain'&&row.text.length<=1200&&(row.text_kind==='paraphrase'||row.text.length<=300);
  const reasons=[...(row.record_id!==row.source_id&&row.record_id!==row.provider_id?['record_source_mismatch']:[]),...(!active?['approval_stale_or_unaudited']:[]),...(!row.content_active?['content_not_checked']:[]),...(!rights?['rights_restricted']:[]),...(row.status!=='approved'?['not_approved']:[])];
  const sourceChecked=active&&!!payload?.sourceVerified&&!['rejected','revoked'].includes(row.status);
  const segments=usable?payload?.segments||[]:[];
  return {evidenceId:row.evidence_id,recordId:row.record_id,mediaType:row.media_type,title:row.source_title,sourceInstitution:row.institution,sourceUrl:row.source_url,eventDate:payload?.eventDate||null,publishedAt:payload?.publishedAt||row.publication_date||null,placeId:row.place_key,relationType:row.relation_type,relationReviewStatus:active&&payload?.placeVerified?'approved':'unverified',reviewStatus:row.status,rightsStatus:rights?'citation_and_ai_permitted':'metadata_link_only',usableAsVerifiedEvidence:usable,
   claims:usable?[{claimId:row.passage_id,text:row.text,sourceLocator:row.locator,verified:true,classification:row.classification}]:[],media:{videoUrl:row.media_type==='video'?row.source_url:null,verifiedSegments:segments},verification:{approvalActive:active,level:usable?'reviewed_source_claim':'not_checked',reviewId:row.id,revision:row.revision,reasonCodes:reasons},aliases:usable?payload?.aliases||[]:[],videoVerificationStatus:row.media_type==='video'?(row.status==='rejected'||row.status==='revoked'?'rejected':!rights?'rights_restricted':segments.length?'segment_verified':usable?'place_verified':sourceChecked?'source_verified':'metadata_only'):null,usageMode:usable?(row.media_type==='video'?(segments.length?'verified_segment_link':'full_video_link'):'verified_claim'):sourceChecked?'source_link_only':'candidate_link_only'};
 });
 const diagnostics={candidateCount:records.length,placeLinkedCount:records.filter(row=>row.relationReviewStatus==='approved').length,approvedCount:records.filter(row=>row.reviewStatus==='approved'&&row.verification.approvalActive).length,rejectedCount:records.filter(row=>['rejected','revoked'].includes(row.reviewStatus)).length,usableEvidenceCount:records.filter(row=>row.usableAsVerifiedEvidence).length,reasonCodes:[...new Set(records.flatMap(row=>row.verification.reasonCodes))],sampled:rows.length>200};
 return {status:diagnostics.usableEvidenceCount?'approved_records_available':!records.length?'no_candidates':records.some(row=>row.verification.reasonCodes.includes('rights_restricted'))?'rights_restricted':'pending_review_only',records,diagnostics};
 }catch{return {status:'backend_unavailable',records:[] as CommonEvidence[],diagnostics:{candidateCount:0,placeLinkedCount:0,approvedCount:0,rejectedCount:0,usableEvidenceCount:0,reasonCodes:['d1_query_failed_or_migration_missing'],sampled:false}};}
}
