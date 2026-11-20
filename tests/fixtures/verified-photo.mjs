// Synthetic record/asset identifiers for deterministic tests, never real archive claims.
export function fixturePhoto(id='FIXTURE-RECORD',image='https://museum.seoul.go.kr/fixture-image.jpg'){
 const source='https://museum.seoul.go.kr/fixture-record/'+id;
 const proof={title:'모의 기록 '+id,date:'1978-10-30',provider:'서울역사박물관',sourceRecordId:id,mediaId:'FIXTURE-ASSET-'+id,sourcePageUrl:source,originalImageUrl:image,displayImageUrls:[image],license:'공공누리 제1유형',displayAllowed:true,basis:'provider_api',provenance:'fixture:synthetic-provider-response'};
 return {id,sourceUrl:source,previewUrl:image,provider:proof.provider,candidate:false,relation:'동네 배경 · 건물 미검증',recordType:'visual',scope:'dong',assetProof:proof,values:{자료명:proof.title,이용조건:proof.license,'촬영·제작일':proof.date}};
}
