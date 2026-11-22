import {canonicalUrl} from './archive-validation';
import {classifyPlaceMatch,type PlaceRelation} from './place-linking';

export type ArchivePlaceInput={id:string;placeId:string;placeType:'building'|'parcel'|'historic_site'|'dong'|'district';name:string;roadAddress?:string;jibunAddress?:string;district?:string;legalDong?:string;buildingManagementNumber?:string|null;pnu?:string|null;latitude?:number|null;longitude?:number|null;coordinateSource?:string;identitySourceUrl?:string};
const trim=(value:unknown,max:number,required=false)=>{if(typeof value!=='string')throw new Error('PLACE_FIELD_INVALID');const out=value.trim();if((required&&!out)||out.length>max)throw new Error('PLACE_FIELD_INVALID');return out;};
const opt=(value:unknown,max:number)=>value==null||value===''?null:trim(value,max,true);
const validUrl=(value:string)=>{try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password;}catch{return false;}};
const stamp=()=>new Date().toISOString();

/** Append a place identity. This intentionally has no update/upsert path. */
export async function registerArchivePlace(db:D1Database,input:ArchivePlaceInput,actor:string){
 const id=trim(input.id,120,true),placeId=trim(input.placeId,180,true),name=trim(input.name,240,true),actorName=trim(actor,200,true),placeType=input.placeType;
 if(!['building','parcel','historic_site','dong','district'].includes(placeType))throw new Error('PLACE_TYPE_INVALID');
 const bmgt=opt(input.buildingManagementNumber,40),pnu=opt(input.pnu,30),lat=input.latitude??null,lon=input.longitude??null;
 if((lat===null)!==(lon===null)||lat!==null&&(!Number.isFinite(lat)||Math.abs(lat)>90)||lon!==null&&(!Number.isFinite(lon)||Math.abs(lon)>180)||lat===0&&lon===0)throw new Error('PLACE_COORDINATE_INVALID');
 const sourceUrl=trim(input.identitySourceUrl||'',2048),status='pending';
 if(sourceUrl&&!validUrl(sourceUrl))throw new Error('PLACE_IDENTITY_SOURCE_INVALID');
 const createdAt=stamp();
 await db.prepare('INSERT INTO archive_places (id,place_id,place_type,name,road_address,jibun_address,district,legal_dong,building_management_number,pnu,latitude,longitude,coordinate_source,identity_source_url,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
  .bind(id,placeId,placeType,name,trim(input.roadAddress||'',300),trim(input.jibunAddress||'',300),trim(input.district||'',100),trim(input.legalDong||'',100),bmgt,pnu,lat,lon,trim(input.coordinateSource||'',200),sourceUrl,actorName,createdAt).run();
 return {id,placeId,identityReviewStatus:status,createdAt,actor:actorName};
}

export type SourcePlaceCandidateInput={id:string;sourceId:string;placeId:string;declaredRelation?:PlaceRelation;matchEvidence:string;evidenceId:string;sourcePlaceId?:string;sourceBuildingManagementNumber?:string|null;sourcePnu?:string|null;sourceLatitude?:number|null;sourceLongitude?:number|null;sourceCoordinateSource?:string;sourceDistrict?:string;distanceThresholdMeters?:number};
/** Store a candidate as an immutable observation; even strong matches start pending. */
export async function recordArchiveSourcePlaceCandidate(db:D1Database,input:SourcePlaceCandidateInput,actor:string){
 const id=trim(input.id,120,true),sourceId=trim(input.sourceId,180,true),placeId=trim(input.placeId,180,true),evidence=trim(input.matchEvidence,2000,true),evidenceId=trim(input.evidenceId,200,true),actorName=trim(actor,200,true);
 if(evidence.length<12)throw new Error('PLACE_LINK_EVIDENCE_REQUIRED');
 const [source,place]=await Promise.all([db.prepare('SELECT id,url,institution,rights,review_status FROM archive_sources WHERE id=?').bind(sourceId).first<Record<string,unknown>>(),db.prepare(`SELECT p.place_id,p.place_type,p.building_management_number,p.pnu,p.latitude,p.longitude,p.coordinate_source,p.district,(SELECT r.status FROM archive_place_reviews r WHERE r.place_id=p.place_id ORDER BY r.revision DESC LIMIT 1) AS identity_review_status FROM archive_places p WHERE p.place_id=?`).bind(placeId).first<Record<string,unknown>>()]);
 if(!source)throw new Error('PLACE_LINK_SOURCE_NOT_FOUND');if(!place)throw new Error('PLACE_LINK_PLACE_NOT_FOUND');
 const sourceUrl=String(source.url||'');if(!validUrl(sourceUrl))throw new Error('PLACE_LINK_SOURCE_URL_INVALID');
 const classification=classifyPlaceMatch({relationDeclared:input.declaredRelation,reviewStatus:'pending',placeReviewStatus:String(place.identity_review_status||'pending'),
  recordPlaceId:input.sourcePlaceId,placeId:place.place_id as string,placeType:String(place.place_type||''),recordBuildingManagementNumber:input.sourceBuildingManagementNumber,placeBuildingManagementNumber:place.building_management_number as string|null,
  recordPnu:input.sourcePnu,placePnu:place.pnu as string|null,recordLatitude:input.sourceLatitude,recordLongitude:input.sourceLongitude,recordCoordinateSource:input.sourceCoordinateSource,placeLatitude:place.latitude as number|null,placeLongitude:place.longitude as number|null,placeCoordinateSource:String(place.coordinate_source||''),
  recordDistrict:input.sourceDistrict,placeDistrict:String(place.district||''),distanceThresholdMeters:input.distanceThresholdMeters,sourceUrl,institution:String(source.institution||''),evidence});
 const createdAt=stamp();
 await db.prepare('INSERT INTO archive_source_places (id,source_id,place_id,relation,match_method,distance_meters,evidence_id,evidence,source_url,source_institution,original_checked,rights_status,review_status,review_evidence,actor,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
  .bind(id,sourceId,placeId,classification.relation,classification.matchMethod,classification.distanceMeters,evidenceId,evidence,sourceUrl,String(source.institution||''),0,String(source.rights||'unknown'),'pending','',actorName,createdAt).run();
 return {id,sourceId,placeId,...classification,sourceUrl,sourceInstitution:String(source.institution||''),originalChecked:false,rightsStatus:String(source.rights||'unknown'),createdAt};
}

export async function reviewArchiveSourcePlaceLink(db:D1Database,input:{id:string;linkId:string;status:'approved'|'rejected'|'needs_review';relation:PlaceRelation;originalChecked:boolean;rightsStatus:string;evidence:string},actor:string){
 const id=trim(input.id,120,true),linkId=trim(input.linkId,120,true),evidence=trim(input.evidence,2000,true),actorName=trim(actor,200,true);
 if(!['approved','rejected','needs_review'].includes(input.status))throw new Error('PLACE_LINK_REVIEW_STATUS_INVALID');
 if(!['exact_site','parcel','nearby','district_context','uncertain'].includes(input.relation))throw new Error('PLACE_LINK_RELATION_INVALID');
 if(typeof input.originalChecked!=='boolean')throw new Error('PLACE_LINK_ORIGINAL_CHECK_INVALID');
 if(evidence.length<12)throw new Error('PLACE_LINK_REVIEW_EVIDENCE_REQUIRED');
 const link=await db.prepare(`SELECT l.id,l.relation,l.match_method,l.source_url,(SELECT r.status FROM archive_place_reviews r WHERE r.place_id=p.place_id ORDER BY r.revision DESC LIMIT 1) AS identity_review_status FROM archive_source_places l JOIN archive_places p ON p.place_id=l.place_id WHERE l.id=?`).bind(linkId).first<Record<string,unknown>>();
 if(!link)throw new Error('PLACE_LINK_NOT_FOUND');
 if(input.status==='approved'&&input.relation==='exact_site'&&(!(link.relation==='exact_site')||!['place_id','building_management_number'].includes(String(link.match_method))||link.identity_review_status!=='verified'||!input.originalChecked))throw new Error('EXACT_SITE_APPROVAL_REQUIRES_VERIFIED_IDENTITY_AND_ORIGINAL');
 if(input.status==='approved'&&input.relation==='parcel'&&(!(link.relation==='parcel')||link.match_method!=='pnu'||link.identity_review_status!=='verified'||!input.originalChecked))throw new Error('PARCEL_APPROVAL_REQUIRES_VERIFIED_PNU_AND_ORIGINAL');
 const next=await db.prepare('SELECT coalesce(max(revision),0)+1 AS revision FROM archive_source_place_reviews WHERE link_id=?').bind(linkId).first<{revision:number}>();
 const revision=Number(next?.revision||1),checkedAt=stamp();
 await db.prepare('INSERT INTO archive_source_place_reviews (id,link_id,revision,status,relation,original_checked,rights_status,evidence,actor,checked_at) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(id,linkId,revision,input.status,input.relation,input.originalChecked?1:0,trim(input.rightsStatus,80,true),evidence,actorName,checkedAt).run();
 return {id,linkId,revision,status:input.status,relation:input.relation,originalChecked:input.originalChecked,rightsStatus:input.rightsStatus,checkedAt};
}

export async function reviewArchivePlaceIdentity(db:D1Database,input:{id:string;placeId:string;status:'verified'|'rejected'|'needs_review';evidence:string},actor:string){
 const id=trim(input.id,120,true),placeId=trim(input.placeId,180,true),evidence=trim(input.evidence,2000,true),actorName=trim(actor,200,true);
 if(!['verified','rejected','needs_review'].includes(input.status))throw new Error('PLACE_IDENTITY_REVIEW_STATUS_INVALID');
 if(evidence.length<12)throw new Error('PLACE_IDENTITY_REVIEW_EVIDENCE_REQUIRED');
 const place=await db.prepare('SELECT place_id,place_type,building_management_number,pnu,identity_source_url FROM archive_places WHERE place_id=?').bind(placeId).first<Record<string,unknown>>();if(!place)throw new Error('PLACE_LINK_PLACE_NOT_FOUND');
 const sourceUrl=String(place.identity_source_url||'');if(!validUrl(sourceUrl))throw new Error('PLACE_IDENTITY_SOURCE_REQUIRED');
 if(input.status==='verified'&&(place.place_type==='building'&&!place.building_management_number||place.place_type==='parcel'&&!place.pnu))throw new Error('PLACE_OFFICIAL_ID_REQUIRED');
 const next=await db.prepare('SELECT coalesce(max(revision),0)+1 AS revision FROM archive_place_reviews WHERE place_id=?').bind(placeId).first<{revision:number}>();
 const revision=Number(next?.revision||1),checkedAt=stamp();
 await db.prepare('INSERT INTO archive_place_reviews (id,place_id,revision,status,source_url,evidence,actor,checked_at) VALUES (?,?,?,?,?,?,?,?)').bind(id,placeId,revision,input.status,sourceUrl,evidence,actorName,checkedAt).run();
 return {id,placeId,revision,status:input.status,sourceUrl,checkedAt};
}
