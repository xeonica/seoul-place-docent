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
const documents=raw as unknown as DocumentBundle;
// Team-registered photos plus the pre-collected 서울기록원 index (scripts/harvest-seoul-archives.mjs → build-seoul-archives-photos.mjs).
const manual=[...manualPhotoItems(manualPhotos),...manualPhotoItems(archivePhotos,'seoul-archives'),...manualPhotoItems(museumPhotos,'seoul-museum'),...manualPhotoItems(seongbukPhotos,'seongbuk')];
/** Every record of the dong (for the MCP answer tool, which picks its own evidence). */
export function getFullDocentStory(district:string,dong:string){
 if(!district||!dong||district.length>20||dong.length>30||!documents.targets.some(t=>t.level==='법정동'&&t.district===district&&t.name===dong))throw new ServiceError('STORY_LOCATION','서울 주소를 먼저 선택해 주세요.',400);
 return buildDocentStory(photoResearchBundle,documents,district,dong,manual);
}
/** focus: names near the searched address (building name) whose records should be preferred in each year. */
export function getDocentStory(district:string,dong:string,focus:string[]=[]){
 if(!district||!dong||district.length>20||dong.length>30||!documents.targets.some(t=>t.level==='법정동'&&t.district===district&&t.name===dong))throw new ServiceError('STORY_LOCATION','서울 주소를 먼저 선택해 주세요.',400);
 const story=buildDocentStory(photoResearchBundle,documents,district,dong,manual);
 return {...story,scenes:composeByYear(story.scenes,focus)};
}
