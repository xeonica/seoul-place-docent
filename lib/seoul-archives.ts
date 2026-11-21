/** 서울기록원 서울사진아카이브 (archives.seoul.go.kr/photo). Public pages; only items marked 공개 + 이용유형 제한없음 are shown. */
import type {PlacePhoto} from './place-photos';
export const SEOUL_ARCHIVES='https://archives.seoul.go.kr';
const UA='SeoulPlaceDocent/1.0 (https://github.com/xeonica/seoul-place-docent)';
const decode=(v:string)=>v.replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#0?39;/g,"'").replace(/\s+/g,' ').trim();
export type ArchiveCard={id:string;title:string;thumb:string};
export function parseArchiveList(html:string):{cards:ArchiveCard[];total:number}{
  const cards:ArchiveCard[]=[];const seen=new Set<string>();
  for(const m of html.matchAll(/<a href="\/item\/(\d+)">\s*<div class="thumb">\s*<img src="(https:\/\/archives-files\.seoul\.go\.kr\/[^"]+)" alt="([^"]*)"/g)){if(seen.has(m[1]))continue;seen.add(m[1]);cards.push({id:m[1],thumb:m[2],title:decode(m[3])});}
  const total=Number(html.match(/result-cnt">\s*총\s*<strong>([\d,]+)<\/strong>/)?.[1]?.replace(/,/g,'')||cards.length);
  return {cards,total};
}
function field(html:string,label:string){const m=html.match(new RegExp(`<div class="leftH">${label}</div>\\s*<div class="rightH[^"]*">([\\s\\S]*?)</div>\\s*(?:</div>|</li>)`));return m?decode(m[1]):'';}
export type ArchiveItem={id:string;title:string;date:string;year:number|null;description:string;creator:string;access:string;use:string;useNote:string;keywords:string;places:string[];image:string|null};
export function parseArchiveItem(id:string,html:string):ArchiveItem{
  const title=decode(html.match(/<meta property="og:title" content="([^"]*?)(?: \| 서울기록원)?"/)?.[1]||'');
  const dateRaw=field(html,'일자');const date=dateRaw.match(/\d{4}(?:-\d{2}(?:-\d{2})?)?/)?.[0]||'';
  const places=[...html.matchAll(/\[GEOL-\d+\]\s*([^<]+)</g)].map(m=>decode(m[1]).replace(/^,\s*/,'')).filter(Boolean);
  const image=html.match(/src="(https:\/\/archives-files\.seoul\.go\.kr\/[^"]+\/2000_[^"]+)"/)?.[1]||null;
  return {id,title,date,year:date?Number(date.slice(0,4)):null,description:field(html,'기술'),creator:field(html,'생산자').replace(/,\s*\(\d{4}~(?:\d{4})?\)\s*$/,''),access:field(html,'접근유형'),use:field(html,'이용유형'),useNote:field(html,'이용주기'),keywords:field(html,'공통주기').replace(/^키워드\s*:\s*/,''),places,image};
}
/** Only clearly open items: public access and no use restriction. */
export function archiveUsable(item:ArchiveItem){return item.access==='공개'&&item.use==='제한없음'&&!!item.title;}
export function archivePhoto(item:ArchiveItem,card:ArchiveCard,query:string,scope:'dong'|'district'='dong'):PlacePhoto{
  return {scope,id:'pp:seoularchives:'+item.id,provider:'서울기록원',title:item.title||card.title,year:item.year,date:item.date||'시기 미상',description:item.description,imageUrl:card.thumb,fullUrl:item.image||card.thumb,sourceUrl:`${SEOUL_ARCHIVES}/item/${item.id}`,creator:item.creator||'서울특별시',license:'서울기록원 공개 기록 · 이용유형 제한없음',licenseUrl:null,distance:null,match:'neighborhood',via:query};
}
// The archive server sometimes stalls a request; a short timeout plus one retry is faster than waiting.
async function getText(url:string,fetcher:typeof fetch,tries=2):Promise<string>{
  for(let i=0;;i++){
    try{const r=await fetcher(url,{headers:{'User-Agent':UA,Accept:'text/html'},signal:AbortSignal.timeout(6000)});if(!r.ok)throw new Error('HTTP '+r.status);return await r.text();}
    catch(e){if(i>=tries-1)throw e;}
  }
}
/** Search terms, most specific first: 삼선동2가 → 삼선동2가, 삼선동; 여의도동 → 여의도동, 여의도; then the road; the district (성북구 → 성북) only as background. */
export function archiveQueries(dong:string,road='',district=''):{q:string;scope:'dong'|'district'}[]{
  const base=dong.replace(/\d+가$/,'').replace(/(\D)\d+동$/,'$1동');
  const bare=base.replace(/동$/,'');
  const local=[dong,base,bare.length>=3?bare:'',road].map(s=>s.trim()).filter(s=>s.length>=2);
  const wide=district.replace(/구$/,'');
  return [...new Set(local)].slice(0,4).map(q=>({q,scope:'dong' as 'dong'|'district'})).concat(wide.length>=2&&!local.includes(wide)?[{q:wide,scope:'district' as const}]:[]);
}
export async function seoulArchivesPhotos(dong:string,road='',fetcher:typeof fetch=fetch,max=12,budgetMs=20000,district=''):Promise<PlacePhoto[]>{
  const deadline=Date.now()+budgetMs;
  const cards:{card:ArchiveCard;query:string;scope:'dong'|'district'}[]=[];const seen=new Set<string>();let failed=0,tried=0;
  for(const {q,scope} of archiveQueries(dong,road,district)){
    // District-wide photos only top up a neighborhood with few records of its own.
    if(cards.length>=max||(scope==='district'&&cards.length>=6)||Date.now()>deadline)break;
    tried++;
    try{const {cards:found}=parseArchiveList(await getText(`${SEOUL_ARCHIVES}/photo/list?query=${encodeURIComponent(q)}`,fetcher));
      for(const c of found)if(!seen.has(c.id)){seen.add(c.id);cards.push({card:c,query:q,scope});}}catch{failed++;}
  }
  if(tried&&failed===tried)throw new Error('서울기록원 검색 실패');
  const picked=cards.slice(0,max);const out:PlacePhoto[]=[];
  for(let i=0;i<picked.length&&Date.now()<deadline;i+=3){
    const batch=await Promise.allSettled(picked.slice(i,i+3).map(async({card,query,scope})=>{const item=parseArchiveItem(card.id,await getText(`${SEOUL_ARCHIVES}/item/${card.id}`,fetcher));return archiveUsable(item)?archivePhoto(item,card,query,scope):null;}));
    for(const b of batch)if(b.status==='fulfilled'&&b.value)out.push(b.value);
  }
  return out;
}
