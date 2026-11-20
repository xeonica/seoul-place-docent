import {handleMcpMessage} from '../lib/mcp-protocol.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {galleryPayload,galleryHtml} from '../lib/docent-gallery.ts';
import {getFullDocentStory} from '../lib/docent-data.ts';
import {preparePlaceAnswer,guidePhotos} from '../lib/place-answer.ts';
import {visitorPhotos} from '../lib/docent-experience.ts';
import {photoProofFor} from '../lib/photo-proof-index.ts';
import {sourcePageKey} from '../lib/photo-verification.ts';
import {canDisplayVerifiedPhoto} from '../lib/photo-display-policy.ts';
import {IMAGE_RESOURCE_DOMAINS,imageProxyOrigin} from '../lib/image-proxy.ts';
import {handleImageProxy} from '../lib/image-proxy-handler.ts';
import {parseCoordinates,signAddress} from '../lib/providers.ts';
import {placeMapView,resolvePlaceMap} from '../lib/mcp-map-view.ts';
import {loadSdk} from '../lib/kakao-map-sdk.ts';
import {POST} from '../app/mcp/route.ts';
const address=JSON.parse(readFileSync(new URL('./fixtures/centras-address.json',import.meta.url),'utf8'));
const packet=preparePlaceAnswer({address,story:getFullDocentStory(address.sggNm,address.emdNm)});
const photos=visitorPhotos(guidePhotos(packet),[]);
const doc={x:'127.02',y:'37.56',address:{region_1depth_name:'서울',b_code:address.admCd,main_address_no:'1070',sub_address_no:'0',mountain_yn:'N'},road_address:{address_name:address.roadAddr}};
function rendered(data){
 const images=[],elements=[];class Element{children=[];hidden=false;append(...v){this.children.push(...v);}replaceChildren(){this.children=[];}insertBefore(v){this.children.push(v);}setAttribute(){}set src(v){images.push(v);} }
 const main=new Element(),context={URL,console,document:{querySelector:()=>main,createElement:tag=>{const e=new Element();e.tag=tag;elements.push(e);return e;},documentElement:{scrollHeight:500}},parent:{postMessage(){}},window:{openai:{toolOutput:data}},addEventListener(){},ResizeObserver:class{observe(){}}};
 vm.runInNewContext(galleryHtml.match(/<script>([\s\S]*?)<\/script>/)[1],context);return {images,elements,main};
}
test('recorded official Wangsimni-ro 410 identifies Centras in Hawangsimni, not a guessed parcel',()=>{
 assert.match(address.roadAddr,/왕십리로 410/);assert.equal(address.bdNm,'센트라스');assert.equal(address.emdNm,'하왕십리동');assert.equal(address.lnbrMnnm,'1070');assert.equal('token' in address,false);
});
test('Centras neighborhood photos retain the exact proof ID, image, source, date and credit without claiming the apartment',()=>{
 assert.ok(photos.length>0);for(const p of photos){const proof=photoProofFor(p.sourceUrl);assert.ok(proof);assert.equal(p.sourceRecordId,proof.sourceRecordId);assert.equal(p.title,proof.title);assert.equal(p.date,proof.date);assert.equal(sourcePageKey(p.sourceUrl),sourcePageKey(proof.sourcePageUrl));assert.ok(p.credit);assert.ok(packet.neighborhood.records.some(r=>r.id===p.evidenceId));assert.equal(p.relation_type,'neighborhood');assert.equal(p.locationVerification,'regional_context_only');assert.equal(canDisplayVerifiedPhoto(p,IMAGE_RESOURCE_DOMAINS,imageProxyOrigin()),true);}
});
test('ChatGPT globals, structured result and text result all deliver the same gallery without unrelated replacement',()=>{
 for(const data of [{photos}, {visuals:{photos}}, {structuredContent:{photos}}, {content:[{type:'text',text:JSON.stringify({visuals:{photos}})}]}]){
  const view=rendered(data);assert.equal(view.images.length,photos.length);assert.equal(view.images[0],photos[0].imageUrl);const image=view.elements.find(e=>e.tag==='img');image.onerror();assert.equal(image.hidden,true);assert.equal(view.images.length,photos.length);assert.equal(image.onerror,null);
 }
 assert.equal(galleryPayload(null),null);assert.deepEqual(galleryPayload({photos:[],sourceOnlyRecords:'malformed'}).sourceOnlyRecords,[]);
});
test('unbound same-domain alternative images cannot inherit a verified original identity',()=>{
 const p=photos[0],other='https://museum.seoul.go.kr/unrelated.jpg';assert.equal(canDisplayVerifiedPhoto({...p,imageUrl:other,displayImageUrl:other,alternateUrls:[p.originalImageUrl]},IMAGE_RESOURCE_DOMAINS,imageProxyOrigin()),false);
});
test('coordinate contract uses y=latitude, x=longitude and never supplies a city-center pin as a fallback',()=>{
 const point=parseCoordinates([doc],address),map=placeMapView(address.roadAddr,point);assert.equal(map.latitude,37.56);assert.equal(map.longitude,127.02);assert.match(map.externalUrl,/,37\.56,127\.02$/);assert.equal(map.coordinateSystem,'WGS84');assert.equal(map.verificationStatus,'address_and_parcel_verified');
 for(const p of [{status:'verified',x:127.02,y:37.56,source:'map-click'},{status:'verified',x:37.56,y:127.02},{status:'verified',x:NaN,y:37.56},{status:'unconfirmed',x:127.02,y:37.56},undefined]){const m=placeMapView(address.roadAddr,p);assert.equal(m.latitude,null);assert.equal(m.longitude,null);assert.match(m.externalUrl,/\/link\/search\//);assert.equal(m.nativeChatgptMapControlled,false);}
 assert.equal(parseCoordinates([{...doc,address:{...doc.address,main_address_no:'999'}}],address).status,'unconfirmed');
});
test('map lookup errors and missing REST key preserve an address search link without leaking errors or keys',async()=>{
 const original=globalThis.fetch;try{globalThis.fetch=async()=>{throw new Error('SECRET_FAKE_KEY');};const m=await resolvePlaceMap(address,{KAKAO_REST_API_KEY:'SECRET_FAKE_KEY'});assert.equal(m.status,'unavailable');assert.equal(m.latitude,null);assert.ok(m.externalUrl.includes('search'));assert.equal(JSON.stringify(m).includes('SECRET_FAKE_KEY'),false);assert.equal((await resolvePlaceMap(address,{})).status,'not_configured');}finally{globalThis.fetch=original;}
});
test('gallery renders verified or fallback map links together with history photos',()=>{
 for(const [relation_type,label] of [['exact_building','건물 직접'],['exact_parcel','동일 부지'],['nearby','주변 기록'],['neighborhood','동네 배경']]){const view=rendered({photos:[{...photos[0],relation_type}]});assert.ok(view.elements.some(e=>e.tag==='figcaption'&&e.textContent.includes(label)));}
 const m=placeMapView(address.roadAddr);const view=rendered({visuals:{photos},map:m});assert.ok(view.elements.some(e=>e.tag==='a'&&e.href===m.externalUrl));assert.equal(view.images.length,photos.length);const unsafe=rendered({photos:[],map:{externalUrl:'https://evil.example/steal'}});assert.equal(unsafe.elements.some(e=>e.href),false);
});
test('SDK missing key and synchronous maps.load failure reject promptly while external fallback remains available',async()=>{
 const original=globalThis.fetch,oldDocument=globalThis.document,oldWindow=globalThis.window;
 try{globalThis.fetch=async()=>Response.json({javascriptKey:null});await assert.rejects(()=>loadSdk(),/키/);
  globalThis.fetch=async()=>Response.json({javascriptKey:'browser-fixture'});globalThis.window={kakao:{maps:{load(){throw new Error('fixture SDK rejected');}}}};globalThis.document={createElement:()=>({remove(){}}),head:{appendChild(script){queueMicrotask(()=>script.onload());}}};await assert.rejects(()=>loadSdk(),/SDK/);assert.match(placeMapView(address.roadAddr).externalUrl,/search/);
  globalThis.window.kakao.maps={load:done=>done(),Map:class{},LatLng:class{}};assert.equal(await loadSdk(),globalThis.window.kakao.maps);
 }finally{globalThis.fetch=original;if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument;if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow;}
});
test('MCP history, structured gallery and map survive coordinate API failure',async()=>{
 const saved={...process.env},fetch=globalThis.fetch,info=console.info;console.info=()=>{};process.env.JUSO_API_KEY='photo-map-fixture-sign';process.env.KAKAO_REST_API_KEY='coordinate-failure';for(const k of ['VERCEL','BUILDING_API_KEY','CLOSED_BUILDING_API_KEY','CLOUDFLARE_ACCOUNT_ID'])delete process.env[k];globalThis.fetch=async()=>{throw new Error('provider failed');};
 try{const token=await signAddress(address,process.env.JUSO_API_KEY);const r=await POST(new Request('https://fixture.test/mcp',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'prepare_place_answer',arguments:{token}}})}));const result=(await r.json()).result;assert.equal(result.isError,undefined);const p=JSON.parse(result.content[0].text);assert.ok(p.neighborhood.records.length);assert.equal(p.map.status,'unavailable');assert.equal(p.coordinates.latitude,null);assert.deepEqual(result.structuredContent.map,p.map);assert.deepEqual(result.structuredContent.photos,p.visuals.photos);
 }finally{globalThis.fetch=fetch;console.info=info;for(const k of Object.keys(process.env))if(!(k in saved))delete process.env[k];Object.assign(process.env,saved);}
});

test('cached v5 gallery resource remains readable while discovery advertises v6',async()=>{
 for(const version of [4,5]){const uri='ui://seoul-docent/archive-photos-v'+version+'.html';const result=await handleMcpMessage({jsonrpc:'2.0',id:1,method:'resources/read',params:{uri}},[],async()=>({content:[]}));assert.equal(result.result.contents[0].uri,uri);assert.ok(result.result.contents[0].text.includes('galleryPayload'));}
});
