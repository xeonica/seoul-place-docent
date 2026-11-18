import {buildings, ServiceError, type Address, type Building, type Secrets} from './providers';

export type BuildingStatus='verified'|'not_found'|'key_missing'|'provider_error'|'timeout'|'parse_error'|'ambiguous'|'unverified';
export function buildingError(error:unknown):{status:BuildingStatus;errorCode:string}{
 const code=error instanceof ServiceError?error.code:'BUILDING_NETWORK';
 return {status:code==='KEY_MISSING'?'key_missing':code==='BUILDING_TIMEOUT'?'timeout':code==='BUILDING_FORMAT'?'parse_error':'provider_error',errorCode:code};
}
const nullable=(value:string|undefined)=>value===undefined||value===''?null:value;
export function buildingRecord(row:Building){return {
 id:'building_register:'+row.id,evidenceType:'building_register' as const,
 registerId:row.id,name:nullable(row.name),dong:nullable(row.dong),roadAddress:nullable(row.roadAddr),jibunAddress:nullable(row.lotAddr),
 approvalDate:nullable(row.approved),mainPurpose:nullable(row.use),structure:nullable(row.structure),
 groundFloors:nullable(row.above),undergroundFloors:nullable(row.below),households:nullable(row.households),buildingCount:nullable(row.buildingCount),
 totalFloorArea:nullable(row.area),landArea:nullable(row.landArea),buildingArea:nullable(row.buildingArea),permitDate:nullable(row.permitDate),startDate:nullable(row.startDate),contractor:null,
 };}
/** No cross-request cache: permission/key changes must never reuse another credential's result. */
export async function buildingInfo(address:Address,secrets:Secrets){
 const source='국토교통부 건축물대장',sourceUrl='https://www.data.go.kr/data/15134735/openapi.do';
 const attemptedAt=new Date().toISOString();
 try{
  const result=await buildings(address,secrets);
  const items=[...new Map(result.items.map(row=>[row.id,row])).values()];
  const candidates=result.parcelCandidates.map(buildingRecord);
  const compact=(value:string)=>value.normalize('NFKC').replace(/[\s()·-]/g,'').toLowerCase();
  const nameMismatch=!!address.bdNm&&items.some(row=>!!row.name&&compact(row.name)!==compact(address.bdNm));
  const status:BuildingStatus=result.truncated||items.length>1||candidates.length>0||nameMismatch?'ambiguous':items.length===1?'verified':result.total>0?'unverified':'not_found';
  // Recap is parcel/complex data; keep it separate and never sum with titles.
  const recap=await buildings(address,secrets,'getBrRecapTitleInfo').then(data=>({status:'available',records:[...data.items,...data.parcelCandidates].map(buildingRecord),queriedAt:data.queriedAt})).catch(error=>({...buildingError(error),records:[],queriedAt:null}));
  return {status,errorCode:null,configured:true,reachable:true,queriedAt:result.queriedAt,attemptedAt,source,sourceUrl,
   records:items.map(buildingRecord),candidates,recap,truncated:result.truncated,
   note:'도로명주소와 지번이 일치한 표제부입니다. 복수 대장은 개별 건물 후보이며 합산하지 않습니다. 사용승인일은 최초 건립일이 아닙니다.'};
 }catch(error){const diagnostic=buildingError(error);return {...diagnostic,configured:!!secrets.BUILDING_API_KEY,reachable:diagnostic.status==='key_missing'?null:!['BUILDING_TIMEOUT','BUILDING_NETWORK'].includes(diagnostic.errorCode),queriedAt:null,attemptedAt,source,sourceUrl,records:[],candidates:[],recap:null,truncated:false,note:'건축물 정보 조회 실패이며 건물 부재를 뜻하지 않습니다.'};}
}

/** Exact field checking only; this does not validate narrative meaning or history. */
export function validateBuildingClaims(claims:{evidenceId:string;field:string;value:string}[],info:Awaited<ReturnType<typeof buildingInfo>>){
 return claims.map(claim=>{
  const row=info.status==='verified'?info.records.find(row=>row.id===claim.evidenceId):undefined;
  const allowed=['approvalDate','mainPurpose','structure','groundFloors','undergroundFloors','households','buildingCount','totalFloorArea','landArea','buildingArea','permitDate','startDate'];
  const expected=row&&allowed.includes(claim.field)?(row as Record<string,unknown>)[claim.field]:null;
  return {...claim,valid:expected!==null&&expected!==undefined&&String(expected)===claim.value,verification:'exact_field_only',evidenceType:'building_register'};
 });
}
