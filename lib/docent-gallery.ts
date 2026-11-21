import {canDisplayVerifiedPhoto} from './photo-display-policy';
import {IMAGE_RESOURCE_DOMAINS,imageProxyOrigin} from './image-proxy';
export const galleryUri = 'ui://seoul-docent/archive-photos-v6.html';
export const legacyGalleryUris=['ui://seoul-docent/archive-photos-v4.html','ui://seoul-docent/archive-photos-v5.html'];
export const galleryMime = 'text/html;profile=mcp-app';
export const galleryToolMeta = {ui:{resourceUri:galleryUri}, 'openai/outputTemplate':galleryUri};
const resourceDomains = [...new Set([...IMAGE_RESOURCE_DOMAINS, imageProxyOrigin()])];
export const galleryResource = {
  uri:galleryUri, name:'서울 기록 사진', mimeType:galleryMime,
  _meta:{ui:{csp:{resourceDomains}}},
};
/** Host variants differ: ChatGPT globals may carry the full text payload. */
export function galleryPayload(value:unknown,depth=0):Record<string,unknown>|null{
 function object(v:unknown):v is Record<string,unknown>{return !!v&&typeof v==='object'&&!Array.isArray(v);}
 if(!object(value)||depth>3)return null;
 const structured=object(value.structuredContent)?value.structuredContent:null;
 for(const candidate of [structured,value.visuals,structured?.visuals,value]){
  if(object(candidate)&&(Array.isArray(candidate.photos)||Array.isArray(candidate.sourceOnlyRecords)||object(candidate.map)))return {...candidate,map:candidate.map||value.map,photos:Array.isArray(candidate.photos)?candidate.photos:[],sourceOnlyRecords:Array.isArray(candidate.sourceOnlyRecords)?candidate.sourceOnlyRecords:[]};
 }
 for(const block of Array.isArray(value.content)?value.content:[])if(object(block)&&block.type==='text'&&typeof block.text==='string')try{const result=galleryPayload(JSON.parse(block.text),depth+1);if(result)return result;}catch{}
 return null;
}
export const galleryHtml = `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;font:14px system-ui;color:inherit}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:14px}figure{margin:0;min-width:0}img{width:100%;height:200px;object-fit:contain;background:#eee}figcaption{padding:6px 0}a{color:inherit}</style>
<main aria-label="해설 관련 기록 사진"></main><script>
const gallery=document.querySelector('main');
const canDisplayVerifiedPhoto=${canDisplayVerifiedPhoto.toString()};
const galleryPayload=${galleryPayload.toString()};
const allowedOrigins=${JSON.stringify(IMAGE_RESOURCE_DOMAINS)},proxyOrigin=${JSON.stringify(imageProxyOrigin())};
function https(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null}catch{return null}}
function render(data){
  data=galleryPayload(data);if(!data)return;
  gallery.replaceChildren();
  if(data.map){const card=document.createElement('article'),link=document.createElement('a'),url=https(data.map.externalUrl);card.textContent=data.map.message||'선택한 주소의 지도';if(url&&new URL(url).hostname==='map.kakao.com'){link.href=url;link.target='_blank';link.rel='noopener noreferrer';link.textContent='외부 지도에서 주소 확인';card.append(' · ',link);}gallery.append(card);}
  for(const photo of [...data.photos,...(data.sourceOnlyRecords||[])]){
    if(!photo||typeof photo!=='object'||photo.verificationStatus==='REJECTED')continue;
    const src=canDisplayVerifiedPhoto(photo,allowedOrigins,proxyOrigin)?https(photo.imageUrl):null, original=https(photo.sourceUrl);
    if(!src&&!original)continue;
    const figure=document.createElement('figure'), image=document.createElement('img'), caption=document.createElement('figcaption');
    image.alt=photo.title;
    image.loading='eager';
    image.referrerPolicy='no-referrer';
    image.onerror=()=>{
      image.onerror=null;image.hidden=true;
      const fallback=document.createElement('p');
      fallback.setAttribute('role','status');
      fallback.textContent='사진을 불러오지 못했습니다. 아래 원문에서 확인해 주세요.';
      figure.insertBefore(fallback,caption);
    };
    if(src)image.src=src;
    else {image.hidden=true;const fallback=document.createElement('p');fallback.textContent='사진 주소를 표시할 수 없습니다. 아래 원문에서 확인해 주세요.';figure.append(fallback)}
    const scope=({exact_building:'건물 직접',exact_parcel:'동일 부지',nearby:'주변 기록',neighborhood:'동네 배경',dong_context:'동네 배경',district:'자치구 배경'})[photo.relation_type]||(photo.scope==='district'?'자치구 배경':'동네 배경 · 건물 직접 미확인');
    caption.textContent=[photo.caption||[photo.title,photo.date,photo.credit,photo.note].filter(Boolean).join(' · '),scope].join(' · ');
    if(original){const link=document.createElement('a');link.href=original;link.target='_blank';link.rel='noopener noreferrer';link.textContent='사진 원문 보기';caption.append(' · ',link)}
    figure.append(image,caption);gallery.append(figure);
  }
}
function renderToolResult(result){render(result);}
function send(message){parent.postMessage({jsonrpc:'2.0',...message},'*')}
addEventListener('message',event=>{
  if(event.source!==parent)return;
  const m=event.data;
  if(m?.id===1&&m.result)send({method:'ui/notifications/initialized',params:{}});
  if(m?.method==='ui/notifications/tool-result')renderToolResult(m.params);
});
addEventListener('openai:set_globals',e=>render(e.detail?.globals?.toolOutput));
render(window.openai?.toolOutput);
send({id:1,method:'ui/initialize',params:{appInfo:{name:'seoul-docent-photos',version:'1.0.0'},appCapabilities:{},protocolVersion:'2026-01-26'}});
new ResizeObserver(()=>send({method:'ui/notifications/size-changed',params:{height:document.documentElement.scrollHeight}})).observe(gallery);
</script></html>`;
