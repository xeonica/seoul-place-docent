import {IMAGE_RESOURCE_DOMAINS, imageProxyOrigin} from './image-proxy';

/**
 * Archive-photo gallery shown beside prepare_place_answer results.
 *
 * Two hosts read UI resources differently, so the gallery is published twice:
 * - MCP Apps standard (Claude, MCP Apps hosts): `_meta.ui.resourceUri` → text/html;profile=mcp-app
 * - ChatGPT Apps SDK: `_meta["openai/outputTemplate"]` → text/html+skybridge
 *
 * Switches, so a failing host can be cut off without a code change:
 * - env MCP_GALLERY=off|on|app|skybridge (default on)
 * - per-connection URL query `?gallery=off|on|app|skybridge`, e.g. register
 *   https://…/mcp?gallery=off in a client that refuses the gallery.
 */
export type GalleryMode = 'off' | 'on' | 'app' | 'skybridge';
const MODES: readonly GalleryMode[] = ['off', 'on', 'app', 'skybridge'];

export const GALLERY_APP_URI = 'ui://seoul-docent/photo-gallery-v5.html';
export const GALLERY_SKYBRIDGE_URI = 'ui://seoul-docent/photo-gallery-v5-skybridge.html';
export const GALLERY_APP_MIME = 'text/html;profile=mcp-app';
export const GALLERY_SKYBRIDGE_MIME = 'text/html+skybridge';
/** Tools whose results carry structuredContent.photos for the gallery. */
export const GALLERY_TOOLS = new Set(['prepare_place_answer', 'generate_place_answer']);

function parseMode(value: string | null | undefined): GalleryMode | null {
  const normalized = (value ?? '').trim().toLowerCase();
  if (['0', 'false', 'no', 'disabled'].includes(normalized)) return 'off';
  if (['1', 'true', 'yes', 'enabled', 'both'].includes(normalized)) return 'on';
  return (MODES as readonly string[]).includes(normalized) ? normalized as GalleryMode : null;
}

/** The URL query wins over the environment so one connection can opt out on its own. */
export function galleryMode(request: Request | null, envValue: string | undefined): GalleryMode {
  const fromQuery = request ? parseMode(URL.parse(request.url)?.searchParams.get('gallery')) : null;
  return fromQuery ?? parseMode(envValue) ?? 'on';
}

/**
 * Diagnostic variants for bisecting host rejections, selected with `?variant=`:
 * - full (default): complete widget, CSP for every image origin
 * - noport: CSP lists only origins without an explicit port (the proxy covers the rest)
 * - proxy: CSP lists only the image-proxy origin
 * - nocsp: complete widget, no CSP metadata at all
 * - minimal: a one-line HTML page with no CSP metadata
 */
export type GalleryVariant = 'full' | 'noport' | 'proxy' | 'nocsp' | 'minimal';
const VARIANTS: readonly GalleryVariant[] = ['full', 'noport', 'proxy', 'nocsp', 'minimal'];
export function galleryVariant(request: Request | null): GalleryVariant {
  const value = (request ? URL.parse(request.url)?.searchParams.get('variant') : null)?.trim().toLowerCase() ?? '';
  return (VARIANTS as readonly string[]).includes(value) ? value as GalleryVariant : 'full';
}

const usesApp = (mode: GalleryMode) => mode === 'on' || mode === 'app';
const usesSkybridge = (mode: GalleryMode) => mode === 'on' || mode === 'skybridge';

function resourceDomains(variant: GalleryVariant): string[] {
  if (variant === 'proxy') return [imageProxyOrigin()];
  const all = [...new Set<string>([...IMAGE_RESOURCE_DOMAINS, imageProxyOrigin()])];
  return variant === 'noport' ? all.filter(origin => !URL.parse(origin)?.port) : all;
}

/** CSP metadata in both vocabularies; each host ignores the keys it does not know. */
function resourceMeta(variant: GalleryVariant): Record<string, unknown> {
  if (variant === 'nocsp' || variant === 'minimal') return {'openai/widgetDescription': '서울 장소 기록 사진을 보여 줍니다.'};
  const domains = resourceDomains(variant);
  return {
    ui: {csp: {resourceDomains: domains, connectDomains: []}, prefersBorder: true},
    'openai/widgetCSP': {resource_domains: domains, connect_domains: []},
    'openai/widgetPrefersBorder': true,
    'openai/widgetDescription': '서울 장소 기록 사진을 날짜·소장기관·원문 링크와 함께 보여 줍니다. 사진 설명과 해설은 대화 본문에서 이어집니다.',
  };
}

