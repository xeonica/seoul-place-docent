import {photoResearchThumbnail, photoResearchText, type PhotoResearchBundle, type PhotoResearchItem} from './photo-research';
import {documentContext, safeDocumentUrl, type DocumentBundle} from './document-research';
import {matchRegions, sources} from './history';
export type StoryEvidence = {title:string;url:string|null;institution:string;locator?:string;note?:string};
export type StoryScene = {id:string;kind:'photo'|'document';date:string;year:number|null;order:number;title:string;text:string;scope:'dong'|'district';photos:PhotoResearchItem[];cutCount:number;evidence:StoryEvidence[]};
export type DocentStory = {district:string;dong:string;scenes:StoryScene[];total:number;photoRecords:number;photoGroups:number;unpictured:number;version:string};
/** Presentation only: original claims and evidence IDs remain in the downloadable archive. */
export function readingText(value:string, maxSentences=3) {
  const clean=photoResearchText(value).replace(/\[(?:E\d{3,}(?:\s*[,·]\s*E\d{3,})*|원문 설명|관찰|추정|해석)\]/g,'').replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim();
  // Never truncate in the middle of a claim or drop qualifiers at the end of a sentence.
  const sentences=clean.match(/.*?(?:[.!?。！？](?=\s|$)|$)/g)?.filter(s=>s.trim())||[];
  return sentences.slice(0,maxSentences).map(s=>s.trim()).join(' ').trim();
}
export function historicalDate(values:Record<string,string>) {
  const historical=values['역사적대상시기']||'';
  const shot=values['촬영·제작일']||'';
  const raw=!historical||/^(미상|미확인|불명|알 수 없)/.test(historical.trim())?shot:historical;
  if(/^(미상|미확인|불명|알 수 없)/.test(raw.trim())||/기원전/.test(raw)) return {label:'시기 미상',year:null,order:Infinity};
  const match=raw.match(/(?<!\d)((?:1[0-9]|20)\d{2})(?!\d)/);
  if(!match)return {label:raw&&raw.length<60?raw:'시기 미상',year:null,order:Infinity};
  const year=Number(match[1]);
  const shotMatch=shot.match(/^(\d{4})[-.](\d{1,2})(?:[-.](\d{1,2}))?/);
  // A specific shooting date refines a single historical year, never a range or approximate date.
  const precise=shotMatch&&Number(shotMatch[1])===year&&/^\d{4}년?$/.test(historical.trim());
  const historicalParts=raw.match(/(?:1[0-9]|20)\d{2}(?:년\s*|[-.])(\d{1,2})(?:월\s*|[-.])?(\d{1,2})?/);
  const decadeOffset=/년대\s*(후반|말)/.test(raw)?7:/년대\s*(중반|중기)/.test(raw)?4:0;
  const parts=precise?shotMatch:historicalParts;
  const month=parts?Number(precise?parts[2]:parts[1]):0;
  const day=parts?Number((precise?parts[3]:parts[2])||0):0;
  const detail=month>=1&&month<=12&&day<=31?month*100+day:0;
  return {label:precise?`${year}년 ${Number(shotMatch[2])}월${shotMatch[3]?' '+Number(shotMatch[3])+'일':''}`:raw,year,order:(year+decadeOffset)*10000+detail};
}
function recordKey(item:PhotoResearchItem) {
  const explicit=item.values['중복대표자료ID'];
  if(explicit&&!/^(미|없|해당)/.test(explicit)) return 'id:'+explicit;
  if(item.sourceUrl&&item.sourceLinkType==='record'){
    try{const u=new URL(item.sourceUrl); const fid=u.searchParams.get('fileId');if(fid)return u.hostname+':'+fid;
      u.hash='';['utm_source','utm_medium','utm_campaign','fileSn','w','h'].forEach(k=>u.searchParams.delete(k));u.searchParams.sort();return 'source:'+u.href;}catch{}
  }
  return 'id:'+item.id;
}
export function groupStoryPhotos(items:PhotoResearchItem[]) {
  const groups=new Map<string,PhotoResearchItem[]>();
  for(const item of items){const key=recordKey(item);const rows=groups.get(key)||[];rows.push(item);groups.set(key,rows);}
  // A reused preview also denotes a duplicate, but shared collection URLs alone do not.
  const previewOwner=new Map<string,string>();
  for(const [key,rows] of groups){const image=rows[0].previewUrl;if(!image)continue;const previous=previewOwner.get(image);if(previous&&groups.has(previous)){groups.get(previous)!.push(...rows);groups.delete(key);}else previewOwner.set(image,key);}
  return [...groups.values()];
}
/** Research workflow notes (what the researcher did not verify) belong in "자료 보기", not in the visitor-facing story. */
const RESEARCH_NOTE=/이미지를 직접 보지|관찰 내용 없음|원문 (?:설명|정보)만 확인|미확인|확인되지 않았|(?:추가|별도) 확인(?:이)? 필요|확인이 필요|원문이 .{1,40}(?:으로|로) 분류한 (?:장면|경관)|원문 대상지|원문 촬영장소|원문에 없다|본 조사에서|대조해야 합니다|자료\.$/;
export function splitVisitorText(value:string){
  const tags=value.match(/\[[^\]]*(?:인용|작성|출처)[^\]]*\]/g)||[];value=value.replace(/\s*\[[^\]]*(?:인용|작성|출처)[^\]]*\]/g,'');
  const sentences=value.replace(/([.!?。])\s*\((?:\d{4}|\d{2})[\d.\s~·-]*\)/g,'$1 ').match(/.*?(?:[.!?。](?=\s|$)|$)/g)?.map(x=>x.trim()).filter(Boolean)||[];
  const keep:string[]=[],notes:string[]=[];
  for(const raw of sentences){const sentence=raw.replace(/^\(\d{4}[^)]*\)\s*/,'').replace(/^조사 소개는\s*/,'기록은 ');(RESEARCH_NOTE.test(sentence)?notes:keep).push(sentence);}
  return {text:keep.join(' ').replace(/\s+/g,' ').trim(),notes:[...notes,...tags.map(t=>t.slice(1,-1))]};
}
function visitorScene(scene:StoryScene):StoryScene{
  const {text:clean,notes}=splitVisitorText(scene.text);const text=readingText(clean,3);if(!notes.length)return {...scene,text};
  const note=notes.join(' ');
  return {...scene,text:text||(scene.kind==='photo'?'이 사진의 자세한 설명은 ‘자료 보기’의 원문에서 확인할 수 있어요.':'자세한 내용은 ‘자료 보기’의 원문에서 확인할 수 있어요.'),evidence:scene.evidence.map((e,i)=>i===0?{...e,note:[e.note,note].filter(Boolean).join(' ')}:e)};
}
const norm=(t:string)=>t.replace(/[^가-힣a-zA-Z0-9]/g,'').slice(0,60);
// The same subject across years ("2011 삼선동 선녀축제(3)", "2013 삼선동 선녀축제(1)") counts as one photo series.
const seriesKey=(t:string)=>t.replace(/\s*[\(\[]?\d+[\)\]]?\s*$/,'').replace(/(?:^|\s)(?:1[89]|20)\d{2}년?(?:대)?(?=\s|$)/g,' ').replace(/\s+/g,'');
/**
 * One scene per year, told as a docent story: the written record carries the explanation, a photo from the same
 * year supports it. Records mentioning a focus name (the searched building, e.g. 한성대학교) are chosen first.
 * The same photo (file or numbered series) and the same text never appear twice.
 */
