import {buildings,ServiceError,type Address,type Secrets} from './providers';
import {closedBuildings,type PlaceContextSecrets} from './place-context';
import {DocentCache,credentialPartition} from './docent-runtime';
const currentCache=new DocentCache<Awaited<ReturnType<typeof buildings>>>(10*60*1000);
const closedCache=new DocentCache<Awaited<ReturnType<typeof closedBuildings>>>(10*60*1000);
async function section<T>(run:()=>Promise<{value:T;cache:'HIT'|'MISS'}>){
 const start=performance.now();try{const {value,cache}=await run();return {status:'ok' as const,data:value,cache,ms:Math.round(performance.now()-start)};}catch(error){return {status:'unavailable' as const,code:error instanceof ServiceError?error.code:'REGISTER_UNAVAILABLE',message:error instanceof ServiceError?error.message:'제공기관 응답을 확인하지 못했습니다.',ms:Math.round(performance.now()-start)};}
}
/** Match each register row independently. Never sum aggregate and block registers. */
export async function placeRegisterBundle(address:Address,env:Secrets&PlaceContextSecrets){
 const identity=[address.admCd,address.mtYn,address.lnbrMnnm,address.lnbrSlno,address.bdMgtSn,address.roadAddr].join(':');
 const [current,closed]=await Promise.all([
  section(async()=>currentCache.get(identity+':'+await credentialPartition(env.BUILDING_API_KEY||''),()=>buildings(address,env,{timeoutMs:7000}))),
  section(async()=>closedCache.get(identity+':'+await credentialPartition(env.CLOSED_BUILDING_API_KEY||''),()=>closedBuildings(address,env,{timeoutMs:7000}))),
 ]);
 const records=[
  ...(current.status==='ok'?current.data.items:[]).map(b=>({id:b.id,scope:'building',register:'건축물대장',name:b.name,address:b.roadAddr,use:b.use,structure:b.structure,totalFloorAreaM2:b.area,landAreaM2:b.landArea,aboveGroundFloors:b.above,belowGroundFloors:b.below,approved:b.approved,sourceUrl:current.status==='ok'?current.data.sourceUrl:'',households:b.households,units:b.units,permitDate:b.permitDate,constructionStartDate:b.constructionStartDate,registerKind:b.registerKind,dong:b.dong,acquisition:'official_building_api',dateMeaning:'사용승인일이며 최초 건립일이 아닙니다.'})),
  ...(closed.status==='ok'?closed.data.items:[]).map(b=>({id:b.id,scope:'parcel',register:'폐쇄말소대장',name:b.name,address:b.lotAddress,use:b.use,approved:b.approved,sourceUrl:closed.status==='ok'?closed.data.sourceUrl:'',acquisition:'official_closed_register_api',dateMeaning:'같은 필지의 과거 대장 후보이며 현재 건물과 동일하다는 뜻이 아닙니다.'})),
 ];
 return {records,sections:{current,closed},aggregation:'not_summed',historyStatus:'not_established_by_register',parcelCandidates:current.status==='ok'?current.data.parcelCandidates:[]};
}
