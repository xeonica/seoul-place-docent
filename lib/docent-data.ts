import {publicPhotoItem} from './photo-verification';
import {heldDocentSource} from './docent-source-policy';
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
const storyCache=new Map<string,{expires:number;story:ReturnType<typeof buildDocentStory>}>();
export function clearDocentStoryCache(){storyCache.clear();}
function cachedStory(district:string,dong:string){
 const key=district+':'+dong,entry=storyCache.get(key);
 if(entry&&entry.expires>Date.now()){storyCache.delete(key);storyCache.set(key,entry);return entry.story;}
 const story=buildDocentStory(photoResearchBundle,documents,district,dong,manual);
 storyCache.set(key,{expires:Date.now()+30*60*1000,story});while(storyCache.size>24)storyCache.delete(storyCache.keys().next().value!);
 return story;
}
/** Every record of the dong (for the MCP answer tool, which picks its own evidence). */
export function getFullDocentStory(district:string,dong:string){
 if(!district||!dong||district.length>20||dong.length>30||!documents.targets.some(t=>t.level==='법정동'&&t.district===district&&t.name===dong))throw new ServiceError('STORY_LOCATION','서울 주소를 먼저 선택해 주세요.',400);
 const story=cachedStory(district,dong);return {...story,heldRecords:story.scenes.filter(s=>heldDocentSource(s.id)).map(s=>({id:s.id,title:s.title,...heldDocentSource(s.id)})),scenes:story.scenes.filter(s=>!heldDocentSource(s.id)).map(scene=>({...scene,photos:scene.photos.map(photo=>publicPhotoItem(photo,scene.id,scene.evidence[0]?.url||null))}))};
}
/** focus: names near the searched address (building name) whose records should be preferred in each year. */
export function getDocentStory(district:string,dong:string,focus:string[]=[]){
 if(!district||!dong||district.length>20||dong.length>30||!documents.targets.some(t=>t.level==='법정동'&&t.district===district&&t.name===dong))throw new ServiceError('STORY_LOCATION','서울 주소를 먼저 선택해 주세요.',400);
 const story=cachedStory(district,dong);
 return {...story,heldRecords:story.scenes.filter(s=>heldDocentSource(s.id)).map(s=>({id:s.id,title:s.title,...heldDocentSource(s.id)})),scenes:composeByYear(story.scenes.filter(s=>!heldDocentSource(s.id)),focus).map(scene=>({...scene,photos:scene.photos.map(photo=>publicPhotoItem(photo,scene.id,scene.evidence[0]?.url||null))}))};
}
