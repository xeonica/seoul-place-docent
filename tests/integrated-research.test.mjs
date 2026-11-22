import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import legacy from '../data/photo-research/bundle.json';
import workbookPhotos from '../data/archive-workbook/photos.json';
import additional from '../data/integrated-research/photo-items.json';
import support from '../data/integrated-research/support.json';
import summary from '../data/integrated-research/summary.json';
import {photoResearchBundle as bundle} from '../lib/photo-research-data.ts';
import {filterPhotoResearch, placePhotoResearch} from '../lib/photo-research.ts';
import {GET as photoGET} from '../app/api/archive/photo-research/route.ts';
import {GET} from '../app/api/archive/integrated-research/route.ts';

const originalFetch=globalThis.fetch;
globalThis.fetch=async(input,init)=>{
 const url=new URL(input instanceof Request?input.url:String(input));
 if(url.pathname==='/research/seoul-district-collection/photos-index.json.gz'){
  return new Response(readFileSync(new URL('../public/research/seoul-district-collection/photos-index.json.gz',import.meta.url)));
 }
 return originalFetch(input,init);
};

const originalBytesMatch=(file,bytes)=>{
 const digest=value=>createHash('sha256').update(value).digest('hex')===file.sha256;
 const variants=[bytes];
 if(file.path.toLowerCase().endsWith('.csv')){
  const text=bytes.toString('utf8');
  variants.push(Buffer.from(text.replace(/\r\n/g,'\n')));
  variants.push(Buffer.from(text.replace(/\r?\n/g,'\r\n')));
 }
 return variants.some(value=>value.length===file.sizeBytes&&digest(value));
};

test('one final master supplies records while incremental files and exclusions remain audit evidence',()=>{
 assert.equal(additional.length,1562);
 assert.equal(bundle.items.length,legacy.items.length+additional.length+workbookPhotos.length);
 assert.equal(bundle.meta.recordCount,bundle.items.length);
 assert.equal(new Set(bundle.items.map(r=>r.id)).size,bundle.items.length);
 assert.equal(support.links.length,1703);assert.equal(support.targets.length,493);assert.equal(support.logs.length,3869);assert.equal(support.excluded.length,925);
 assert.equal(summary.incrementalRecordCount,1542);assert.equal(summary.changeCount,4389);assert.equal(summary.idChangeCount,11);
 assert.deepEqual(summary.mediaCounts,{'사진':1085,'도면':398,'지도':79});
 assert.equal(bundle.meta.visualRecordCount,bundle.items.filter(r=>r.recordType==='visual').length);
 assert.equal(bundle.meta.buildingRecordCount,bundle.items.filter(r=>r.recordType==='building').length);
 const byId=new Map(bundle.items.map(r=>[r.id,r]));
 for(const old of legacy.items){const now=byId.get(old.id);assert.deepEqual(now.values,old.values);assert.equal(now.batchId,old.batchId);assert.equal(now.sourceUrl,old.sourceUrl);}
});

test('all eleven unmodified exports are downloadable and final state agrees with the accepted master',()=>{
 assert.equal(summary.files.length,11);
 for(const file of summary.files){const bytes=readFileSync(new URL('../public'+file.path,import.meta.url));assert.ok(originalBytesMatch(file,bytes),`Original export mismatch: ${file.path}`);}
 const state=JSON.parse(readFileSync(new URL('../public'+summary.files.find(f=>f.id==='state').path,import.meta.url),'utf8'));
 assert.equal(state['누적고유자료수'],additional.length);assert.equal(state['누적지역연결수'],support.links.length);
 assert.equal(summary.completedDongCount,461);assert.equal(summary.dongTargetCount,467);assert.equal(summary.heldTargetCount,6);
 assert.equal(support.targets.filter(r=>r['처리상태']==='보류').length,6);
 assert.ok(support.targets.every(r=>r['대상ID']&&!Object.keys(r).some(k=>k.includes('\ufeff'))));
});

test('every region association resolves without promoting address relations or visual inspection',()=>{
 const targets=new Map(support.targets.map(r=>[r['대상ID'],r]));const sources=new Map(additional.map(r=>[r.id,r]));
 for(const link of support.links){const target=targets.get(link['대상ID']);assert.ok(target);assert.ok(sources.has(link['자료ID']));for(const k of ['자치구','법정동','법정동코드'])assert.equal(link[k],target[k]);}
 for(const row of additional){assert.ok(row.regionLinks.length);assert.equal(row.previewUrl,null);assert.equal(row.relation,row.values['주소관계상태']);assert.equal(row.reviewStatus,'원문 확인·검토 대기');assert.ok(['원문 설명만 확인','원문 항목만 확인','원문 제목만 확인'].includes(row.values['시각적내용확인상태']));}
 const denied=additional.find(r=>r.values['썸네일표시가능여부']==='미확인');assert.ok(denied);assert.equal(denied.previewUrl,null);
});