export function galleryResources(mode: GalleryMode, variant: GalleryVariant = 'full') {
  const meta = resourceMeta(variant);
  const list = [];
  if (usesApp(mode)) list.push({uri: GALLERY_APP_URI, name: 'seoul-docent-photos', title: '서울 기록 사진', mimeType: GALLERY_APP_MIME, _meta: meta});
  if (usesSkybridge(mode)) list.push({uri: GALLERY_SKYBRIDGE_URI, name: 'seoul-docent-photos-chatgpt', title: '서울 기록 사진 (ChatGPT)', mimeType: GALLERY_SKYBRIDGE_MIME, _meta: meta});
  return list;
}

export function readGalleryResource(uri: unknown, mode: GalleryMode, variant: GalleryVariant = 'full') {
  const resource = galleryResources(mode, variant).find(item => item.uri === uri);
  if (!resource) return null;
  const text = variant === 'minimal' ? MINIMAL_HTML : GALLERY_HTML;
  return {contents: [{uri: resource.uri, mimeType: resource.mimeType, text, _meta: resource._meta}]};
}

export function galleryToolMeta(mode: GalleryMode): Record<string, unknown> | undefined {
  if (mode === 'off') return undefined;
  const meta: Record<string, unknown> = {
    'openai/toolInvocation/invoking': '기록 사진을 찾는 중…',
    'openai/toolInvocation/invoked': '기록 사진을 불러왔습니다',
  };
  if (usesApp(mode)) {
    meta.ui = {resourceUri: GALLERY_APP_URI};
    meta['ui/resourceUri'] = GALLERY_APP_URI; // pre-standard MCP Apps key, kept for older hosts
  }
  if (usesSkybridge(mode)) meta['openai/outputTemplate'] = GALLERY_SKYBRIDGE_URI;
  return meta;
}

/** Adds gallery metadata to the photo tools; other tools are returned unchanged. */
export function withGalleryMeta<T extends {name: string; _meta?: Record<string, unknown>}>(tools: readonly T[], mode: GalleryMode): T[] {
  const meta = galleryToolMeta(mode);
  if (!meta) return [...tools];
  return tools.map(tool => GALLERY_TOOLS.has(tool.name) ? {...tool, _meta: {...(tool._meta ?? {}), ...meta}} : tool);
}

const MINIMAL_HTML = '<!doctype html><html lang="ko"><meta charset="utf-8"><title>서울 기록 사진</title><p>서울 기록 사진 갤러리 (진단용 최소 버전)</p></html>';

/**
 * Static, self-contained widget. It reads photos from either host bridge:
 * ChatGPT (window.openai.toolOutput + openai:set_globals) or MCP Apps
 * (ui/initialize handshake + ui/notifications/tool-result over postMessage).
 * Text is set with textContent only, and only https image/link URLs are used.
 */
