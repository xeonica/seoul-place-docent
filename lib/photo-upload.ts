import {inspectPhotoGps} from './photo-gps';
import {mapAddress} from './map-address';
import {createMcpLimiter,originError} from './mcp-http';
import {errorResponse,ServiceError,type Secrets} from './providers';

// Below Vercel's function request limit; local-only parsing still allows 20 MiB.
export const MAX_PHOTO_UPLOAD_BYTES=4*1024*1024;
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const formats:Record<string,string>={'image/jpeg':'jpg','image/heic':'heic','image/heif':'heif','image/heic-sequence':'heic','image/heif-sequence':'heif','image/png':'png'};
async function readBoundedPhoto(request:Request){
 const length=request.headers.get('content-length');
 if(length!==null&&(!/^\d+$/.test(length)||Number(length)>MAX_PHOTO_UPLOAD_BYTES))throw new ServiceError('PHOTO_SIZE','서버 업로드는 4MiB 이하의 원본만 지원합니다. 기기 내 분석을 이용해 주세요.',413);
 if(!request.body)throw new ServiceError('PHOTO_EMPTY','사진 원본을 선택해 주세요.',400);
 const reader=request.body.getReader();let size=0;const chunks:Uint8Array[]=[];
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
  if(size>MAX_PHOTO_UPLOAD_BYTES){await reader.cancel();throw new ServiceError('PHOTO_SIZE','서버 업로드는 4MiB 이하의 원본만 지원합니다.',413);}chunks.push(value);
 }}finally{reader.releaseLock();}
 if(!size)throw new ServiceError('PHOTO_EMPTY','빈 사진 파일입니다.',400);
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes.buffer;
}
/** Image bytes stay in request memory only. No storage, filename, image logging, or model calls. */
export function createPhotoLocationHandler(){
 const allow=createMcpLimiter(12);let active=0;
 return async function(request:Request,secrets:Secrets,allowedOrigins:string[]=[]):Promise<Response>{
  const rejected=originError(request,allowedOrigins);if(rejected)return rejected;
  if(request.method!=='POST')return new Response(null,{status:405,headers:{...headers,Allow:'POST'}});
  if(request.headers.get('x-photo-consent')!=='ephemeral-exif')return Response.json({error:{code:'PHOTO_CONSENT',message:'원본 사진과 GPS를 서버에서 일시 처리하는 데 동의해 주세요.'}},{status:400,headers});
  const type=(request.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
  if(!formats[type])return Response.json({error:{code:'PHOTO_TYPE',message:'JPEG 또는 HEIC/HEIF 원본 파일을 전송해 주세요. multipart나 이미지 URL은 받지 않습니다.'}},{status:415,headers});
  if(!allow()||active>=2)return Response.json({error:{code:'PHOTO_RATE',message:'사진 처리가 많습니다. 잠시 후 다시 시도해 주세요.'}},{status:429,headers:{...headers,'Retry-After':'60'}});
  active++;
  try{
   const bytes=await readBoundedPhoto(request);
   const inspection=await inspectPhotoGps({name:'photo.'+formats[type],type,arrayBuffer:async()=>bytes});
   if(inspection.status!=='ok')return Response.json({inspection,status:'needs_location',nextAction:'주소·지도·현재 위치를 이용해 주세요.',retention:'not_stored'},{status:422,headers});
   const result=await mapAddress(inspection.point.x,inspection.point.y,secrets);
   return Response.json({inspection,result,status:result.candidates.length?'confirm_address':'confirm_neighborhood',needsConfirmation:true,retention:'not_stored',note:'GPS는 촬영 위치이며 사진 속 건물과 동일하다고 보장하지 않습니다. 주소를 확인한 뒤 기존 MCP 도구에 후보 token을 전달하세요.'},{headers});
  }catch(error){const response=errorResponse(error);for(const [k,v] of Object.entries(headers))response.headers.set(k,v);return response;}
  finally{active--;}
 };
}
export const handlePhotoLocation=createPhotoLocationHandler();
