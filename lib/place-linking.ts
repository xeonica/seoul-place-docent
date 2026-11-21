export type PlaceRelation='exact_site'|'parcel'|'nearby'|'district_context'|'uncertain';
export type PlaceMatchInput={
 relationDeclared?:string;reviewStatus?:string;placeReviewStatus?:string;
 recordPlaceId?:string;placeId?:string;placeType?:string;recordBuildingManagementNumber?:string|null;placeBuildingManagementNumber?:string|null;
 recordPnu?:string|null;placePnu?:string|null;recordLatitude?:number|null;recordLongitude?:number|null;placeLatitude?:number|null;placeLongitude?:number|null;recordCoordinateSource?:string;placeCoordinateSource?:string;
 recordDistrict?:string;placeDistrict?:string;distanceThresholdMeters?:number;sourceUrl?:string;institution?:string;evidence?:string;
};
export type PlaceMatch={relation:PlaceRelation;declaredRelation:PlaceRelation|null;matchMethod:string;distanceMeters:number|null;reviewStatus:'pending'|'approved'|'rejected';approvable:boolean;reason:string};
const norm=(v:string|undefined|null)=>String(v||'').normalize('NFKC').replace(/\s+/g,'').toLocaleLowerCase();
const goodUrl=(v:string|undefined)=>{try{const u=new URL(v||'');return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password;}catch{return false;}};
function distance(aLat:number,aLon:number,bLat:number,bLon:number){const r=6371000,rad=Math.PI/180,dLat=(bLat-aLat)*rad,dLon=(bLon-aLon)*rad;const x=Math.sin(dLat/2)**2+Math.cos(aLat*rad)*Math.cos(bLat*rad)*Math.sin(dLon/2)**2;return 2*r*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));}
const validPoint=(lat:number|null|undefined,lon:number|null|undefined):lat is number=>Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat!)<=90&&Math.abs(lon!)<=180;

/** Classifies candidate links conservatively. Names and administrative areas never prove exact identity. */
export function classifyPlaceMatch(input:PlaceMatchInput):PlaceMatch{
 const explicit=String(input.relationDeclared||'').toLowerCase();
 const declared:PlaceRelation|null=['exact_site','parcel','nearby','district_context','uncertain'].includes(explicit)?explicit as PlaceRelation:null;
 const placeIdMatch=!!(input.recordPlaceId&&input.placeId&&input.recordPlaceId===input.placeId);
 const buildingMatch=!!(input.recordBuildingManagementNumber&&input.placeBuildingManagementNumber&&input.recordBuildingManagementNumber===input.placeBuildingManagementNumber);
 const parcelMatch=!!(input.recordPnu&&input.placePnu&&input.recordPnu===input.placePnu);
 const hasCoords=!!input.recordCoordinateSource?.trim()&&!!input.placeCoordinateSource?.trim()&&validPoint(input.recordLatitude,input.recordLongitude)&&validPoint(input.placeLatitude,input.placeLongitude);
 const meters=hasCoords?distance(input.recordLatitude!,input.recordLongitude!,input.placeLatitude!,input.placeLongitude!):null;
 const urlOk=goodUrl(input.sourceUrl), evidenceOk=!!input.evidence?.trim()&&input.evidence.trim().length>=12;
 const suitableIdentity=placeIdMatch||buildingMatch||parcelMatch&&input.placeType==='parcel';
 const strongIdentity=suitableIdentity&&input.placeReviewStatus==='verified'&&urlOk&&evidenceOk;
 const alreadyReviewed=input.reviewStatus==='approved';
 let relation:PlaceRelation,method:string,reason:string;
 if(strongIdentity){relation=parcelMatch&&input.placeType==='parcel'?'parcel':'exact_site';method=buildingMatch?'building_management_number':parcelMatch?'pnu':'place_id';reason='공식 검토된 장소 식별자와 자료 식별자가 일치합니다. 부지 식별은 parcel, 건물·장소 식별은 exact_site로 구분하며 링크 승인은 별도 검토 상태로 관리됩니다.';}
 else if(meters!==null&&meters<=(input.distanceThresholdMeters??1000)){relation='nearby';method='coordinate_distance';reason=`좌표 직선거리 ${Math.round(meters)}m의 주변 후보이며 직접 동일성을 뜻하지 않습니다.`;}
 else if(norm(input.recordDistrict)&&norm(input.recordDistrict)===norm(input.placeDistrict)){relation='district_context';method='district_only';reason='자치구만 일치해 지역 배경으로 분류했습니다.';}
 else {relation='uncertain';method='insufficient_identity';reason='공식 장소 식별 근거가 부족합니다.';}
 // Never promote an unreviewed CSV assertion. Approval is a human append-only act.
 const reviewStatus=input.reviewStatus==='approved'&&strongIdentity&&urlOk&&evidenceOk?'approved':input.reviewStatus==='rejected'?'rejected':'pending';
 if(alreadyReviewed&&reviewStatus!=='approved'&&reviewStatus!=='rejected')reason+=' 기존 승인 상태가 있어도 필수 근거가 충족되지 않아 보류합니다.';
 return {relation,declaredRelation:declared,matchMethod:method,distanceMeters:meters===null?null:Math.round(meters*10)/10,reviewStatus,approvable:strongIdentity&&(relation==='exact_site'||relation==='parcel'),reason};
}
