import {buildings, ServiceError, type Address, type Building, type Secrets as BuildingSecrets} from './providers';
import {closedBuildings, currentParcel, parcelNumber, type ClosedBuilding, type PlaceContextSecrets} from './place-context';

export type RegisterStatus='ready'|'key_missing'|'unauthorized'|'query_failed'|'no_records'|'identity_ambiguous'|'schema_mismatch';
export type RegisterDiagnostic={source:'current_building'|'closed_building'|'parcel';status:RegisterStatus;code?:string;message:string;recordCount:number;pages?:number;truncated?:boolean;sourceUrl:string};
export type RegisterRecord=Record<string,unknown>&{id:string;status:RegisterStatus;verified:boolean;candidateOnly?:boolean;recordType:string;relationType:string;scope:string;sourceUrl:string};
export type PlaceRegisterContext={records:RegisterRecord[];diagnostics:{current:RegisterDiagnostic;closed:RegisterDiagnostic;parcel:RegisterDiagnostic;records:RegisterRecord[];queriedAt:string}};

const CURRENT_SOURCE='https://www.data.go.kr/data/15134735/openapi.do';
const text=(value:unknown)=>typeof value==='string'?value.trim():'';
const normalized=(value:string)=>value.normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/[^가-힣a-z0-9]/g,'');

function errorDiagnostic(source:RegisterDiagnostic['source'],sourceUrl:string,error:unknown):RegisterDiagnostic{
  const known=error instanceof ServiceError,code=known?error.code:'UPSTREAM_UNKNOWN';
  let status:RegisterStatus='query_failed';
  if(code==='KEY_MISSING'||code==='CLOSED_KEY'||code==='PARCEL_KEY')status='key_missing';
  else if(code.includes('UNAUTHORIZED')||/^CLOSED_(20|30|31)$/.test(code)||(known&&(error.upstreamStatus===401||error.upstreamStatus===403)))status='unauthorized';
  else if(code.includes('SCHEMA')||code.includes('FORMAT'))status='schema_mismatch';
  return {source,status,code,message:known?error.message:'자료 제공기관에 연결하지 못했습니다.',recordCount:0,sourceUrl};
}

function currentRows(address:Address,result:Awaited<ReturnType<typeof buildings>>):{diagnostic:RegisterDiagnostic;records:RegisterRecord[]}{
  if(result.truncated)return {diagnostic:{source:'current_building',status:'identity_ambiguous',message:'건축물대장 페이지 조회가 상한에 도달해 유일성을 확인하지 못했습니다.',recordCount:result.items.length+result.parcelCandidates.length,pages:result.pages,truncated:true,sourceUrl:result.sourceUrl},records:[]};
  if(result.total===0)return {diagnostic:{source:'current_building',status:'no_records',message:'해당 지번의 현재 건축물대장 자료가 없습니다.',recordCount:0,pages:result.pages,truncated:false,sourceUrl:result.sourceUrl},records:[]};
  const addressName=normalized(address.bdNm),exact=result.items.filter(b=>b.id&&addressName&&normalized(b.name)===addressName);
  if(exact.length!==1){const candidates=[...result.items,...result.parcelCandidates].filter(b=>b.id).map(b=>({id:`building-register-candidate:${b.id}`,status:'identity_ambiguous' as const,verified:false,candidateOnly:true,recordType:'current_building_official_record',relationType:'unresolved',scope:'unknown',name:b.name,dongName:b.dong,ledgerPk:b.id,buildingManagementNumber:address.bdMgtSn||null,derivedPnu:parcelNumber(address),roadAddress:b.roadAddr,lotAddress:b.lotAddr,use:b.use,structure:b.structure,totalFloorAreaM2:b.area,landAreaM2:b.landArea,aboveGroundFloors:b.above,belowGroundFloors:b.below,permitDate:b.permitDate||null,startDate:b.startDate||null,useApprovalDate:b.approved||null,sourceUrl:result.sourceUrl,note:'같은 지번에서 반환된 공식 대장 후보입니다. 입력한 건물과의 식별이 유일하지 않아 현재 건물의 사실로 사용하지 마세요.'}));return {diagnostic:{source:'current_building',status:'identity_ambiguous',message:'같은 지번의 대장 행은 있으나 도로명·건물명·관리 PK를 함께 대조해 한 건물을 유일하게 식별하지 못했습니다.',recordCount:result.items.length+result.parcelCandidates.length,pages:result.pages,truncated:false,sourceUrl:result.sourceUrl},records:candidates};}
  const b=exact[0],pnu=parcelNumber(address);
  const record:RegisterRecord={id:`building-register:${b.id}`,status:'ready',verified:true,recordType:'current_building_official_record',relationType:'exact_building',scope:'building',register:'건축물대장 표제부',name:b.name,dongName:b.dong,ledgerPk:b.id,buildingManagementNumber:address.bdMgtSn||null,derivedPnu:pnu,roadAddress:b.roadAddr,lotAddress:b.lotAddr,use:b.use,structure:b.structure,totalFloorAreaM2:b.area,landAreaM2:b.landArea,aboveGroundFloors:b.above,belowGroundFloors:b.below,permitDate:b.permitDate||null,startDate:b.startDate||null,useApprovalDate:b.approved||null,approvalMeaning:'사용승인일이며 최초 건립일을 뜻하지 않습니다.',sourceUrl:result.sourceUrl};
  return {diagnostic:{source:'current_building',status:'ready',message:'공식 대장 PK, 현재 주소의 건물명 및 도로명주소가 유일하게 일치했습니다.',recordCount:1,pages:result.pages,truncated:false,sourceUrl:result.sourceUrl},records:[record]};
}

