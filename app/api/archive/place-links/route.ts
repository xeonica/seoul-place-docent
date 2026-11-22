import {env} from '@/lib/runtime-env';
import {database,readArchiveJson,requireArchiveAdmin} from '@/lib/archive-db';
import {registerArchivePlace,recordArchiveSourcePlaceCandidate,reviewArchivePlaceIdentity,reviewArchiveSourcePlaceLink,type ArchivePlaceInput,type SourcePlaceCandidateInput} from '@/lib/archive-place-link';
import {errorResponse,ServiceError} from '@/lib/providers';

type Payload=Record<string,unknown>&{action?:string};

/** Admin-only, append-only entry point for place identities and evidence-link reviews. */
export async function POST(request:Request){
 try{
  const actor=requireArchiveAdmin(request,env),db=database(env),payload=await readArchiveJson(request) as Payload;
  if(!payload||typeof payload!=='object'||Array.isArray(payload))throw new ServiceError('ARCHIVE_PLACE_LINK_INPUT','요청 본문 형식을 확인해 주세요.',400);
  let result:Record<string,unknown>;
  switch(payload.action){
   case 'register_place':
    result=await registerArchivePlace(db,payload.place as ArchivePlaceInput,actor);break;
   case 'review_place_identity':
    result=await reviewArchivePlaceIdentity(db,payload.review as {id:string;placeId:string;status:'verified'|'rejected'|'needs_review';evidence:string},actor);break;
   case 'record_candidate':
    result=await recordArchiveSourcePlaceCandidate(db,payload.candidate as SourcePlaceCandidateInput,actor);break;
   case 'review_link':
    result=await reviewArchiveSourcePlaceLink(db,payload.review as {id:string;linkId:string;status:'approved'|'rejected'|'needs_review';relation:'exact_site'|'parcel'|'nearby'|'district_context'|'uncertain';originalChecked:boolean;rightsStatus:string;evidence:string},actor);break;
   default:throw new ServiceError('ARCHIVE_PLACE_LINK_ACTION','지원하지 않는 장소 연결 작업입니다.',400);
  }
  return Response.json(result,{status:payload.action==='register_place'||payload.action==='record_candidate'?201:200,headers:{'Cache-Control':'no-store'}});
 }catch(e){
  if(e instanceof Error&&e.message.startsWith('PLACE_')){
   const status=e.message.endsWith('_NOT_FOUND')?404:400;
   return Response.json({error:{code:e.message,message:status===404?'연결할 자료나 장소를 찾지 못했습니다.':'장소 연결 입력과 검토 근거를 확인해 주세요.'}},{status,headers:{'Cache-Control':'no-store'}});
  }
  return errorResponse(e);
 }
}