test('shared originals are grouped across surveys and obsolete IDs resolve to current records',async()=>{
 const oldURLs=new Set(legacy.items.map(r=>r.sourceUrl));assert.equal(additional.filter(r=>oldURLs.has(r.sourceUrl)).length,68);
 const overlap=additional.find(r=>oldURLs.has(r.sourceUrl));const found=filterPhotoResearch(bundle,{source:overlap.sourceKey});assert.ok(found.some(r=>r.batchId!==summary.datasetId));assert.equal(found.length,bundle.items.find(r=>r.id===overlap.id).sameSourceCount);
 assert.equal(bundle.meta.sourceUrlCount,new Set(bundle.items.filter(r=>r.sourceUrl).map(r=>r.sourceUrl)).size);
 for(const change of support.idChanges){const response=await (await photoGET(new Request('https://example.test/api/archive/photo-research?id='+encodeURIComponent(change['이전ID'])))).json();assert.equal(response.total,1);assert.equal(response.rows[0].id,change['수정ID']);assert.ok(response.rows[0].previousIds.includes(change['이전ID']));}
});

test('address and legal-dong filters require a matching district and use secondary region links',()=>{
 const eunpyeong=placePhotoResearch(bundle,'은평구',['신사동']);const gangnam=placePhotoResearch(bundle,'강남구',['신사동']);
 assert.equal(eunpyeong.integratedTotal,3);assert.equal(gangnam.integratedTotal,3);
 assert.ok(eunpyeong.integratedRows.every(row=>row.regionLinks.some(link=>link['자치구']==='은평구'&&link['법정동']==='신사동')));
 assert.equal(new Set([...eunpyeong.integratedRows,...gangnam.integratedRows].map(row=>row.id)).size,6);
 assert.equal(placePhotoResearch(bundle,'강동구',['강일동']).integratedTotal,0);
 assert.equal(placePhotoResearch(bundle,'마포구',['연남동']).integratedTotal,0); // Existing later survey remains available separately.
 assert.equal(filterPhotoResearch(bundle,{district:'마포구',dong:'연남동'}).length,20);
 const secondary=additional.find(row=>row.regionLinks.some(link=>link['자치구']!==row.district));assert.ok(secondary);
 const link=secondary.regionLinks.find(link=>link['자치구']!==secondary.district);
 assert.ok(filterPhotoResearch(bundle,{district:link['자치구'],dong:link['법정동'],target:link['대상ID']}).some(row=>row.id===secondary.id));
 assert.equal(filterPhotoResearch(bundle,{target:'MISSING'}).length,0);
});

test('support API validates tables, paginates, and keeps held and excluded records distinct from accepted photos',async()=>{
 const request=p=>GET(new Request('https://example.test/api/archive/integrated-research?'+p));
 assert.equal(request('table=missing').status,400);
 const held=await request('table=targets&status='+encodeURIComponent('보류')).json();assert.equal(held.total,6);assert.ok(held.rows.every(r=>r['처리상태']==='보류'));
 const excluded=await request('table=excluded&page=999999').json();assert.equal(excluded.total,925);assert.equal(excluded.page,47);assert.equal(excluded.rows.length,5);
 const changes=await request('table=idChanges').json();assert.equal(changes.total,11);
 const logs=await request('table=logs&district='+encodeURIComponent('은평구')).json();assert.ok(logs.total>0);assert.equal(logs.rows.length,20);
 const master=await (await photoGET(new Request('https://example.test/api/archive/photo-research?batch='+summary.datasetId+'&download=1'))).json();assert.equal(master.total,1562);assert.equal(master.rows.length,1562);
 const target=support.targets.find(r=>r['자치구']==='강남구'&&r['법정동']==='신사동');
 const linked=await (await photoGET(new Request('https://example.test/api/archive/photo-research?target='+target['대상ID']))).json();assert.ok(linked.total>=3);assert.ok(linked.rows.every(r=>r.regionLinks.some(l=>l['대상ID']===target['대상ID'])));
});