function closedRows(address:Address,result:Awaited<ReturnType<typeof closedBuildings>>):{diagnostic:RegisterDiagnostic;records:RegisterRecord[]}{
  const pnu=parcelNumber(address),records: RegisterRecord[]=result.items.map((b:ClosedBuilding)=>({id:`closed-building-register:${b.id}`,status:'identity_ambiguous',verified:false,candidateOnly:true,recordType:'historical_building_official_record',relationType:'unresolved',scope:'unknown',placeRelation:'same_parcel_historical_candidate',register:'폐쇄말소대장 표제부',name:b.name,lotAddress:b.lotAddress,roadAddress:b.roadAddress,ledgerPk:b.id,buildingManagementNumber:address.bdMgtSn||null,derivedPnu:pnu,use:b.use,useApprovalDate:b.approved||null,areaM2:b.area||null,aboveGroundFloors:b.above||null,belowGroundFloors:b.below||null,closureTypeCode:b.closureTypeCode||null,closureType:b.closureType||null,closedAt:b.closedAt||null,sourceUrl:result.sourceUrl,note:'현재 필지와 지번 식별정보가 일치한 과거 대장 후보입니다. 동일 건물·철거·이전 부지로 확인된 자료가 아닙니다.'}));
  const status:RegisterStatus=result.truncated?'identity_ambiguous':result.status==='no_records'?'no_records':'ready';
  return {diagnostic:{source:'closed_building',status,message:result.truncated?'페이지 조회 상한에 도달해 폐쇄말소 기록 전체를 확인하지 못했습니다.':result.total===0?'해당 지번의 폐쇄말소대장 조회에서 명시적인 0건 응답을 받았습니다.':'동일 지번 조건의 공식 폐쇄말소대장 자료를 반환했습니다. 개별 건물과 현재 장소의 연결은 별도 검증이 필요합니다.',recordCount:result.items.length,pages:result.pages,truncated:result.truncated,sourceUrl:result.sourceUrl},records};
}

export async function getPlaceRegisterContext(address:Address,env:BuildingSecrets&PlaceContextSecrets):Promise<PlaceRegisterContext>{
  const [currentResult,closedResult,parcelResult]=await Promise.allSettled([buildings(address,env),closedBuildings(address,env),currentParcel(address,env)]);
  let current:RegisterDiagnostic,closed:RegisterDiagnostic,parcel:RegisterDiagnostic;const records:RegisterRecord[]=[];
  if(currentResult.status==='fulfilled'){const parsed=currentRows(address,currentResult.value);current=parsed.diagnostic;records.push(...parsed.records);}else current=errorDiagnostic('current_building',CURRENT_SOURCE,currentResult.reason);
  if(closedResult.status==='fulfilled'){const parsed=closedRows(address,closedResult.value);closed=parsed.diagnostic;records.push(...parsed.records);}else closed=errorDiagnostic('closed_building','https://www.data.go.kr/data/15137093/openapi.do',closedResult.reason);
  if(parcelResult.status==='fulfilled')parcel={source:'parcel',status:'ready',message:'브이월드가 반환한 현재 필지 PNU를 공식 주소 PNU와 대조했습니다.',recordCount:1,sourceUrl:parcelResult.value.sourceUrl};
  else parcel=errorDiagnostic('parcel','https://www.vworld.kr/dev/v4dv_2ddataguide2_s002.do?svcIde=cadastral',parcelResult.reason);
  const verifiedRecords=records.filter(record=>record.verified);
  return {records:verifiedRecords,diagnostics:{current,closed,parcel,records,queriedAt:new Date().toISOString()}};
}

/** Backward-compatible projection for callers that only need verified current records. */
export async function placeRegisterRecords(address:Address,env:BuildingSecrets&PlaceContextSecrets){return (await getPlaceRegisterContext(address,env)).records;}
