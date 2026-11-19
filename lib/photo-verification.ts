import type {PhotoResearchItem} from './photo-research';
import {isAllowedImageUrl} from './image-proxy';
export type PhotoAssetProof={title:string;date:string;provider:string;sourceRecordId:string;mediaId:string;sourcePageUrl:string;originalImageUrl:string;displayImageUrls:string[];license:string;displayAllowed:boolean;basis:'provider_api'|'source_page'|'provider_identifiers';provenance:string};
export type PhotoVerificationStatus='VERIFIED'|'SOURCE_ONLY'|'RELATED_ONLY'|'REJECTED';
export function sourcePageKey(raw:string|null|undefined){
 try{const url=new URL(raw||'');if(url.protocol!=='https:'||url.username||url.password)return null;url.hash='';url.searchParams.sort();return url.href;}catch{return null;}
}
/** A URL/filename/title similarity alone is never a record-to-asset proof. */
export function verifyPhotoAsset(item:PhotoResearchItem,evidenceId=item.id,expectedSourcePage?:string|null){
 const source=sourcePageKey(item.sourceUrl),proof=item.assetProof;
 const base={evidenceId,sourceRecordId:proof?.sourceRecordId||(source?new URL(source).pathname.match(/\/item\/(\d+)/)?.[1]||new URL(source).searchParams.get('fileId'):null),mediaId:proof?.mediaId||null,provider:proof?.provider||item.provider,title:proof?.title||item.values['자료명']||item.id,sourcePageUrl:source,originalImageUrl:null as string|null,displayImageUrl:null as string|null,date:proof?(proof.date||null):(item.values['촬영·제작일']||item.values['역사적대상시기']||null),license:item.values['이용조건']||null,locationRelation:item.relation,verificationStatus:'SOURCE_ONLY' as PhotoVerificationStatus,reason:'record_asset_link_unconfirmed',displayable:false,alternateUrls:[] as string[]};
 if(!source)return {...base,verificationStatus:'REJECTED' as const,reason:'source_missing'};
 if(expectedSourcePage===null||expectedSourcePage&&sourcePageKey(expectedSourcePage)!==source)return {...base,verificationStatus:'RELATED_ONLY' as const,reason:'different_record'};
 if(item.candidate)return {...base,reason:'research_candidate'};
 if(!proof)return base;
 const recordId=new URL(source).pathname.match(/\/item\/(\d+)/)?.[1]||new URL(source).searchParams.get('fileId');
 if(recordId&&recordId!==proof.sourceRecordId)return {...base,verificationStatus:'REJECTED' as const,reason:'source_record_id_mismatch'};
 if(sourcePageKey(proof.sourcePageUrl)!==source||!proof.sourceRecordId||!proof.mediaId||!proof.provenance||!['provider_api','source_page','provider_identifiers'].includes(proof.basis))return {...base,verificationStatus:'REJECTED' as const,reason:'proof_record_mismatch'};
 const denied=['사이트표시가능여부','썸네일표시가능여부'].some(key=>key in item.values&&!/^(가능|허용|공개|Y|yes|true)$/i.test(item.values[key].trim()));
 if(!proof.displayAllowed||!proof.license||denied)return {...base,verificationStatus:'REJECTED' as const,reason:'rights_unconfirmed_or_denied'};
 const supplied=item.previewUrl;
 if(!supplied||!proof.displayImageUrls.includes(supplied))return {...base,reason:'display_asset_not_bound'};
 if(!isAllowedImageUrl(supplied)||!isAllowedImageUrl(proof.originalImageUrl))return {...base,verificationStatus:'REJECTED' as const,reason:'image_host_denied'};
 // Only this proof's explicitly bound URLs can be delivery alternatives.
 const urls=[...new Set(proof.displayImageUrls)].filter(isAllowedImageUrl);
 return {...base,verificationStatus:'VERIFIED' as const,reason:'record_asset_bound',displayable:true,originalImageUrl:proof.originalImageUrl,displayImageUrl:supplied,license:proof.license,alternateUrls:urls.filter(url=>url!==supplied)};
}
/** Keep the record and text while withholding unauthorized display fields. */
export function publicPhotoItem(item:PhotoResearchItem,evidenceId=item.id,expectedSourcePage?:string|null){
 const verification=verifyPhotoAsset(item,evidenceId,expectedSourcePage);
 return {...item,previewUrl:verification.displayImageUrl,assetProof:verification.displayable?item.assetProof:undefined,imageVerification:verification};
}
