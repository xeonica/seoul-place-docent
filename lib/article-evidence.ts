import {readArticleEvidenceAsset} from '@/lib/video-records-asset';
import type {Address} from './providers';
import {normalizePlaceText} from './evidence-place';
type Article={id:string;title:string;sourceInstitution:string|null;sourceUrl:string|null;publishedAt:string|null;eventDate:string|null;location:string;file:string|null;line:string|null;reviewStatus:string;rightsStatus:string};
const cache=new Map<string,Promise<Article[]>>();
export async function articleCandidates(address:Partial<Address>,query='',limit=6){
 const district=address.sggNm||'';if(!/^[가-힣]+구$/.test(district))return {status:'no_candidates',total:0,records:[]};
 let task=cache.get(district);
 if(!task){task=readArticleEvidenceAsset(district).then(async bytes=>new Response(new Blob([new Uint8Array(bytes)]).stream().pipeThrough(new DecompressionStream('gzip'))).json() as Promise<Article[]>);cache.set(district,task);while(cache.size>3)cache.delete(cache.keys().next().value!);task.catch(()=>cache.delete(district));}
 try{
 const rows=await task,terms=[address.emdNm,address.bdNm,...query.split(/\s+/)].filter((term):term is string=>!!term&&term.length>=2);
 const ranked=rows.map(row=>({row,score:terms.reduce((sum,term)=>sum+(normalizePlaceText(row.title+' '+row.location).includes(normalizePlaceText(term))?1:0),0)})).sort((a,b)=>b.score-a.score||a.row.id.localeCompare(b.row.id));
 return {status:rows.length?'pending_review_only':'no_candidates',total:rows.length,matchedCount:ranked.filter(row=>row.score>0).length,records:ranked.slice(0,Math.min(12,Math.max(1,limit))).map(({row})=>({...row,evidenceId:'candidate:article:'+row.id,mediaType:'article',relationType:'district_context',usableAsVerifiedEvidence:false,claims:[],provenance:{file:row.file,line:row.line}}))};
 }catch{return {status:'backend_unavailable',total:0,records:[]};}
}