export const GALLERY_HTML = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>서울 기록 사진</title>
<style>
:root{color-scheme:light dark}
body{margin:0;padding:4px;font:14px/1.5 system-ui,-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;color:inherit;background:transparent}
main{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,220px),1fr));gap:12px}
figure{margin:0;min-width:0;display:flex;flex-direction:column;gap:6px}
.frame{aspect-ratio:4/3;border-radius:8px;overflow:hidden;background:rgba(127,127,127,.15);display:flex;align-items:center;justify-content:center}
img{width:100%;height:100%;object-fit:cover;display:block}
figcaption{font-size:12.5px;opacity:.85;overflow-wrap:anywhere}
figcaption b{display:block;font-size:13.5px;opacity:1}
a{color:inherit}
.note{font-size:12px;opacity:.7;padding:2px 0 0}
.empty{opacity:.7;padding:12px 0}
</style></head>
<body><main aria-label="해설 관련 기록 사진"><p class="empty">기록 사진을 불러오는 중입니다…</p></main>
<p class="note">동네 범위 기록 사진은 입력한 건물 자체의 사진이 아닐 수 있습니다. 원문에서 촬영 범위를 확인해 주세요.</p>
<script>
(function(){
var gallery=document.querySelector('main');
var rendered=false;
function https(v){try{var u=new URL(v);return u.protocol==='https:'?u.href:null}catch(e){return null}}
function text(tag,value){var el=document.createElement(tag);el.textContent=value;return el}
function photosFrom(data){
  if(!data||typeof data!=='object')return null;
  if(Array.isArray(data.photoPreviews))return data.photoPreviews;
  if(Array.isArray(data.photos))return data.photos;
  if(data.structuredContent)return photosFrom(data.structuredContent);
  if(data.visuals&&Array.isArray(data.visuals.photos))return data.visuals.photos;
  if(Array.isArray(data.content)){
    for(var i=0;i<data.content.length;i++){
      var b=data.content[i];
      if(b&&b.type==='text'){try{var p=photosFrom(JSON.parse(b.text));if(p)return p}catch(e){}}
    }
  }
  return null;
}
function render(data){
  var photos=photosFrom(data);
  if(!photos)return;
  rendered=true;
  gallery.replaceChildren();
  var shown=0;
  photos.slice(0,12).forEach(function(photo){
    if(!photo||typeof photo!=='object')return;
    var src=https(photo.imageUrl),original=https(photo.sourceUrl);
    if(!src&&!original)return;
    var figure=document.createElement('figure'),frame=document.createElement('div'),caption=document.createElement('figcaption');
    frame.className='frame';
    var alts=(Array.isArray(photo.alternateUrls)?photo.alternateUrls:[]).map(https).filter(function(u){return u&&u!==src});
    if(src){
      var img=document.createElement('img');
      img.alt=String(photo.title||'기록 사진');img.loading='lazy';img.decoding='async';img.referrerPolicy='no-referrer';
      img.onerror=function(){var next=alts.shift();if(next){img.src=next;return}frame.replaceChildren(text('span','사진을 불러오지 못했습니다'))};
      img.onload=notifySize;
      img.src=src;frame.append(img);
    } else frame.append(text('span','원문에서 사진을 확인해 주세요'));
    caption.append(text('b',String(photo.title||'기록 사진')));
    var meta=[photo.date,photo.credit].filter(Boolean).map(String).join(' · ');
    if(meta)caption.append(text('span',meta));
    if(original){var a=text('a','원문 보기');a.href=original;a.target='_blank';a.rel='noopener noreferrer';caption.append(document.createTextNode(' · '),a)}
    figure.append(frame,caption);gallery.append(figure);shown++;
  });
  if(!shown)gallery.replaceChildren(text('p','이 장소에 연결된 기록 사진이 없습니다.'));
  notifySize();
}
/* MCP Apps bridge (JSON-RPC over postMessage to the host frame). */
var nextId=1;
function send(msg){try{parent.postMessage(Object.assign({jsonrpc:'2.0'},msg),'*')}catch(e){}}
function notifySize(){
  var h=Math.ceil(document.documentElement.scrollHeight);
  send({method:'ui/notifications/size-changed',params:{width:Math.ceil(document.documentElement.scrollWidth),height:h}});
  try{if(window.openai&&typeof window.openai.notifyIntrinsicHeight==='function')window.openai.notifyIntrinsicHeight(h)}catch(e){}
}
var initId=nextId++;
window.addEventListener('message',function(event){
  if(event.source!==parent)return;
  var m=event.data;if(!m||typeof m!=='object')return;
  if(m.id===initId&&(m.result||m.error)){send({method:'ui/notifications/initialized',params:{}});return}
  if(m.method==='ui/notifications/tool-result')render(m.params);
  if(m.method==='ui/resource-teardown'&&m.id!==undefined)send({id:m.id,result:{}});
});
send({id:initId,method:'ui/initialize',params:{appInfo:{name:'seoul-docent-photos',version:'5.0.0'},appCapabilities:{},protocolVersion:'2026-01-26'}});
/* ChatGPT Apps SDK bridge. */
window.addEventListener('openai:set_globals',function(e){var g=e&&e.detail&&e.detail.globals;if(g&&g.toolOutput)render(g.toolOutput)});
try{if(window.openai&&window.openai.toolOutput)render(window.openai.toolOutput)}catch(e){}
if(typeof ResizeObserver==='function')new ResizeObserver(notifySize).observe(document.body);
setTimeout(function(){if(!rendered){gallery.replaceChildren(text('p','기록 사진은 대화 본문의 원문 링크에서 확인해 주세요.'));notifySize()}},8000);
})();
</script></body></html>`;
