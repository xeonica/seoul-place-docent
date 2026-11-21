export type Secrets = { JUSO_API_KEY?: string; BUILDING_API_KEY?: string; KAKAO_REST_API_KEY?: string; MCP_MAP_ADDRESS_URL?:string };
export type Address = { roadAddr:string; jibunAddr:string; siNm:string; sggNm:string; emdNm:string; admCd:string; bdMgtSn:string; bdNm:string; lnbrMnnm:string; lnbrSlno:string; mtYn:string; zipNo:string };
export type Candidate = Address & {token:string};
export class ServiceError extends Error { constructor(public code:string, message:string,public status=502){super(message);} }
export const checkedFetch = async(url:URL|string,init:RequestInit={}) => {
 const response=await fetch(url,{...init,signal:AbortSignal.timeout(12000)});
 if(!response.ok) throw new ServiceError('UPSTREAM_HTTP','자료 제공기관과 연결되지 않았습니다. 잠시 후 다시 시도해 주세요.');
 return response;
};
export function normalizeAddress(x:Record<string,unknown>):Address {
 const text=(k:string)=>String(x[k]??'').trim();
 return {roadAddr:text('roadAddr'),jibunAddr:text('jibunAddr'),siNm:text('siNm'),sggNm:text('sggNm'),emdNm:text('emdNm'),admCd:text('admCd'),bdMgtSn:text('bdMgtSn'),bdNm:text('bdNm'),lnbrMnnm:text('lnbrMnnm'),lnbrSlno:text('lnbrSlno'),mtYn:text('mtYn'),zipNo:text('zipNo')};
}
export function assertSeoul(a:Address) {
 if(a.siNm!=='서울특별시'||!/^11\d{8}$/.test(a.admCd)) throw new ServiceError('OUTSIDE_SEOUL','현재 서울특별시 주소만 지원합니다.',400);
 if(!a.roadAddr||!a.jibunAddr||!/^\d{1,4}$/.test(a.lnbrMnnm)||!/^\d{0,4}$/.test(a.lnbrSlno)||!['0','1'].includes(a.mtYn)) throw new ServiceError('ADDRESS_INCOMPLETE','주소 식별정보를 확인할 수 없습니다. 다른 주소 후보를 선택해 주세요.',400);
}
export async function searchAddresses(q:string,page:number,secrets:Secrets) {
 if(q.length<2||q.length>100) throw new ServiceError('INVALID_QUERY','도로명과 건물번호 또는 지번주소를 2~100자로 입력해 주세요.',400);
 if(!Number.isInteger(page)||page<1||page>100) throw new ServiceError('INVALID_PAGE','페이지 값이 올바르지 않습니다.',400);
 if(!secrets.JUSO_API_KEY) throw new ServiceError('KEY_MISSING','주소 검색 연결을 준비 중입니다. 아래 동네 기록을 먼저 둘러보세요.',503);
 const url=new URL('https://business.juso.go.kr/addrlink/addrLinkApi.do');
 Object.entries({confmKey:secrets.JUSO_API_KEY,currentPage:String(page),countPerPage:'10',keyword:q,resultType:'json',addInfoYn:'Y'}).forEach(([k,v])=>url.searchParams.set(k,v));
 const body=await (await checkedFetch(url)).json() as {results?:{common?:{errorCode?:string;errorMessage?:string;totalCount?:string};juso?:Record<string,unknown>[]}};
 const result=body.results;
 if(result?.common?.errorCode!=='0') {
  const raw=String(result?.common?.errorCode??'UNKNOWN');
  const message = raw.startsWith('E000')?'주소 검색 인증 또는 서비스 이용 상태를 확인해야 합니다. 동네 기록은 계속 둘러볼 수 있습니다.':'주소를 조회하지 못했습니다. 도로명과 건물번호를 확인해 주세요.';
  throw new ServiceError('JUSO_'+raw,message);
 }
 const all=(result.juso??[]).map(normalizeAddress);
 const allowed=all.filter(a=>a.siNm==='서울특별시'&&/^11\d{8}$/.test(a.admCd));
 const candidates:Candidate[]=[];
 for(const a of allowed){try{assertSeoul(a);candidates.push({...a,token:await signAddress(a,secrets.JUSO_API_KEY)});}catch{ /* incomplete official responses are not selectable */ }}
 return {candidates,total:Number(result.common?.totalCount??0),page,nonSeoulCount:all.length-allowed.length,source:'주소기반산업지원서비스',queriedAt:new Date().toISOString()};
}
function b64(bytes:Uint8Array){return btoa(Array.from(bytes,b=>String.fromCharCode(b)).join('')).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');}
function unb64(s:string){if(!/^[\w-]+$/.test(s))throw new Error('base64');const p=s.replaceAll('-','+').replaceAll('_','/');return Uint8Array.from(atob(p+'='.repeat((4-p.length%4)%4)),c=>c.charCodeAt(0));}
async function key(secret:string){return crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
export async function signAddress(address:Address,secret:string){const payload=b64(new TextEncoder().encode(JSON.stringify({address,expires:Date.now()+30*60*1000})));const signature=await crypto.subtle.sign('HMAC',await key(secret),new TextEncoder().encode(payload));return payload+'.'+b64(new Uint8Array(signature));}
export async function verifyAddress(token:string,secrets:Secrets):Promise<Address>{
 if(!secrets.JUSO_API_KEY)throw new ServiceError('KEY_MISSING','주소 검색 연결을 준비 중입니다.',503);
 try {
  if(token.length>6000)throw new Error('size');const [payload,sig,extra]=token.split('.');if(!payload||!sig||extra)throw new Error('shape');
  if(!await crypto.subtle.verify('HMAC',await key(secrets.JUSO_API_KEY),unb64(sig),new TextEncoder().encode(payload)))throw new Error('signature');
  const data=JSON.parse(new TextDecoder().decode(unb64(payload)));
  if(typeof data.expires!=='number'||data.expires<Date.now()||data.expires>Date.now()+31*60*1000)throw new Error('expired');
  const a=normalizeAddress(data.address);assertSeoul(a);return a;
 }catch(e){if(e instanceof ServiceError)throw e;throw new ServiceError('INVALID_TOKEN','주소 선택이 만료되었거나 올바르지 않습니다. 다시 검색해 주세요.',400);}
}
export function parcelParams(a:Address) {assertSeoul(a);return {sigunguCd:a.admCd.slice(0,5),bjdongCd:a.admCd.slice(5),platGbCd:a.mtYn,bun:a.lnbrMnnm.padStart(4,'0'),ji:(a.lnbrSlno||'0').padStart(4,'0')};}
export type Building = { id:string; name:string; dong:string; use:string; structure:string; area:string; landArea:string; above:string; below:string; approved:string; created:string; roadAddr:string; lotAddr:string };
export type Floor = { buildingId:string; name:string; use:string; area:string; dong:string };
const str=(x:Record<string,unknown>,k:string)=>String(x[k]??'').trim();
export function normalizeRoad(address:string){return address.replace(/\([^)]*\)/g,' ').replace(/\s+/g,' ').trim();}
export function splitBuildingMatches(rows:Building[],a:Address){const road=normalizeRoad(a.roadAddr);return {items:rows.filter(b=>!!b.roadAddr&&normalizeRoad(b.roadAddr)===road),parcelCandidates:rows.filter(b=>!b.roadAddr||normalizeRoad(b.roadAddr)!==road)};}
export function parseBuildingJson(body:Record<string,any>,a:Address) {
 const response=body.response;
 if(!response||!['00','0'].includes(String(response.header?.resultCode))) throw new ServiceError('BUILDING_PROVIDER','건축물대장 조회에 실패했습니다. 인증·활용신청 상태 또는 제공기관 응답을 확인해야 합니다.');
 const raw=response.body?.items?.item;const rows:Record<string,unknown>[]=Array.isArray(raw)?raw:raw&&typeof raw==='object'?[raw]:[];
 const p=parcelParams(a);
 return rows.filter(x=>str(x,'sigunguCd')===p.sigunguCd&&str(x,'bjdongCd')===p.bjdongCd&&str(x,'bun').padStart(4,'0')===p.bun&&str(x,'ji').padStart(4,'0')===p.ji&&str(x,'platGbCd')===p.platGbCd).map(x=>({id:str(x,'mgmBldrgstPk'),name:str(x,'bldNm'),dong:str(x,'dongNm'),use:str(x,'mainPurpsCdNm'),structure:str(x,'strctCdNm'),area:str(x,'totArea'),landArea:str(x,'platArea'),above:str(x,'grndFlrCnt'),below:str(x,'ugrndFlrCnt'),approved:str(x,'useAprDay'),created:str(x,'crtnDay'),roadAddr:str(x,'newPlatPlc'),lotAddr:str(x,'platPlc')}));
}
async function fetchBuildingBody(a:Address,secrets:Secrets,op:string,page=1) {
 if(!secrets.BUILDING_API_KEY)throw new ServiceError('KEY_MISSING','건축물 정보 연결을 준비 중입니다.',503);
 const url=new URL(`https://apis.data.go.kr/1613000/BldRgstHubService/${op}`);
 Object.entries({...parcelParams(a),serviceKey:secrets.BUILDING_API_KEY,pageNo:String(page),numOfRows:'100',_type:'json'}).forEach(([k,v])=>url.searchParams.set(k,v));
 const response=await checkedFetch(url);const text=await response.text();
 try{return JSON.parse(text);}catch{throw new ServiceError('BUILDING_FORMAT','건축물대장 응답을 해석하지 못했습니다. 인증·활용신청 상태 또는 제공기관 응답을 확인해야 합니다.');}
}
export async function buildings(a:Address,secrets:Secrets){
 const rows:Building[]=[];let total=0;let page=1;
 do {const body=await fetchBuildingBody(a,secrets,'getBrTitleInfo',page);rows.push(...parseBuildingJson(body,a));total=Number(body.response.body?.totalCount??0);page++;}while((page-1)*100<total&&page<=5);
 return {...splitBuildingMatches(rows,a),total,truncated:total>500,sourceUrl:'https://www.data.go.kr/data/15134735/openapi.do',queriedAt:new Date().toISOString()};
}
export async function floors(a:Address,secrets:Secrets,buildingId:string){
 const available=await buildings(a,secrets);if(!available.items.some(b=>b.id===buildingId))throw new ServiceError('BUILDING_MISMATCH','선택한 대장이 이 지번과 일치하지 않습니다.',400);
 const output:Floor[]=[];let total=0;let page=1;
 do {const data=await fetchBuildingBody(a,secrets,'getBrFlrOulnInfo',page);if(!['00','0'].includes(String(data.response?.header?.resultCode)))throw new ServiceError('FLOOR_PROVIDER','층별 정보를 조회하지 못했습니다.');const raw=data.response.body?.items?.item;const rows:Record<string,unknown>[]=Array.isArray(raw)?raw:raw&&typeof raw==='object'?[raw]:[];
 for(const x of rows)if(str(x,'mgmBldrgstPk')===buildingId)output.push({buildingId,name:str(x,'flrNoNm'),use:str(x,'mainPurpsCdNm'),area:str(x,'area'),dong:str(x,'dongNm')});total=Number(data.response.body?.totalCount??0);page++;}while((page-1)*100<total&&page<=5);
 return {items:output,truncated:total>500,queriedAt:new Date().toISOString()};
}
export type CoordinateResult = {status:string;message?:string;x?:number;y?:number;administrativeDong?:string;queriedAt?:string;source?:string;sourceUrl?:string};
export function parseCoordinates(documents:Record<string,any>[],a:Address):CoordinateResult {
 const p=parcelParams(a);const road=(v:string)=>normalizeRoad(v).replace(/^서울 /,'서울특별시 ');
 const matches=documents.filter(d=>d.address?.region_1depth_name==='서울'&&String(d.address?.b_code)===a.admCd&&String(d.address?.main_address_no).padStart(4,'0')===p.bun&&String(d.address?.sub_address_no||'0').padStart(4,'0')===p.ji&&((d.address?.mountain_yn==='Y')?'1':'0')===a.mtYn&&typeof d.road_address?.address_name==='string'&&road(d.road_address.address_name)===road(a.roadAddr));
 if(matches.length!==1)return {status:'unconfirmed',message:'도로명주소와 지번이 함께 일치하는 좌표를 확인하지 못했습니다. 외부 지도에서 주소를 확인해 주세요.'};
 const d=matches[0];const x=Number(d.x),y=Number(d.y);
 if(!d.x||!d.y||!Number.isFinite(x)||!Number.isFinite(y)||x<126.7||x>127.3||y<37.4||y>37.8)return {status:'unconfirmed',message:'서울 주소에 해당하는 좌표를 확인하지 못했습니다.'};
 return {status:'verified',x,y,administrativeDong:typeof d.address.region_3depth_h_name==='string'?d.address.region_3depth_h_name:'',queriedAt:new Date().toISOString(),source:'카카오 로컬 API',sourceUrl:'https://developers.kakao.com/docs/ko/local/dev-guide'};
}
export async function coordinates(a:Address,secrets:Secrets):Promise<CoordinateResult>{
 assertSeoul(a);
 if(!secrets.KAKAO_REST_API_KEY)return {status:'not_configured',message:'좌표 조회는 연결 준비 중입니다. 외부 지도에서 주소를 확인할 수 있습니다.'};
 const url=new URL('https://dapi.kakao.com/v2/local/search/address.json');url.searchParams.set('query',normalizeRoad(a.roadAddr));url.searchParams.set('analyze_type','exact');
 const response=await fetch(url,{headers:{Authorization:`KakaoAK ${secrets.KAKAO_REST_API_KEY}`},signal:AbortSignal.timeout(12000)});
 if(response.status===401||response.status===403)throw new ServiceError('KAKAO_AUTH','카카오 로컬 API 인증 또는 카카오맵 사용 설정을 확인해야 합니다.');
 if(response.status===429)throw new ServiceError('KAKAO_QUOTA','카카오 API 이용 한도에 도달했습니다. 개발자 콘솔의 쿼터를 확인해 주세요.',429);
 if(!response.ok)throw new ServiceError('KAKAO_PROVIDER','카카오 좌표 조회에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.');
 const data=await response.json() as {documents?:Record<string,any>[]};
 return parseCoordinates(Array.isArray(data.documents)?data.documents:[],a);
}
export function errorResponse(e:unknown){const known=e instanceof ServiceError;return Response.json({error:{code:known?e.code:'CONNECTION_ERROR',message:known?e.message:'연결이 지연되거나 자료를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'}},{status:known?e.status:502,headers:{'Cache-Control':'no-store'}});}
