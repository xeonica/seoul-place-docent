import type {PhotoResearchItem} from './photo-research';
import type {StoryScene} from './docent-story';
/** Nearby historical photos from open-licensed sources with clear provenance. Fail-open; presentation only. */
export type PlacePhoto = {id:string;provider:string;title:string;year:number|null;date:string;description:string;imageUrl:string;fullUrl:string;sourceUrl:string;creator:string;license:string;licenseUrl:string|null;distance:number|null;match:'nearby'|'place'|'neighborhood';via?:string;scope?:'dong'|'district'};
export type PlacePhotoResult = {photos:PlacePhoto[];providers:{id:string;name:string;ok:boolean;count:number}[]};
const UA='SeoulPlaceDocent/1.0 (https://github.com/xeonica/seoul-place-docent)';
const COMMONS='https://commons.wikimedia.org/w/api.php';
// Only licences that allow redistribution with attribution (or public domain).
const LICENSE_OK=/^(?:cc[\s-]?by(?:[\s-]sa)?(?:[\s-]\d(?:\.\d)?)?(?:[\s-][a-z]{2,3})?|cc0(?:[\s-]1\.0)?|public domain|pd[\s-]|publicdomain|공공누리|kogl|attribution|no restrictions|copyrighted free use)/i;
const SEOUL={minX:126.7,maxX:127.3,minY:37.4,maxY:37.72};
export function inSeoul(x:number,y:number){return Number.isFinite(x)&&Number.isFinite(y)&&x>=SEOUL.minX&&x<=SEOUL.maxX&&y>=SEOUL.minY&&y<=SEOUL.maxY;}
export function stripHtml(v:unknown){return typeof v==='string'?v.replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#0?39;/g,"'").replace(/\s+/g,' ').trim():'';}
export function parseYear(text:string){const m=text.match(/(?<!\d)(1[89]\d{2}|20[0-2]\d)(?!\d)/);return m?Number(m[1]):null;}
type Meta=Record<string,{value?:unknown}|undefined>;
type Page={pageid?:number;title?:string;imageinfo?:{url?:string;thumburl?:string;descriptionurl?:string;mime?:string;extmetadata?:Meta}[]};
/** Convert one Commons imageinfo page into a photo, or null when rights/format are not clearly acceptable. */
export function commonsPhoto(page:Page,distance:number|null,match:PlacePhoto['match']):PlacePhoto|null{
  const info=page.imageinfo?.[0];if(!info||!page.title||page.pageid==null)return null;
  const meta=info.extmetadata||{};const license=stripHtml(meta.LicenseShortName?.value);
  if(!license||!LICENSE_OK.test(license))return null;
  if(String(meta.NonFree?.value||'').toLowerCase()==='true'||String(meta.Restrictions?.value||'').trim()&&/trademark|personality|insignia|nonfree/i.test(String(meta.Restrictions?.value)))return null;
  const full=info.url||'';const thumb=info.thumburl||full;
  if(!/^https:\/\/upload\.wikimedia\.org\//.test(thumb)||!/^image\/(?:jpeg|png|webp|gif|tiff)$/i.test(info.mime||''))return null;
  if(/\b(?:flag|logo|emblem|seal|icon|signature|coat of arms|banner)\b|국기|로고|휘장|어새|인장/i.test(page.title))return null;
  const description=stripHtml(meta.ImageDescription?.value);const dateText=stripHtml(meta.DateTimeOriginal?.value)||stripHtml(meta.DateTime?.value);
  const title=page.title.replace(/^File:/,'').replace(/\.[a-z0-9]+$/i,'').replace(/_/g,' ');
  // Upload/scan dates often stand in for the shooting date; a year written in the title is usually the real one.
  const years=[parseYear(dateText),parseYear(title)].filter((y):y is number=>y!==null);const year=years.length?Math.min(...years):parseYear(description);
  const rawCreator=stripHtml(meta.Artist?.value)||stripHtml(meta.Credit?.value);const creator=!rawCreator||/^(?:unknown|anonymous|author unknown|작자\s*미상|미상)/i.test(rawCreator)?'작성자 미상':rawCreator;
  return {id:'pp:commons:'+page.pageid,provider:'Wikimedia Commons',title,year,date:year!==null&&parseYear(dateText)===year&&dateText.length<40?dateText:year!==null?String(year):'시기 미상',description:description.slice(0,400),imageUrl:thumb,fullUrl:full||thumb,sourceUrl:info.descriptionurl||'https://commons.wikimedia.org/wiki/'+encodeURIComponent(page.title.replace(/ /g,'_')),creator:creator.slice(0,120),license,licenseUrl:/^https?:\/\//.test(stripHtml(meta.LicenseUrl?.value))?stripHtml(meta.LicenseUrl?.value):null,distance,match};
}
async function getJson(url:string,fetcher:typeof fetch,tries=3):Promise<unknown>{
  let last:unknown;
  for(let i=0;i<tries;i++){
    try{const r=await fetcher(url,{headers:{'User-Agent':UA,'Api-User-Agent':UA,Accept:'application/json'}});
      if(r.ok){const d=await r.json() as {error?:unknown};if(!d.error)return d;last=new Error('api error');}
      else if(r.status===429||r.status>=500)last=new Error('HTTP '+r.status);else throw new Error('HTTP '+r.status);
    }catch(e){last=e;}
    if(i<tries-1)await new Promise(res=>setTimeout(res,400*2**i));
  }
  throw last instanceof Error?last:new Error('request failed');
}
const IIPROPS={prop:'imageinfo',iiprop:'url|extmetadata|mime',iiurlwidth:'900',iiextmetadatafilter:'ImageDescription|DateTimeOriginal|DateTime|Artist|Credit|LicenseShortName|LicenseUrl|NonFree|Restrictions'};
async function commonsInfo(ids:number[],fetcher:typeof fetch,titles:string[]=[]){
  if(!ids.length&&!titles.length)return [] as Page[];
  const params=new URLSearchParams({action:'query',format:'json',formatversion:'2',...IIPROPS,...(ids.length?{pageids:ids.slice(0,50).join('|')}:{titles:titles.slice(0,50).join('|')}),origin:'*'});
  const d=await getJson(COMMONS+'?'+params,fetcher) as {query?:{pages?:Page[]}};return d.query?.pages||[];
}
export async function commonsNearby(x:number,y:number,fetcher:typeof fetch=fetch,radius=1000):Promise<PlacePhoto[]>{
  const g=new URLSearchParams({action:'query',format:'json',formatversion:'2',list:'geosearch',gscoord:`${y}|${x}`,gsradius:String(radius),gslimit:'40',gsnamespace:'6',origin:'*'});
  const d=await getJson(COMMONS+'?'+g,fetcher) as {query?:{geosearch?:{pageid:number;title:string;dist:number}[]}};
  const hits=d.query?.geosearch||[];const dist=new Map(hits.map(h=>[h.pageid,h.dist]));
  const pages=await commonsInfo(hits.map(h=>h.pageid),fetcher);
  return pages.map(p=>commonsPhoto(p,p.pageid!=null?dist.get(p.pageid)??null:null,'nearby')).filter((p):p is PlacePhoto=>!!p);
}
export async function commonsNeighborhood(district:string,dong:string,fetcher:typeof fetch=fetch):Promise<PlacePhoto[]>{
  const s=new URLSearchParams({action:'query',format:'json',formatversion:'2',list:'search',srsearch:`"${dong}" ${district} 서울`,srnamespace:'6',srlimit:'20',origin:'*'});
  const d=await getJson(COMMONS+'?'+s,fetcher) as {query?:{search?:{pageid:number}[]}};
  const pages=await commonsInfo((d.query?.search||[]).map(h=>h.pageid),fetcher);
  return pages.map(p=>commonsPhoto(p,null,'neighborhood')).filter((p):p is PlacePhoto=>!!p);
}
const MATCH_ORDER={nearby:0,place:1,neighborhood:2};
export function rankPhotos(photos:PlacePhoto[],limit=48){
  const seen=new Set<string>();const out:PlacePhoto[]=[];
  for(const p of photos){if(seen.has(p.id))continue;seen.add(p.id);out.push(p);}
  // Older dated photos first (the point is history), then other dated, then nearest.
  out.sort((a,b)=>((a.year!==null&&a.year<=2000?0:1)-(b.year!==null&&b.year<=2000?0:1))||(MATCH_ORDER[a.match]-MATCH_ORDER[b.match])||((a.year===null?1:0)-(b.year===null?1:0))||((a.distance??1e9)-(b.distance??1e9))||(a.year??0)-(b.year??0));
  return out.slice(0,limit);
}
const cache=new Map<string,{at:number;value:PlacePhotoResult}>();const TTL=6*3600e3;
export async function findPlacePhotos(x:number|null,y:number|null,district:string,dong:string,fetcher:typeof fetch=fetch,road=''):Promise<PlacePhotoResult>{
  const hasPoint=x!==null&&y!==null;
  const key=`${hasPoint?x.toFixed(4)+','+y.toFixed(4):'-'}:${district}:${dong}:${road}`;const hit=cache.get(key);if(hit&&Date.now()-hit.at<TTL)return hit.value;
  const named=[{id:'commons-name',name:'Wikimedia Commons · 동네 이름',run:()=>commonsNeighborhood(district,dong,fetcher)},{id:'commons-historic',name:'Wikimedia Commons · 옛 사진 검색',run:()=>commonsHistoric(district,dong,fetcher)}];
  const located=hasPoint?[{id:'commons-nearby',name:'Wikimedia Commons · 위치 태그',run:()=>commonsNearby(x,y,fetcher)},{id:'commons-categories',name:'Wikimedia Commons · 근처 장소 분류',run:()=>commonsPlaceCategories(x,y,fetcher)},{id:'wikipedia-nearby',name:'한국어 위키백과 · 근처 문서 대표 사진',run:()=>wikipediaNearby(x,y,fetcher)}]:[];
  const tasks=[...located,...named];
  const settled=await Promise.allSettled(tasks.map(t=>t.run()));
  const providers=settled.map((r,i)=>({id:tasks[i].id,name:tasks[i].name,ok:r.status==='fulfilled',count:r.status==='fulfilled'?r.value.length:0}));
  const photos=rankPhotos(settled.flatMap(r=>r.status==='fulfilled'?r.value:[]));
  const value={photos,providers};
  // Do not cache total failure (e.g. rate limiting) so the next visit retries.
  if(providers.some(p=>p.ok))cache.set(key,{at:Date.now(),value});
  return value;
}

/** Wrap a found photo as a story scene so it flows through the same card, timeline and credit UI. */
export function placePhotoScene(p:PlacePhoto,district:string,dong:string):StoryScene{
  const near=p.match==='nearby';const place=p.match==='place';
  const item:PhotoResearchItem={id:p.id,batchId:'place-photos',district,dong,dataRow:0,collectionScope:'dong',recordType:'visual',mediaType:'사진',correctionOf:null,correctionIds:[],sourceUrl:p.sourceUrl,sourceKey:p.id,sourceLinkType:'record',previewUrl:p.imageUrl,provider:p.provider,reviewStatus:'자동 수집',relation:p.provider==='서울기록원'?'기관 기록 검색':near?'근처 위치 태그':place?'근처 장소':'동네 이름 검색',scope:'동',candidate:false,conflictMentioned:false,sameSourceCount:1,samePreviewCount:1,
    values:{'자료명':p.title,'제공기관·채널':p.provider,'촬영자·제작자':p.creator,'필수출처표시문구':p.provider==='서울기록원'?`서울기록원 · ${p.creator}`:`${p.provider} · ${p.creator} · ${p.license}`,'이용조건':`${p.license}${p.licenseUrl?' ('+p.licenseUrl+')':''} — 이용 조건을 지켜 표시합니다.`,'내용설명':p.description,'촬영·제작일':p.date}};
  const archive=p.provider==='서울기록원';
  const where=archive?(p.scope==='district'?`${district} 전체를 다룬 서울기록원 기록이에요. 이 동네를 직접 찍은 사진은 아닐 수 있어요.`:`서울기록원 서울사진아카이브에서 ‘${p.via||dong}’(으)로 찾은 기록이에요.`):p.match==='neighborhood'&&p.year!==null&&!p.distance&&!near&&!place?`‘${dong}’·${district}과(와) 관련해 검색된 옛 사진이에요.`:place?`근처 장소 ‘${p.via||''}’와(과) 관련된 사진이에요.`:near?(p.distance!=null?`이 주소에서 약 ${Math.round(p.distance)}m 안에 위치가 표시된 사진이에요.`:'이 주소 근처에 위치가 표시된 사진이에요.'):`‘${dong}’이(가) 언급된 사진이에요.`;
  const text=[p.description,where,archive?'':'정확한 부지와 일치하는지는 검증되지 않았어요. 출처 페이지에서 확인해 주세요.'].filter(Boolean).join(' ');
  return {id:p.id,kind:'photo',date:p.date,year:p.year,order:p.year===null?Infinity:p.year*10000,title:p.title,text,scope:p.scope==='district'?'district':'dong',photos:[item],cutCount:1,evidence:[{title:p.title,url:p.sourceUrl,institution:p.provider,note:`${p.license} · ${p.creator}`}]};
}

// City- or district-wide categories say nothing about this particular place.
const BROAD_CATEGORY=/^(?:Keij[oō]|Seoul|Hanseong|Hanyang|Gyeongseong|Korea|South Korea|Joseon|Korean Empire|Government-General of Ch[oō]sen|[A-Z][a-z]+(?:-gu| District(?:, Seoul)?))$/i;
/** Files in categories whose coordinates are near the address (e.g. a market, palace, station or street category). */
export async function commonsPlaceCategories(x:number,y:number,fetcher:typeof fetch=fetch,radius=800):Promise<PlacePhoto[]>{
  const g=new URLSearchParams({action:'query',format:'json',formatversion:'2',list:'geosearch',gscoord:`${y}|${x}`,gsradius:String(radius),gslimit:'8',gsnamespace:'14',origin:'*'});
  const d=await getJson(COMMONS+'?'+g,fetcher) as {query?:{geosearch?:{title:string;dist:number}[]}};
  const cats=(d.query?.geosearch||[]).filter(c=>{const n=c.title.replace(/^Category:/,'');return !BROAD_CATEGORY.test(n)&&!/\b(?:rule|history|era|period|war|people|persons|events?|culture|politics|occupation|dynasty|empire|in \d{4}|\d{4}s)\b/i.test(n);}).slice(0,5);const out:PlacePhoto[]=[];
  const lists=await Promise.allSettled(cats.map(async c=>{
    const m=new URLSearchParams({action:'query',format:'json',formatversion:'2',list:'categorymembers',cmtitle:c.title,cmtype:'file',cmlimit:'25',origin:'*'});
    const r=await getJson(COMMONS+'?'+m,fetcher) as {query?:{categorymembers?:{pageid:number}[]}};
    const pages=await commonsInfo((r.query?.categorymembers||[]).map(f=>f.pageid),fetcher);
    const name=c.title.replace(/^Category:/,'');return pages.map((p):PlacePhoto|null=>{const ph=commonsPhoto(p,c.dist,'place');return ph?{...ph,via:name}:null;}).filter((p):p is PlacePhoto=>!!p);
  }));
  for(const l of lists)if(l.status==='fulfilled')out.push(...l.value);
  return out;
}
/** Lead photos of nearby Korean Wikipedia articles (landmarks, stations, markets) — files are re-checked against Commons licences. */
export async function wikipediaNearby(x:number,y:number,fetcher:typeof fetch=fetch,radius=800):Promise<PlacePhoto[]>{
  const g=new URLSearchParams({action:'query',format:'json',formatversion:'2',generator:'geosearch',ggscoord:`${y}|${x}`,ggsradius:String(radius),ggslimit:'12',prop:'pageimages|coordinates',piprop:'name',pilimit:'12',colimit:'12',origin:'*'});
  const d=await getJson('https://ko.wikipedia.org/w/api.php?'+g,fetcher) as {query?:{pages?:{title:string;pageimage?:string;coordinates?:{lat:number;lon:number}[]}[]}};
  const arts=(d.query?.pages||[]).filter(a=>a.pageimage);if(!arts.length)return [];
  const byFile=new Map(arts.map(a=>['File:'+a.pageimage!.replace(/_/g,' '),a]));
  const pages=await commonsInfo([],fetcher,[...byFile.keys()]);
  return pages.map((p):PlacePhoto|null=>{const a=p.title?byFile.get(p.title):undefined;const ph=commonsPhoto(p,null,'place');return ph&&a?{...ph,via:a.title}:null;}).filter((p):p is PlacePhoto=>!!p);
}

const EN:Record<string,string>={종로구:'Jongno',중구:'Jung',용산구:'Yongsan',성동구:'Seongdong',광진구:'Gwangjin',동대문구:'Dongdaemun',중랑구:'Jungnang',성북구:'Seongbuk',강북구:'Gangbuk',도봉구:'Dobong',노원구:'Nowon',은평구:'Eunpyeong',서대문구:'Seodaemun',마포구:'Mapo',양천구:'Yangcheon',강서구:'Gangseo',구로구:'Guro',금천구:'Geumcheon',영등포구:'Yeongdeungpo',동작구:'Dongjak',관악구:'Gwanak',서초구:'Seocho',강남구:'Gangnam',송파구:'Songpa',강동구:'Gangdong'};
/** Text search aimed at old pictures of the neighborhood / district (Korean and English captions). */
export async function commonsHistoric(district:string,dong:string,fetcher:typeof fetch=fetch):Promise<PlacePhoto[]>{
  const en=EN[district];const queries=[`${dong} ${district} 일제강점기 OR 1950년대 OR 1960년대 OR 1970년대 OR 옛 모습`,...(en?[`${en} Seoul historical photograph OR "old photograph"`]:[])];
  const ids:number[]=[];let failed=0;
  for(const q of queries){const s=new URLSearchParams({action:'query',format:'json',formatversion:'2',list:'search',srsearch:q,srnamespace:'6',srlimit:'20',origin:'*'});
    try{const d=await getJson(COMMONS+'?'+s,fetcher) as {query?:{search?:{pageid:number}[]}};ids.push(...(d.query?.search||[]).map(h=>h.pageid));}catch{failed++;/* other queries may still work */}}
  if(failed===queries.length)throw new Error('search failed');
  const pages=await commonsInfo([...new Set(ids)],fetcher);
  return pages.map(p=>commonsPhoto(p,null,'neighborhood')).filter((p):p is PlacePhoto=>!!p&&p.year!==null&&p.year<=2000&&new RegExp(`${dong}|${district}|${en||'$^'}|Seoul|Korea|서울|한국|경성|Keijo`,'i').test(p.title+' '+p.description));
}