export function composeByYear(scenes:StoryScene[],focus:string[]=[]):StoryScene[]{
  const terms=focus.map(f=>f.replace(/\s+/g,'')).filter(f=>f.length>=2).flatMap(f=>[f,f.replace(/(대학교|학교|초등학교|중학교|고등학교)$/,'')]).filter(f=>f.length>=2);
  const hit=(s:StoryScene)=>terms.length&&terms.some(t=>(s.title+s.text).replace(/\s+/g,'').includes(t))?1:0;
  const key=(s:StoryScene)=>s.year===null?'undated':s.date.includes('년대')&&!/\d{4}[-.년]\s*\d/.test(s.date)?Math.floor(s.year/10)*10+'s':String(s.year);
  const groups=new Map<string,StoryScene[]>();for(const s of scenes){const k=key(s);groups.set(k,[...(groups.get(k)||[]),s]);}
  const usedPhoto=new Set<string>(),usedText=new Set<string>(),out:StoryScene[]=[];let ceremonies=0;
  const photoKey=(s:StoryScene)=>[photoResearchThumbnail(s.photos[0])||s.photos[0]?.id||'',seriesKey(s.title)];
  // Street and neighborhood views explain an era better than official ceremonies or inspections.
  const view=(s:StoryScene)=>/전경|모습|일대|거리|골목|풍경|마을|한옥|시장|길|천|산|공원/.test(s.title)?1:0;
  const ceremony=(s:StoryScene)=>/시찰|순시|업무|발대식|교육|기공식|준공식|개관식|개장|시상|회의|방문|위촉|임명/.test(s.title)?1:0;
  const rank=(a:StoryScene,b:StoryScene)=>hit(b)-hit(a)||(ceremony(a)-ceremony(b))||(view(b)-view(a))||(a.scope==='dong'?0:1)-(b.scope==='dong'?0:1)||b.text.length-a.text.length;
  for(const [k,list] of [...groups].sort((a,b)=>a[0].localeCompare(b[0]))){
    if(k==='undated')continue;
    const docs=list.filter(s=>!s.photos.length&&!usedText.has(norm(s.text))).sort(rank);
    const pics=list.filter(s=>s.photos.length&&!photoKey(s).some(x=>x&&usedPhoto.has(x))).sort(rank);
    const story=docs[0],pic=pics[0];
    // Years with nothing but official ceremonies: keep only a couple, so the walk stays about the neighborhood.
    if(!story&&pic&&ceremony(pic)&&!hit(pic)){if(ceremonies>=2)continue;ceremonies++;}
    if(!story&&!pic)continue;
    const base=story||pic;const text=story?story.text:pic.text;if(usedText.has(norm(text)))continue;
    usedText.add(norm(text));if(pic){for(const x of photoKey(pic))if(x)usedPhoto.add(x);usedText.add(norm(pic.text));}
    const date=base.date.replace(/^(.+?)\s*[-~]\s*\1$/,'$1');
    out.push({...base,id:base.id,date,kind:pic?'photo':'document',title:story&&!(pic&&hit(pic)>hit(story))?story.title:pic.title,text:story&&pic&&hit(pic)>hit(story)?pic.text:text,photos:pic?pic.photos:[],cutCount:pic?pic.cutCount:0,evidence:[...(story?.evidence||[]),...(pic&&pic!==story?pic.evidence:[])],scope:(story?.scope==='dong'||pic?.scope==='dong')?'dong':'district'});
  }
  // Undated records only when nothing dated exists, and never repeating what is already shown.
  if(!out.length)for(const s of (groups.get('undated')||[]).sort(rank).slice(0,6))if(!usedText.has(norm(s.text))){usedText.add(norm(s.text));out.push(s);}
  return out.sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id));
}
export function buildDocentStory(photos:PhotoResearchBundle, documents:DocumentBundle, district:string,dong:string, manual:PhotoResearchItem[]=[]):DocentStory {
  const eligible=photos.items.filter(item=>item.recordType==='visual'&&!item.candidate&&!item.correctionOf&&!item.conflictMentioned);
  const localBatchIds=new Set(photos.meta.files.filter(f=>f.collectionScope==='dong'&&f.district===district&&f.dong===dong).map(f=>f.id));
  const local=eligible.filter(i=>localBatchIds.has(i.batchId)||i.regionLinks?.some(l=>l['자치구']===district&&l['법정동']===dong&&l['조사단계']==='법정동'));
  const districtBatchIds=new Set(photos.meta.files.filter(f=>f.collectionScope==='district'&&f.district===district).map(f=>f.id));
  const manualLocal=manual.filter(i=>i.district===district&&i.dong===dong);
  const manualDistrict=manual.filter(i=>i.district===district&&!i.dong);
  // Fall back to district photos when the neighborhood has records but none with a displayable image.
  const localRows=[...local,...manualLocal];const localPictured=localRows.filter(i=>photoResearchThumbnail(i));
  const scope=localPictured.length?'dong':'district';
  const rows=localPictured.length?localRows:[...eligible.filter(i=>districtBatchIds.has(i.batchId)),...manualDistrict];
  const pictured=rows.filter(i=>photoResearchThumbnail(i));
  const allGroups=groupStoryPhotos(pictured);
  // District background is context, not the story: keep at most 24 photos, spread evenly through time.
  const groups=scope==='district'&&allGroups.length>24?(()=>{const dated=[...allGroups].sort((a,b)=>historicalDate(a[0].values).order-historicalDate(b[0].values).order);const step=dated.length/24;return Array.from({length:24},(_,k)=>dated[Math.floor(k*step)]);})():allGroups;
  const scenes:StoryScene[]=groups.map(cuts=>{
    const item=cuts.find(i=>i.values['내용설명'])||cuts[0];const time=historicalDate(item.values);
    const unique=[...new Map(cuts.map(i=>[photoResearchThumbnail(i),i])).values()];
    return {id:item.id,kind:'photo',date:time.label,year:time.year,order:time.order,title:readingText(item.values['자료명']||item.id),text:readingText(item.values['사이트용캡션초안']||item.values['내용설명']||'이 시각자료의 내용은 제공기관 원문에서 확인할 수 있어요.',50),scope,photos:unique.slice(0,20),cutCount:cuts.length,evidence:cuts.slice(0,20).map(i=>({title:photoResearchText(i.values['자료명']||i.id),url:i.sourceUrl,institution:i.values['제공기관·채널']||i.provider,locator:i.values['페이지·도판번호'],note:i.metadataWarnings?.join(' · ')||i.values['주소관계근거']||i.relation}))};
  });
  const exact=documents.targets.filter(t=>t.district===district&&t.level==='법정동'&&t.name===dong);const ids=new Set(exact.map(t=>t.id));
  const timeline=documents.tables.timeline.filter(r=>r.targetIds.some(id=>ids.has(id))&&!r.issues.length&&!/상충 확인/.test(r.status));
  for(const row of timeline){const context=documentContext(documents,[row]);if(!context.sources.some(s=>s.url))continue;
    const time=historicalDate({'역사적대상시기':row.values['시기표기']||''});
    scenes.push({id:'doc:'+row.id,kind:'document',date:time.label,year:time.year,order:time.order,title:readingText(row.values['사건']),text:readingText(context.claims.map(c=>c.text).join(' '),50),scope:'dong',photos:[],cutCount:0,evidence:context.sources.map(s=>({title:s.title,url:s.url,institution:'문헌 원문',note:row.values['상충·주의사항']}))});
  }
  const usedClaims=new Set(timeline.flatMap(r=>r.evidenceIds));
  const claims=documents.tables.claims.filter(r=>r.targetIds.some(id=>ids.has(id))&&!usedClaims.has(r.id)&&!r.issues.length&&!/상충 확인/.test(r.status)).slice(0,30);
  for(const row of claims){const sourceRows=documents.tables.sources.filter(s=>row.sourceIds.includes(s.id));const evidence=sourceRows.map(s=>({title:s.values['자료명'],url:safeDocumentUrl(s.values['원문URL']),institution:s.values['제공기관·채널']||'문헌 원문',locator:row.values['원문위치'],note:row.values['근거유형']==='추정·해석'?'원문의 추정·해석이며 확정 사실과 구분해 읽어 주세요.':'동네 범위의 문헌 기록입니다.'})).filter(s=>s.url);if(!evidence.length)continue;
    const time=historicalDate({'역사적대상시기':row.values['시기표기']||''});
    scenes.push({id:'claim:'+row.id,kind:'document',date:time.label,year:time.year,order:time.order,title:readingText(row.values['주제']||row.label).replace(/^[①-⑳]\s*/,''),text:readingText(row.values['역사적주장']||'',50),scope:'dong',photos:[],cutCount:0,evidence});
  }
  for(const region of matchRegions(district,dong)){for(const [i,event] of region.events.entries()){
    if(scenes.some(s=>s.title===event.title))continue;
    scenes.push({id:region.id+':'+i,kind:'document',date:event.time,year:event.from,order:event.from*10000,title:event.title,text:readingText(event.text,50),scope:'dong',photos:[],cutCount:0,evidence:[{title:sources.find(s=>s.id===event.sourceId)?.title||region.name,url:safeDocumentUrl(region.url),institution:'서울역사박물관',note:region.matching==='area-candidate'?'역사적 권역의 설명입니다. 현재 법정동 전체의 포함 여부는 추가 확인이 필요합니다.':'동네 기록으로, 입력 건물·필지와의 일치는 미확인입니다.'}]});
  }}
  scenes.sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id));
  const visible=scenes.map(visitorScene);
  return {district,dong,scenes:visible,total:scenes.length,photoRecords:pictured.length,photoGroups:groups.length,unpictured:rows.length-pictured.length,version:'docent-20261106-2'};
}
