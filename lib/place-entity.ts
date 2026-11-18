import {searchAddresses,verifyAddress,parcelParams,type Address,type Secrets} from './providers';
export function placeEntity(address:Address){
 const parcel=parcelParams(address);
 const pnu=address.admCd+(address.mtYn==='1'?'2':'1')+parcel.bun+parcel.ji;
 return {placeId:address.bdMgtSn?'juso-building:'+address.bdMgtSn:'parcel:'+pnu,
  entityType:address.bdMgtSn?'address_building':'parcel',buildingName:address.bdNm||null,
  roadAddress:address.roadAddr,jibunAddress:address.jibunAddr,legalDong:address.emdNm,
  administrativeDong:null,parcelId:pnu,buildingManagementNumber:address.bdMgtSn||null,
  buildingRegisterId:null,apartmentComplexCode:null,
  matchStatus:'exact',matchEvidence:[{source:'주소기반산업지원서비스',basis:'서명된 공식 주소 응답의 건물관리번호 또는 법정동·산여부·지번',scope:address.bdMgtSn?'building':'parcel'}],
  limitations:['주소의 건물관리번호는 건축물대장 PK 및 K-apt 코드와 다릅니다. 동일 단지의 모든 동을 하나의 건물로 합치지 않습니다.']};
}
export async function resolvePlaceEntity(input:{query?:string;token?:string},secrets:Secrets){
 if(input.token){const address=await verifyAddress(input.token,secrets);return {...placeEntity(address),candidates:[],token:input.token};}
 const found=await searchAddresses(input.query!,1,secrets);
 // API total includes all pages; never resolve a seemingly unique first page.
 if(found.total!==1||found.candidates.length!==1)return {placeId:null,matchStatus:found.candidates.length?'ambiguous':'not_found',candidates:found.candidates,total:found.total,matchEvidence:[],limitations:['공식 주소 후보 선택이 필요합니다. 건물 이름만으로 장소를 추측하지 않습니다.']};
 const address=found.candidates[0];return {...placeEntity(address),candidates:[],token:address.token,queriedAt:found.queriedAt};
}
