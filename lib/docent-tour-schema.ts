import {z} from 'zod';

export const TOUR_SECTION_IDS=['part_1_place','part_2_name','part_3_change','part_4_site','part_5_urban_space','part_6_present_change','part_7_meaning'] as const;
export const TOUR_SECTION_TITLES=['먼저 이곳에 서서 주변을 바라봅니다','지명에 숨겨진 역사','지역이 변화하기 시작하다','건물과 부지의 역사','주변 도시공간의 변화','현재 진행 중인 새로운 역사','마지막 정거장 — 장소가 남기는 의미'] as const;
const relation=z.enum(['exact_building','exact_parcel','historical_site','nearby','dong_context','district_context','mixed','unknown']);
const verification=z.enum(['reviewed_source_claim','official_register','source_metadata_only','candidate_only','not_checked']);
const source=z.object({id:z.string().min(1),title:z.string(),sourceUrl:z.string().nullable(),institution:z.string().nullable(),date:z.string().nullable(),dateType:z.enum(['event','publication','capture','approval','unknown']),mediaType:z.enum(['photo','video','article','document','building_register','map','scene','other']),relationScope:relation,verificationStatus:verification,usableAsVerifiedEvidence:z.boolean(),claimIds:z.array(z.string())});
export const DocentTourSectionSchema=z.object({id:z.enum(TOUR_SECTION_IDS),order:z.number().int().min(1).max(7),title:z.string().min(1),subtitle:z.string().min(1),purpose:z.string().min(1),narrationInstructions:z.string().min(1),evidenceIds:z.array(z.string()),claimIds:z.array(z.string()),photoIds:z.array(z.string()),videoIds:z.array(z.string()),sourceIds:z.array(z.string()),relationScope:relation,verificationStatus:z.enum(['supported','partial','missing']),missingEvidenceReason:z.string().nullable(),recommendedLength:z.object({min:z.number().int().nonnegative(),max:z.number().int().positive()})});
export const DocentTourV2Schema=z.object({version:z.literal('2.0'),placeName:z.string(),address:z.string(),district:z.string(),dong:z.string(),questionType:z.string(),centralQuestion:z.string(),opening:z.object({targetCharacters:z.object({min:z.literal(150),max:z.literal(200)}),instructions:z.string(),placeImageIds:z.array(z.string()),sourceIds:z.array(z.string())}),sections:z.array(DocentTourSectionSchema).length(7),sources:z.array(source),uncertainties:z.array(z.string()),provenance:z.object({provider:z.string(),returnedEvidenceIds:z.array(z.string()),returnedPhotoIds:z.array(z.string()),returnedVideoIds:z.array(z.string()),requestId:z.string().nullable(),semanticVerification:z.literal('not_checked'),operatorAiCalls:z.literal(0)})});
export type DocentTourV2=z.infer<typeof DocentTourV2Schema>;
export type DocentTourSection=z.infer<typeof DocentTourSectionSchema>;

export function validateDocentTourV2(value:unknown){
 const parsed=DocentTourV2Schema.safeParse(value);if(!parsed.success)return {valid:false,reasonCodes:['schema_invalid'],issues:parsed.error.issues.map(i=>({path:i.path.join('.'),code:i.code}))};
 const tour=parsed.data,sourceIds=new Set(tour.sources.map(s=>s.id)),photoIds=new Set(tour.provenance.returnedPhotoIds),videoIds=new Set(tour.provenance.returnedVideoIds),claimOwners=new Map(tour.sources.filter(s=>s.usableAsVerifiedEvidence).flatMap(s=>s.claimIds.map(id=>[id,s.id] as const)));
 const errors:string[]=[];
 if(tour.sections.some((s,i)=>s.id!==TOUR_SECTION_IDS[i]||s.order!==i+1))errors.push('section_order_invalid');
 if(tour.opening.sourceIds.some(id=>!sourceIds.has(id)))errors.push('unknown_source_id');if(tour.opening.placeImageIds.some(id=>!photoIds.has(id)))errors.push('unknown_photo_id');
 const allPhotoRefs=tour.sections.flatMap(s=>s.photoIds),allVideoRefs=tour.sections.flatMap(s=>s.videoIds);if(new Set(allPhotoRefs).size!==allPhotoRefs.length)errors.push('duplicate_photo_assignment');if(new Set(allVideoRefs).size!==allVideoRefs.length)errors.push('duplicate_video_assignment');
 for(const s of tour.sections){if(s.evidenceIds.some(id=>!sourceIds.has(id))||s.sourceIds.some(id=>!sourceIds.has(id)))errors.push('unknown_source_id');if(s.claimIds.some(id=>!claimOwners.has(id)||!s.evidenceIds.includes(claimOwners.get(id)!)))errors.push('unknown_or_unlinked_claim_id');if(s.photoIds.some(id=>!photoIds.has(id)))errors.push('unknown_photo_id');if(s.videoIds.some(id=>!videoIds.has(id)))errors.push('unknown_video_id');if(s.photoIds.length>8||s.videoIds.length>3)errors.push('media_limit_exceeded');if(s.recommendedLength.min>s.recommendedLength.max)errors.push('length_range_invalid');}
 if(tour.sources.length>100)errors.push('source_limit_exceeded');
 return {valid:errors.length===0,reasonCodes:[...new Set(errors)],issues:[] as {path:string;code:string}[]};
}
