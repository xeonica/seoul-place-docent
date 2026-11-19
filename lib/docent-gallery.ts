import {IMAGE_RESOURCE_DOMAINS,imageProxyOrigin} from './image-proxy';
export const galleryUri = 'ui://seoul-docent/archive-photos-v3.html';
export const galleryMime = 'text/html;profile=mcp-app';
export const galleryToolMeta = {ui:{resourceUri:galleryUri}, 'openai/outputTemplate':galleryUri};
export const galleryResource = {
  uri:galleryUri, name:'서울 기록 사진', mimeType:galleryMime,
  _meta:{ui:{csp:{resourceDomains:[...IMAGE_RESOURCE_DOMAINS,imageProxyOrigin()]}}},
};
export const galleryHtml = `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;font:14px system-ui;color:inherit}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:14px}figure{margin:0;min-width:0}img{width:100%;height:200px;object-fit:contain;background:#eee}figcaption{padding:6px 0}a{color:inherit}</style>
<main aria-label="해설 관련 기록 사진"></main><script>
const gallery=document.querySelector('main');
function https(value){try{const u=new URL(value);return u.protocol==='https:'?u.href:null}catch{return null}}
function render(data){
  if(!Array.isArray(data?.photos))return;
  gallery.replaceChildren();
  for(const photo of data.photos){
    const src=https(photo.imageUrl), original=https(photo.sourceUrl);
    if(!src&&!original)continue;
    const figure=document.createElement('figure'), image=document.createElement('img'), caption=document.createElement('figcaption');
    image.alt=photo.title;
    image.loading='eager';
    image.referrerPolicy='no-referrer';
    const alternatives=(photo.alternateUrls||[]).map(https).filter(url=>url&&url!==src);
    image.onerror=()=>{
      const next=alternatives.shift();
      if(next){image.src=next;return;}
      image.hidden=true;
      const fallback=document.createElement('p');
      fallback.setAttribute('role','status');
      fallback.textContent='사진을 불러오지 못했습니다. 아래 원문에서 확인해 주세요.';
      figure.insertBefore(fallback,caption);
    };
    if(src)image.src=src;
    else {image.hidden=true;const fallback=document.createElement('p');fallback.textContent='사진 주소를 표시할 수 없습니다. 아래 원문에서 확인해 주세요.';figure.append(fallback)}
    caption.textContent=photo.caption;
    if(original){const link=document.createElement('a');link.href=original;link.target='_blank';link.rel='noopener noreferrer';link.textContent='사진 원문 보기';caption.append(' · ',link)}
    figure.append(image,caption);gallery.append(figure);
  }
}
function renderToolResult(result){
  if(Array.isArray(result?.structuredContent?.photos)){
    render(result.structuredContent);
    return;
  }
  for(const block of result?.content ?? []){
    if(block.type!=='text')continue;
    try{
      const data=JSON.parse(block.text);
      if(Array.isArray(data?.visuals?.photos)){
        render(data.visuals);
        return;
      }
    }catch{/* A non-JSON result has no photo evidence. */}
  }
}
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
