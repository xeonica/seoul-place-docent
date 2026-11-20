import {coordinates,ServiceError,type Address,type CoordinateResult,type Secrets} from './providers';
export function verifiedMapPoint(point?:CoordinateResult){
 return point?.status==='verified'&&Number.isFinite(point.x)&&Number.isFinite(point.y)&&point.x!>=126.7&&point.x!<=127.3&&point.y!>=37.4&&point.y!<=37.8;
}
export function placeMapView(address:string,point?:CoordinateResult,code?:string){
 const verified=verifiedMapPoint(point)&&point?.source==='카카오 로컬 API';
 const searchUrl='https://map.kakao.com/link/search/'+encodeURIComponent(address);
 return {address,status:verified?'ready':point?.status||'unavailable',coordinateSystem:'WGS84',latitude:verified?point!.y!:null,longitude:verified?point!.x!:null,verificationStatus:verified?'address_and_parcel_verified':'not_verified',source:verified?point?.source||null:null,sourceUrl:verified?point?.sourceUrl||null:null,queriedAt:point?.queriedAt||null,errorCode:code||null,
  externalUrl:verified?'https://map.kakao.com/link/map/'+encodeURIComponent(address)+','+point!.y+','+point!.x:searchUrl,addressSearchUrl:searchUrl,message:verified?'공식 주소·지번과 대조한 위치입니다. 피사체·역사 장소의 동일성 증명은 아닙니다.':point?.message||'확인된 좌표가 없습니다. 외부 지도에서 주소로 검색해 주세요.',rendering:'external_link',nativeChatgptMapControlled:false};
}
export async function resolvePlaceMap(address:Address,secrets:Secrets){
 try{return placeMapView(address.roadAddr||address.jibunAddr,await coordinates(address,secrets,{timeoutMs:3500}));}
 catch(error){return placeMapView(address.roadAddr||address.jibunAddr,{status:'unavailable',message:error instanceof ServiceError?error.message:'좌표 제공기관에 연결하지 못했습니다. 외부 지도에서 주소를 확인해 주세요.'},error instanceof ServiceError?error.code:'COORDINATE_UNAVAILABLE');}
}
