import {photoResearchBundle} from './photo-research-data';
import raw from '../data/document-research/bundle.json';
import manualPhotos from '../data/manual-photos.json';
import archivePhotos from '../data/seoul-archives/photos.json';
import museumPhotos from '../data/seoul-museum/photos.json';
import seongbukPhotos from '../data/seongbuk-archive/photos.json';
import adminDongMap from '../data/seoul-administrative-dongs.json';
import {manualPhotoItems} from './manual-photos';
import {buildDocentStory,composeByYear} from './docent-story';
import type {DocumentBundle} from './document-research';
import {ServiceError} from './providers';
import {photoResearchCredit,photoResearchImageCandidates,photoResearchThumbnail,type PhotoResearchItem} from './photo-research';
import {imageProxyOrigin,toProxyUrl} from './image-proxy';
const documents=raw as unknown as DocumentBundle;
// Team-registered photos plus the pre-collected 서울기록원 index (scripts/harvest-seoul-archives.mjs → build-seoul-archives-photos.mjs).
const manual=[...manualPhotoItems(manualPhotos),...manualPhotoItems(archivePhotos,'seoul-archives'),...manualPhotoItems(museumPhotos,'seoul-museum'),...manualPhotoItems(seongbukPhotos,'seongbuk')];
/** Every record of the dong (for the MCP answer tool, which picks its own evidence). */
export function getFullDocentStory(district:string,dong:string){
 if(!district||!dong||district.length>20||dong.length>30||!documents.targets.some(t=>t.level==='법정동'&&t.district===district&&t.name===dong))throw new ServiceError('STORY_LOCATION','서울 주소를 먼저 선택해 주세요.',400);
 return buildDocentStory(photoResearchBundle,documents,district,dong,manual);
}
const PHOTO_LIMIT=8;
const fileId=(item:PhotoResearchItem)=>{try{return new URL(item.sourceUrl||'').searchParams.get('fileId')||undefined;}catch{return undefined;}};
const dateFor=(item:PhotoResearchItem)=>item.values['촬영·제작일']||item.values['역사적대상시기']||'시기 미상';
const displayAllowed=(item:PhotoResearchItem)=>!!item.sourceUrl&&photoResearchImageCandidates(item).length>0;
const itemLegalDongs=(item:PhotoResearchItem)=>new Set([item.dong,...(item.regionLinks||[]).filter(link=>link['조사단계']==='법정동').map(link=>link['법정동'])].filter(Boolean));
/** Search every collected, rights-cleared image index for the requested legal dong, then widen to district context. */
export function getRegionalHistoricalPhotoPreviews(district:string,dong:string,limit=PHOTO_LIMIT){
 if(!district||!dong||district.length>20||dong.length>30)return [];
 const safeLimit=Math.max(0,Math.min(PHOTO_LIMIT,Math.floor(limit)));
 if(!safeLimit)return [];
 const bundlePhotos=photoResearchBundle.items.filter(item=>item.recordType==='visual'&&!item.candidate&&!item.correctionOf&&!item.conflictMentioned&&displayAllowed(item));
 const all=[...bundlePhotos,...manual].filter(displayAllowed);
 const exact=all.filter(item=>item.district===district&&itemLegalDongs(item).has(dong));
 const districtMap=(adminDongMap.districts as {name:string;mappings:{administrativeDong:string;legalDongs:string[]}[]}[]).find(item=>item.name===district);
 const adminMapping=districtMap?.mappings.find(item=>item.administrativeDong===dong);
 const mappedLegalDongs=new Set(adminMapping?.legalDongs||[]);
 const administrative=exact.length?[]:all.filter(item=>item.district===district&&[...itemLegalDongs(item)].some(name=>mappedLegalDongs.has(name)));
 // Keep the returned scope honest: indexed-in-dong photos are contextual illustrations, never building evidence.
 const local=(exact.length?exact:administrative).map(item=>({item,scope:'dong' as const}));
 const selected=local.length?local:all.filter(item=>item.district===district).map(item=>({item,scope:'district' as const}));
 const ranked=selected.sort((a,b)=>{
  const mentions=(item:PhotoResearchItem)=>Number([dong,...mappedLegalDongs].some(term=>(item.values['자료명']+' '+item.values['내용설명']).includes(term)));
  return mentions(b.item)-mentions(a.item)||String(dateFor(a.item)).localeCompare(String(dateFor(b.item)))||a.item.id.localeCompare(b.item.id);
 });
 const seen=new Set<string>();
 return ranked.flatMap(({item,scope})=>{
  const original=photoResearchThumbnail(item),sourceUrl=item.sourceUrl;
  if(!original||!sourceUrl||seen.has(original))return [];
  seen.add(original);
  const id=fileId(item)||item.id, title=item.values['자료명']||item.id, date=dateFor(item);
  const imageUrl=toProxyUrl(imageProxyOrigin(),original),credit=photoResearchCredit(item),license=item.values['이용조건']||'';
  const indexedDong=item.dong;
  const relationNote=scope==='dong'
   ? `${district} ${dong}${adminMapping&&!exact.length?` 행정동 관할 법정동(${item.dong})`:''} 색인에서 찾은 참고 사진입니다. 입력한 건물·필지의 직접 사진이나 승인된 직접 역사 근거는 아닙니다. 원문에서 촬영 장소를 확인해 주세요.`
   : `${district} 배경 참고 사진입니다${indexedDong?`(자료 색인 위치: ${indexedDong})`:''}. ${dong}이나 입력한 건물·필지의 직접 사진 또는 직접 역사 근거가 아닙니다.`;
  const caption=[date,title,credit].filter(Boolean).join(' · ');
  return [{evidenceId:item.id,mediaId:id,sourceRecordId:id,title,date,scope,relationType:scope==='dong'?'dong_context':'district_context',relationNote,imageUrl,alternateUrls:[original],sourceUrl,credit,terms:license,license,verificationStatus:'source_metadata_only',previewPurpose:'illustration_only',formalEvidenceApproval:'unchanged',caption,relatedEvidenceIds:[]}];
 }).slice(0,safeLimit);
}
/** Backwards-compatible name for callers from the PR #81 implementation. */
export const getMaJangHistoricalPhotoHighlights=getRegionalHistoricalPhotoPreviews;
/** focus: names near the searched address (building name) whose records should be preferred in each year. */
export function getDocentStory(district:string,dong:string,focus:string[]=[]){
 if(!district||!dong||district.length>20||dong.length>30||!documents.targets.some(t=>t.level==='법정동'&&t.district===district&&t.name===dong))throw new ServiceError('STORY_LOCATION','서울 주소를 먼저 선택해 주세요.',400);
 const story=buildDocentStory(photoResearchBundle,documents,district,dong,manual);
 return {...story,scenes:composeByYear(story.scenes,focus)};
}
