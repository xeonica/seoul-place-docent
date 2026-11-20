import {env} from '@/lib/runtime-env';
import {getDocentStory} from '@/lib/docent-data';
import {narrateScenes} from '@/lib/docent-narration';
import {errorResponse,ServiceError} from '@/lib/providers';
const requests=new Map<string,number[]>();const LIMIT_PER_MINUTE=12;
export async function POST(request:Request){try{
 if(Number(request.headers.get('content-length')||0)>4096)throw new ServiceError('SIZE','요청이 너무 큽니다.',413);
 const raw=await request.text();if(raw.length>4096)throw new ServiceError('SIZE','요청이 너무 큽니다.',413);
 const body=JSON.parse(raw) as {district?:unknown;dong?:unknown;ids?:unknown};if(typeof body.district!=='string'||typeof body.dong!=='string'||!Array.isArray(body.ids)||!body.ids.length||body.ids.length>6||body.ids.some(id=>typeof id!=='string'||id.length>120))throw new ServiceError('NARRATION_REQUEST','장면은 한 번에 6개까지 선택할 수 있어요.',400);
 const ids=body.ids as string[];const story=getDocentStory(body.district,body.dong);const scenes=story.scenes.filter(s=>ids.includes(s.id));if(scenes.length!==new Set(ids).size)throw new ServiceError('NARRATION_SCENE','장면을 찾지 못했습니다.',400);
 const id=request.headers.get('oai-authenticated-user-id')??'private-service';
 // Only fresh OpenAI generations count; stored narrations are free.
 const beforeRequest=()=>{const now=Date.now();const times=(requests.get(id)??[]).filter(t=>now-t<60000);if(times.length>=LIMIT_PER_MINUTE)throw new ServiceError('NARRATION_RATE','도슨트 설명을 새로 만드는 요청이 많아요. 잠시 후 다시 시도해 주세요.',429);times.push(now);requests.set(id,times);};
 return Response.json({scenes:await narrateScenes(scenes,body.district,body.dong,env,{beforeRequest}),notice:'AI가 조사 자료를 바탕으로 풀어 쓴 설명입니다. 원문은 ‘자료 보기’에서 확인해 주세요.'},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return errorResponse(e);}}
