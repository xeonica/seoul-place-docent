import {filterVideoCatalog, videoCatalog, videoRelation} from './video-catalog';
import {relationLabels,type CatalogSegment} from './video-catalog-types';
import {loadVideoRecords} from './video-records';

export function verifiedVideoSegments(segments:CatalogSegment[],url:string|null){
 return segments.filter(s=>s.verifiedTime&&s.validTime&&s.start!==null&&s.end!==null&&Number.isFinite(s.start)&&Number.isFinite(s.end)&&s.start>=0&&s.end>s.start).map(s=>({start:s.start,end:s.end,place:s.place,description:s.description,sourceRef:s.ref,url:url?url+'&t='+s.start+'s':null}));
}
/** Reuse the archive ranking and provenance. Keep these separate from historical claims. */
export async function getDocentVideoCandidates(district: string, dong: string, options:{query?:string;placeName?:string;limit?:number;offset?:number}={}) {
 const limit=Math.min(12,Math.max(1,Math.floor(options.limit||3))),offset=Math.min(100,Math.max(0,Math.floor(options.offset||0)));
 const words=[options.placeName,...(options.query||'').split(/\s+/)].filter((word):word is string=>!!word&&word.length>=2);
 const score=(item:typeof videoCatalog.items[number])=>words.reduce((sum,word)=>sum+(item.title.includes(word)?10:item.description.includes(word)?3:0),0);
 const ranked=filterVideoCatalog(videoCatalog.items,{district,dong,place:true}).filter(item=>item.url&&item.reviewStatus!=='held'&&videoRelation(item,district,dong)!=='seoul_background').sort((a,b)=>score(b)-score(a));
 const candidates=ranked.slice(0,120).slice(offset,offset+limit);
 const records=await Promise.all(candidates.map(async item=>{
  const relation = videoRelation(item, district, dong)!;
  // A missing provenance asset does not prevent photo/history retrieval.
  const detail = await loadVideoRecords(item.id).catch(() => null);
  const segments = item.refs.flatMap(ref => {
   const record = detail?.records[ref];
   return (record?.segments ?? []).map(segment => ({
    startLabel: segment.startLabel,
    endLabel: segment.endLabel,
    place: segment.place,
    description: segment.description,
    sourceUrl: record?.sourceUrl || null,
    validTime: segment.validTime,
    verifiedTime: segment.verifiedTime,
   }));
  }).slice(0, 4);
  const verifiedSegments=verifiedVideoSegments(item.refs.flatMap(ref=>detail?.records[ref]?.segments||[]),item.videoId?item.url:null);
  return {
   verificationStatus:'metadata_only',usageMode:'candidate_link_only',contentVerified:false,
   id: item.id, title: item.title, url: item.url, provider: item.provider,
   historicalPeriods: item.historicalPeriods, relation, relationLabel: relationLabels[relation],
   independentlyVerified: item.independentlyVerified,
   segmentStatus: detail ? (segments.length ? 'available' : 'not_recorded') : 'unavailable',
   segments,verifiedSegments,
   playbackStatus:verifiedSegments.length?'verified_segments':'재생구간 미검증',
   buildingMatch:'unverified',date:item.date,dateType:item.dateType,duration:item.duration,
   sources:item.refs.flatMap(ref=>{const r=detail?.records[ref];return r?[{id:r.originalId,url:r.sourceUrl||null,filmedAt:r.filmedAt||null,producedAt:r.producedAt||null,publishedAt:r.publishedAt||null,rights:r.rights||'이용조건 원문 확인 필요'}]:[];}),
  };
 }));
 return {records,candidateCount:ranked.length,searchedCount:Math.min(120,ranked.length),returnedCount:records.length,nextOffset:offset+limit<Math.min(120,ranked.length)?offset+limit:null, note: '영상은 지역 관련 조사 후보입니다. 시간 표기는 원자료를 따르며, 촬영 장소·재생 가능 여부·이용조건은 영상 원문에서 확인하세요.'};
}
