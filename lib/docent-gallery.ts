export const galleryUri = 'ui://seoul-docent/archive-photos-v1.html';
export const galleryMime = 'text/html;profile=mcp-app';
export const galleryToolMeta = {ui:{resourceUri:galleryUri}, 'openai/outputTemplate':galleryUri};
export const galleryResource = {
  uri:galleryUri, name:'서울 기록 사진', mimeType:galleryMime,
  _meta:{ui:{csp:{resourceDomains:['https://museum.seoul.go.kr:8088','https://museum.seoul.go.kr','https://archive-file.sb.go.kr','https://archive.much.go.kr','https://archives.seoul.go.kr']}}},
};
export const galleryHtml = `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;font:14px system-ui;color:inherit}main{display:flex;gap:12px;overflow-x:auto}figure{margin:0;flex:1 0 min(260px,80vw)}img{width:100%;height:180px;object-fit:contain;background:#eee}figcaption{padding:6px 0}a{color:inherit}</style>
<main aria-label="해설 관련 기록 사진"></main><script>
const gallery=document.querySelector('main');
function https(value){try{const u=new URL(value);return u.protocol==='https:'?u.href:null}catch{return null}}
function render(data){
  if(!Array.isArray(data?.photos))return;
  gallery.replaceChildren();
  for(const photo of data.photos){
    const src=https(photo.imageUrl), original=https(photo.sourceUrl);
    if(!src)continue;
    const figure=document.createElement('figure'), image=document.createElement('img'), caption=document.createElement('figcaption');
    image.alt=photo.title; image.onerror=()=>image.hidden=true; image.src=src;
    caption.textContent=photo.caption;
    if(original){const link=document.createElement('a');link.href=original;link.target='_blank';link.rel='noopener noreferrer';link.textContent='사진 원문 보기';caption.append(' · ',link)}
    figure.append(image,caption);gallery.append(figure);
  }
}
function send(message){parent.postMessage({jsonrpc:'2.0',...message},'*')}
addEventListener('message',event=>{
  if(event.source!==parent)return;
  const m=event.data;
  if(m?.id===1&&m.result)send({method:'ui/notifications/initialized',params:{}});
  if(m?.method==='ui/notifications/tool-result')render(m.params?.structuredContent);
});
addEventListener('openai:set_globals',e=>render(e.detail?.globals?.toolOutput));
render(window.openai?.toolOutput);
send({id:1,method:'ui/initialize',params:{appInfo:{name:'seoul-docent-photos',version:'1.0.0'},appCapabilities:{},protocolVersion:'2026-01-26'}});
new ResizeObserver(()=>send({method:'ui/notifications/size-changed',params:{height:document.documentElement.scrollHeight}})).observe(gallery);
</script></html>`;
