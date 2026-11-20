import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';
import {gzipSync} from 'node:zlib';
import {GET as photoResearchRoute} from '../app/api/archive/photo-research/route.ts';
import {verifyPhotoAsset,publicPhotoItem} from '../lib/photo-verification.ts';
import {photoResearchImageCandidates} from '../lib/photo-research.ts';
import {fixturePhoto} from './fixtures/verified-photo.mjs';
import {preparePlaceAnswer,guidePhotos,validateAnswer} from '../lib/place-answer.ts';
import {buildDocentStory,composeByYear} from '../lib/docent-story.ts';
import {galleryHtml} from '../lib/docent-gallery.ts';
import {handleImageProxy} from '../lib/image-proxy-handler.ts';
import {canDisplayVerifiedPhoto} from '../lib/photo-display-policy.ts';
import {IMAGE_RESOURCE_DOMAINS,imageProxyOrigin} from '../lib/image-proxy.ts';

test('bound record asset is verified; unbound record, candidate, wrong record, license and host are withheld',()=>{
 const item=fixturePhoto();assert.equal(verifyPhotoAsset(item).verificationStatus,'VERIFIED');assert.equal(photoResearchImageCandidates(item).length,1);
 for(const [mutate,status] of [
  [p=>({...p,assetProof:undefined}),'SOURCE_ONLY'],
  [p=>({...p,candidate:true}),'SOURCE_ONLY'],
  [p=>({...p,sourceUrl:'https://museum.seoul.go.kr/fixture-record/OTHER'}),'REJECTED'],
  [p=>({...p,assetProof:{...p.assetProof,displayAllowed:false}}),'REJECTED'],
  [p=>({...p,previewUrl:'https://museum.seoul.go.kr/other.jpg'}),'SOURCE_ONLY'],
 ]){const changed=mutate(item);const result=verifyPhotoAsset(changed);assert.equal(result.verificationStatus,status);assert.equal(result.displayImageUrl,null);assert.deepEqual(photoResearchImageCandidates(changed),[]);}
 const related=verifyPhotoAsset(item,'OTHER-EVIDENCE','https://museum.seoul.go.kr/fixture-record/ANOTHER-EVENT');assert.equal(related.verificationStatus,'RELATED_ONLY');assert.equal(related.displayable,false);
 assert.equal(verifyPhotoAsset(fixturePhoto('BAD','https://127.0.0.1/a.jpg')).verificationStatus,'REJECTED');
});
test('individual assets and original/thumbnail are only accepted from explicit same-record receipt',()=>{
 const first=fixturePhoto('MULTI');const second={...first,previewUrl:'https://museum.seoul.go.kr/fixture-second.jpg',assetProof:{...first.assetProof,mediaId:'FIXTURE-ASSET-2',originalImageUrl:'https://museum.seoul.go.kr/fixture-second.jpg',displayImageUrls:['https://museum.seoul.go.kr/fixture-second.jpg']}};
 assert.notEqual(verifyPhotoAsset(first).mediaId,verifyPhotoAsset(second).mediaId);
 const thumbnail='https://museum.seoul.go.kr/fixture-thumb.jpg';const thumb={...first,previewUrl:thumbnail,assetProof:{...first.assetProof,displayImageUrls:[thumbnail,first.previewUrl]}};
 assert.equal(verifyPhotoAsset(thumb).displayImageUrl,thumbnail);assert.deepEqual(verifyPhotoAsset(thumb).alternateUrls,[first.previewUrl]);
});
test('a matching title cannot rescue a different provider record ID; media claims must cite that exact asset',()=>{
 const item=fixturePhoto('FIXTURE-A');const source='https://museum.seoul.go.kr/fixture?fileId=FIXTURE-A';
 assert.equal(verifyPhotoAsset({...item,sourceUrl:source,assetProof:{...item.assetProof,sourcePageUrl:source,sourceRecordId:'FIXTURE-B'}}).verificationStatus,'REJECTED');
 const scene={id:'E1',title:item.values.자료명,date:'1978-10-30',text:'검증용 기록입니다.',scope:'dong',photos:[item],evidence:[{url:item.sourceUrl}]};
 const answer=media=>({paragraphs:[{heading:'기록',text:'검증용 기록입니다.',evidence_ids:['E1'],media_ids:[media]}]});
 assert.equal(validateAnswer(answer(item.assetProof.mediaId),[scene]).omitted,0);
 assert.equal(validateAnswer(answer('FIXTURE-OTHER-ASSET'),[scene]).omitted,1);
});
test('item/2424 regression uses actual saved source metadata but never invents an approved image',()=>{
 const rows=JSON.parse(readFileSync(new URL('../data/seoul-archives/photos.json',import.meta.url),'utf8'));
 const row=rows.find(row=>row.sourceUrl==='https://archives.seoul.go.kr/item/2424');assert.ok(row);
 const item={...fixturePhoto(),assetProof:undefined,id:'seoul-archives-2424',sourceUrl:row.sourceUrl,previewUrl:row.imageUrl,provider:row.institution,values:{資料名:row.title,자료명:row.title,이용조건:row.license}};
 const result=verifyPhotoAsset(item);assert.equal(result.sourceRecordId,'2424');assert.equal(result.verificationStatus,'SOURCE_ONLY');assert.equal(result.displayImageUrl,null);
 assert.equal(publicPhotoItem(item).previewUrl,null);
});
test('image failure keeps story text and original record source; caption cannot adopt another record photo',()=>{
 const item=fixturePhoto();delete item.assetProof;
 const scene={id:'TEXT-1',title:'여자 개인택시 발대식',date:'1978-10-30',text:'기록에 남은 설명입니다.',scope:'dong',order:1,year:1978,photos:[item],evidence:[{url:item.sourceUrl,title:'모의 원문',institution:'시험기관'}]};
 const packet=preparePlaceAnswer({address:{roadAddr:'시험 주소'},story:{dong:'마장동',scenes:[scene]}});
 assert.equal(packet.neighborhood.records[0].text,scene.text);assert.equal(packet.neighborhood.records[0].source.url,item.sourceUrl);assert.equal(packet.neighborhood.records[0].source.photo,null);assert.deepEqual(guidePhotos(packet),[]);
 const verified=fixturePhoto();const wrong=preparePlaceAnswer({address:{roadAddr:'시험 주소'},story:{dong:'마장동',scenes:[{...scene,photos:[verified],evidence:[{url:'https://museum.seoul.go.kr/fixture-other-event'}]}]}});
 assert.equal(wrong.neighborhood.records[0].source.photo,null);assert.equal(wrong.neighborhood.records[0].source.photoVerification.verificationStatus,'RELATED_ONLY');
});
test('story ingestion keeps an image-less record and does not illustrate another event merely in the same year',()=>{
 const item={...fixturePhoto('TEXT-ONLY'),assetProof:undefined,batchId:'FIXTURE',district:'성동구',dong:'마장동',correctionOf:null,conflictMentioned:false,sourceLinkType:'record',values:{...fixturePhoto('TEXT-ONLY').values,내용설명:'보존해야 하는 기록 설명입니다.'}};
 const story=buildDocentStory({meta:{files:[{id:'FIXTURE',collectionScope:'dong',district:'성동구',dong:'마장동'}]},items:[item]},{targets:[],tables:{timeline:[],claims:[],sources:[]}},'성동구','마장동');
 assert.ok(story.scenes.some(scene=>scene.id===item.id&&scene.text.includes('보존해야')));
 const base={date:'1978',year:1978,order:1978,scope:'dong',cutCount:0};
 const combined=composeByYear([{...base,id:'A',kind:'document',title:'사건 A',text:'A의 기록입니다.',photos:[],evidence:[{url:'https://museum.seoul.go.kr/fixture-event-A'}]},{...base,id:'B',kind:'photo',title:'사건 B',text:'B의 기록입니다.',photos:[fixturePhoto('B')],evidence:[{url:fixturePhoto('B').sourceUrl}]}]);
 assert.equal(combined[0].title,'사건 A');assert.deepEqual(combined[0].photos,[]);
});
function gallery(data){
 const loads=[];const elements=[];
 class Element{children=[];hidden=false;append(...nodes){this.children.push(...nodes);}replaceChildren(){this.children=[];}insertBefore(node){this.children.push(node);}setAttribute(){}set src(value){loads.push(value);}get src(){return loads.at(-1);}}
 const main=new Element();const document={querySelector:()=>main,createElement:tag=>{const element=new Element();element.tag=tag;elements.push(element);return element;},documentElement:{scrollHeight:100}};
 const parent={postMessage(){}};const context={document,URL,parent,addEventListener(){},window:{openai:{toolOutput:data}},ResizeObserver:class{observe(){}},console};
 vm.runInNewContext(galleryHtml.match(/<script>([\s\S]*?)<\/script>/)[1],context);return {loads,elements,main};
}
test('actual gallery script blocks unverified images and never tries another asset on 404',()=>{
 const item=fixturePhoto();const verified=verifyPhotoAsset(item);const payload={...verified,imageUrl:verified.displayImageUrl,sourceUrl:verified.sourcePageUrl};
 assert.equal(canDisplayVerifiedPhoto(payload,IMAGE_RESOURCE_DOMAINS,imageProxyOrigin()),true);
 const rendered=gallery({photos:[payload,{...payload,verificationStatus:'SOURCE_ONLY',imageUrl:'https://museum.seoul.go.kr/fake.jpg',displayImageUrl:'https://museum.seoul.go.kr/fake.jpg'}]});
 assert.deepEqual(rendered.loads,[item.previewUrl]);
 const image=rendered.elements.find(element=>element.tag==='img'&&element.onerror);image.onerror();assert.equal(image.hidden,true);assert.equal(rendered.loads.length,1);
});
test('proxy refuses unregistered asset and non-image bytes, with no redirect or unrelated fallback',async t=>{
 const url='https://seoul-place-docent-mcp.vercel.app/img?u='+encodeURIComponent('https://museum.seoul.go.kr/fixture-image.jpg');
 const mock=t.mock.method(globalThis,'fetch',async()=>new Response('html pretending image',{headers:{'Content-Type':'image/jpeg'}}));
 assert.equal((await handleImageProxy(new Request(url))).status,400);assert.equal(mock.mock.callCount(),0);
 assert.equal((await handleImageProxy(new Request(url),()=>true)).status,502);
 mock.mock.mockImplementation(async()=>new Response(null,{status:404}));assert.equal((await handleImageProxy(new Request(url),()=>true)).status,502);
 assert.equal(mock.mock.callCount(),2);
});
test('actual homepage PhotoPreview component renders no img for unverified records',()=>{
 const require=createRequire(import.meta.url);
 const component=readFileSync(new URL('../app/components/PhotoPreview.tsx',import.meta.url),'utf8');
 const compiled=ts.transpileModule(component,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
 const module={exports:{}};
 const photoModule={photoResearchImageCandidates,photoResearchCredit:()=>'',photoResearchText:value=>value};
 const localRequire=name=>name==='@/lib/photo-research'?photoModule:name==='@/lib/photo-verification'?{verifyPhotoAsset}:name.endsWith('.css')?{}:require(name);
 vm.runInThisContext('(function(require,module,exports){'+compiled+'\n})')(localRequire,module,module.exports);
 const item=fixturePhoto('UI');const sourceOnly={...item,assetProof:undefined};
 const blocked=renderToStaticMarkup(React.createElement(module.exports.default,{item:sourceOnly}));assert.doesNotMatch(blocked,/<img\b/);assert.match(blocked,/자료 원문 열기/);
 const visible=renderToStaticMarkup(React.createElement(module.exports.default,{item}));assert.match(visible,/<img\b/);assert.match(visible,/fixture-image\.jpg/);
});
test('normal archive API withholds unverified preview fields while an explicit raw export remains auditable',async t=>{
 const item={...fixturePhoto('FIXTURE-API'),assetProof:undefined,district:'성동구',dong:'마장동',batchId:'FIXTURE-API',sourceKey:'fixture-api',correctionIds:[],values:{...fixturePhoto('FIXTURE-API').values}};
 const {photoResearchBundle}=await import('../lib/photo-research-data.ts');
 photoResearchBundle.items.push(item);t.after(()=>photoResearchBundle.items.splice(photoResearchBundle.items.indexOf(item),1));
 const url='https://example.test/api/archive/photo-research?district='+encodeURIComponent('성동구')+'&id='+encodeURIComponent(item.id);
 const visible=await (await photoResearchRoute(new Request(url))).json();
 assert.equal(visible.total,1);assert.equal(visible.rows[0].previewUrl,null);assert.equal(visible.rows[0].imageVerification.verificationStatus,'SOURCE_ONLY');
 const exported=await (await photoResearchRoute(new Request(url+'&download=1'))).json();
 assert.equal(exported.rows[0].previewUrl,item.previewUrl);assert.ok(exported.provenance);
});
