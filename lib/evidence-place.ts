import type {Address} from './providers';
export const normalizePlaceText=(value?:string)=>String(value||'').normalize('NFKC').replace(/\([^)]*\)/g,'').replace(/^서울\s/,'서울특별시 ').replace(/\s+/g,'').toLowerCase();
export function evidencePlace(address:Partial<Address>){
 const pnu=address.admCd&&/^11\d{8}$/.test(address.admCd)&&/^[01]$/.test(address.mtYn||'')&&/^\d{1,4}$/.test(address.lnbrMnnm||'')&&/^\d{0,4}$/.test(address.lnbrSlno||'')?
  address.admCd+(address.mtYn==='1'?'2':'1')+address.lnbrMnnm!.padStart(4,'0')+(address.lnbrSlno||'0').padStart(4,'0'):null;
 const placeId=address.bdMgtSn?'juso-building:'+address.bdMgtSn:pnu?'pnu:'+pnu:null;
 return {placeId,buildingManagementNumber:address.bdMgtSn||null,pnu,roadAddress:address.roadAddr||null,jibunAddress:address.jibunAddr||null,placeName:address.bdNm||null,district:address.sggNm||null,legalDong:address.emdNm||null,administrativeDong:null,coordinates:null,
  keys:[placeId,pnu?'pnu:'+pnu:null,address.sggNm&&address.emdNm?'dong:'+address.sggNm+':'+address.emdNm:null,address.sggNm?'district:'+address.sggNm:null].filter((key):key is string=>!!key)};
}
export const relationTypes=['exact_building','exact_parcel','historical_site','nearby','dong_context','district_context','uncertain'] as const;
export type EvidenceRelation=typeof relationTypes[number];
export function normalizeRelation(value:string):EvidenceRelation{
 value=value.toLowerCase();
 return value==='exact_site'?'historical_site':relationTypes.includes(value as EvidenceRelation)?value as EvidenceRelation:'uncertain';
}
