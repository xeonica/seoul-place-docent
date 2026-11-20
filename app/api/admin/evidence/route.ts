import {env} from '@/lib/runtime-env';
import {database,readArchiveJson,requireArchiveAdmin} from '@/lib/archive-db';
import {errorResponse,verifyAddress,ServiceError} from '@/lib/providers';
import {evidenceReviewTarget,reviewEvidence} from '@/lib/reviewed-evidence';
import {prepareEvidence} from '@/lib/place-evidence';
const headers={'Cache-Control':'private, no-store'};
export async function GET(request:Request){try{
 requireArchiveAdmin(request,env);const db=database(env),params=new URL(request.url).searchParams;
 if(params.get('passageId')){
  const target=await evidenceReviewTarget(db,params.get('passageId')!);
  const reviews=await db.prepare('SELECT * FROM docent_evidence_reviews WHERE passage_id=? ORDER BY checked_at DESC LIMIT 50').bind(target.id).all();
  return Response.json({...target,reviews:reviews.results},{headers});
 }
 const token=params.get('token');if(!token)throw new ServiceError('EVIDENCE_TOKEN','주소 후보 token 또는 passageId가 필요합니다.',400);
 const address=await verifyAddress(token,env);
 const result=await prepareEvidence(request,db,address);
 const records=[...result.evidence.records,...result.evidence.candidates] as {sourceUrl?:string|null;mediaType:string;publishedAt?:string|null;videoVerificationStatus?:string|null}[];
 return Response.json({...result,reviewQueueDiagnostics:{missingSourceUrl:records.filter(r=>!r.sourceUrl).length,missingArticleDate:records.filter(r=>r.mediaType==='article'&&!r.publishedAt).length,unverifiedVideoSegments:records.filter(r=>r.mediaType==='video'&&r.videoVerificationStatus!=='segment_verified').length,sourceReachability:'not_checked',note:'개수는 반환된 표본 범위입니다. 원문 접속 실패 수는 실제 원문 검사 전에는 확정하지 않습니다.'}},{headers});
}catch(error){return errorResponse(error);}}
export async function POST(request:Request){try{
 const actor=requireArchiveAdmin(request,env),db=database(env);
 return Response.json(await reviewEvidence(db,await readArchiveJson(request,30000),actor),{headers});
}catch(error){return errorResponse(error);}}
