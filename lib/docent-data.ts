import {photoResearchBundle} from './photo-research-data';
import raw from '../data/document-research/bundle.json';
import manualPhotos from '../data/manual-photos.json';
import archivePhotos from '../data/seoul-archives/photos.json';
import museumPhotos from '../data/seoul-museum/photos.json';
import seongbukPhotos from '../data/seongbuk-archive/photos.json';
import {manualPhotoItems} from './manual-photos';
import {buildDocentStory,composeByYear} from './docent-story';
import type {DocumentBundle} from './document-research';
import {ServiceError} from './providers';
import {photoResearchCredit,photoResearchThumbnail} from './photo-research';
import {imageProxyOrigin,toProxyUrl} from './image-proxy';
const documents=raw as unknown as DocumentBundle;
// Team-registered photos plus the pre-collected 서울기록원 index (scripts/harvest-seoul-archives.mjs → build-seoul-archives-photos.mjs).
const manual=[...manualPhotoItems(manualPhotos),...manualPhotoItems(archivePhotos,'seoul-archives'),...manualPhotoItems(museumPhotos,'seoul-museum'),...manualPhotoItems(seongbukPhotos,'seongbuk')];
/** Every record of the dong (for the MCP answer tool, which picks its own evidence). */
export function getFullDocentStory(district:string,dong:string){
 if(!district||!dong||district.length>20||dong.length>30||!documents.targets.some(t=>t.level==='법정동'&&t.district===district&&t.name===dong))throw new ServiceError('STORY_LOCATION','서울 주소를 먼저 선택해 주세요.',400);
 return buildDocentStory(photoResearchBundle,documents,district,dong,manual);
}
/** Exact, source-matched Seoul Museum illustrations used in the MaJang market timeline. */
export function getMaJangHistoricalPhotoHighlights(district:string,dong:string){
 if(district!=='성동구'||dong!=='마장동')return [];
 const selected=[
  {id:'seoul-museum-1178',fileId:'H-TRNS-54699-373',title:'숭인동 우시장의 모습(1956)',date:'1956',relationType:'historical_site',relationNote:'마장동으로 옮겨오기 전 종로구 숭인동 우시장을 보여 주는 사진입니다. 마장동이나 세림아파트 자체의 사진이 아닙니다.'},
  {id:'seoul-museum-1183',fileId:'H-TRNS-49281-379',title:'마장동 우시장 풍경(1962)',date:'1962',relationType:'dong_context',relationNote:'마장동 우시장에 관한 동네 역사 참고 사진입니다. 세림아파트 자체의 사진이나 직접 역사 근거로 확인된 자료는 아닙니다.'},
  {id:'SEOUL-GU-016-DONG-006-B001-P001',fileId:'H-TRNS-54700-373',title:'마장동 가축시장 풍경(1962.12.10)',date:'1962-12-10',relationType:'dong_context',relationNote:'마장동 가축시장에 관한 동네 역사 참고 사진입니다. 세림아파트 자체의 사진이나 직접 역사 근거로 확인된 자료는 아닙니다.'},
  {id:'seoul-museum-1188',fileId:'H-TRNS-80335-373',title:'서울의 축산물 공급 창구(1970년대 후반)',date:'1970년대 후반',relationType:'district_context',relationNote:'서울시 축산물 공급망의 배경 사진입니다. 마장동 전체의 풍경이나 세림아파트 자체 사진으로 확인된 자료는 아닙니다.'},
 ] as const;
 return selected.flatMap(spec=>{
  const record=manual.find(item=>{try{return new URL(item.sourceUrl||'').searchParams.get('fileId')===spec.fileId&&item.values['자료명']===spec.title;}catch{return false;}});
  if(!record||record.values['사이트표시가능여부']!=='가능'||record.values['썸네일표시가능여부']!=='가능')return [];
  const original=photoResearchThumbnail(record);if(!original)return [];
  const sourceUrl=record.sourceUrl;if(!sourceUrl)return [];
  const imageUrl=toProxyUrl(imageProxyOrigin(),original),credit=photoResearchCredit(record),license=record.values['이용조건']||'';
  const caption=[spec.date,spec.title,credit].filter(Boolean).join(' · ');
  return [{evidenceId:spec.id,mediaId:spec.fileId,sourceRecordId:spec.fileId,title:spec.title,date:spec.date,scope:spec.relationType==='dong_context'?'dong':spec.relationType==='historical_site'?'nearby':'district',relationType:spec.relationType,relationNote:spec.relationNote,imageUrl,alternateUrls:[original],sourceUrl,credit,terms:license,license,verificationStatus:'source_metadata_only',previewPurpose:'illustration_only',formalEvidenceApproval:'unchanged',caption,imageMarkdown:`![${spec.title}](<${imageUrl}>)`,relatedEvidenceIds:[]}];
 });
}
/** focus: names near the searched address (building name) whose records should be preferred in each year. */
export function getDocentStory(district:string,dong:string,focus:string[]=[]){
 if(!district||!dong||district.length>20||dong.length>30||!documents.targets.some(t=>t.level==='법정동'&&t.district===district&&t.name===dong))throw new ServiceError('STORY_LOCATION','서울 주소를 먼저 선택해 주세요.',400);
 const story=buildDocentStory(photoResearchBundle,documents,district,dong,manual);
 return {...story,scenes:composeByYear(story.scenes,focus)};
}
