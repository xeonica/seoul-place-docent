import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import bundle from '../data/photo-research/bundle.json';
import regions from '../data/seoul-regions.json';
import {filterPhotoResearch, placePhotoResearch, photoResearchUrl} from '../lib/photo-research.ts';
import {GET} from '../app/api/archive/photo-research/route.ts';
import {photoResearchBundle as completeBundle} from '../lib/photo-research-data.ts';

const originalFetch=globalThis.fetch;
globalThis.fetch=async(input,init)=>{
 const url=new URL(input instanceof Request?input.url:String(input));
 if(url.pathname==='/research/seoul-district-collection/photos-index.json.gz'){
  return new Response(readFileSync(new URL('../public/research/seoul-district-collection/photos-index.json.gz',import.meta.url)));
 }
 return originalFetch(input,init);
};
const districtIndex=JSON.parse(gunzipSync(readFileSync(new URL('../public/research/seoul-district-collection/photos-index.json.gz',import.meta.url)),'utf8'));
const searchableBundle={...completeBundle,items:[...completeBundle.items,...districtIndex.items]};
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

test('fifty-six research batches preserve original downloadable bytes and district versus dong scope',()=>{
 assert.equal(bundle.items.length,bundle.meta.recordCount);
 assert.equal(new Set(bundle.items.map(r=>r.id)).size,bundle.items.length);
 assert.equal(bundle.meta.batchCount,bundle.meta.files.length);
 assert.equal(bundle.meta.dongCount,new Set(bundle.meta.files.filter(f=>f.collectionScope==='dong').map(f=>f.district+'|'+f.dong)).size);
 assert.equal(bundle.meta.districtCount,new Set(bundle.meta.files.map(f=>f.district)).size);
 assert.equal(bundle.meta.districtBatchCount,bundle.meta.files.filter(f=>f.collectionScope==='district').length);
 assert.equal(bundle.meta.files.reduce((sum,file)=>sum+file.count,0),bundle.items.length);
 for(const file of bundle.meta.files){
  const bytes=readFileSync(new URL('../public'+file.path,import.meta.url));
  assert.ok(originalBytesMatch(file,bytes),`Original export mismatch: ${file.path}`);
  const rows=bundle.items.filter(r=>r.batchId===file.id);assert.equal(rows.length,file.count);
  assert.ok(rows.every(r=>r.district===file.district&&r.dong===file.dong));
  const district=regions.districts.find(d=>d.name===file.district);assert.ok(district);assert.ok(file.collectionScope==='district' ? file.dong==='' : district.dongs.includes(file.dong));
 }
});

test('accessibility, review and reproduction permissions are independent original fields',()=>{
 assert.equal(bundle.meta.candidateCount,bundle.items.filter(row=>row.candidate).length);assert.equal(bundle.meta.accessUnavailableCount,206);assert.equal(bundle.meta.downloadedPhotoCount,0);
 assert.equal(bundle.meta.previewLinkCount,bundle.items.filter(row=>row.previewUrl).length);assert.equal(bundle.meta.missingSourceUrlCount,bundle.items.filter(row=>!row.sourceUrl).length);
 assert.equal(bundle.meta.sourceUrlCount,new Set(bundle.items.filter(row=>row.sourceUrl).map(row=>row.sourceUrl)).size);
 for(const row of bundle.items){
  assert.equal(row.reviewStatus,row.values['검토상태']);assert.equal(row.relation,row.values['주소관계상태']||'미확인');assert.equal(row.scope,row.values['공간범위']);
  assert.ok(!('verifiedBuilding' in row));assert.ok(!('authorizedThumbnail' in row));
 }
 const unknownRights=bundle.items.find(r=>r.previewUrl&&r.values['썸네일표시가능여부']==='미확인');
 assert.ok(unknownRights);assert.ok(unknownRights.previewUrl);assert.equal(unknownRights.values['썸네일표시가능여부'],'미확인');
});

test('annotated search URLs are separated from source notes without inventing detail pages',()=>{
 const row=bundle.items.find(r=>r.id==='BUKAHYEONDONG-SEODAEMUNGU-001-P040');
 assert.equal(row.sourceUrl,'https://www.archives.go.kr/next/viewMainNew.do');assert.equal(row.sourceLinkType,'portal');
 assert.match(row.values['원문URL'],/통합검색/);assert.ok(row.candidate);
 assert.equal(photoResearchUrl(row.values['원문URL']),row.sourceUrl);
 assert.equal(photoResearchUrl('javascript:alert(1)'),null);assert.equal(photoResearchUrl('https://username:password@example.test/photo'),null);
 assert.equal(photoResearchUrl('미확인'),null);
 assert.equal(bundle.meta.sourceUrlCount,new Set(bundle.items.filter(r=>r.sourceUrl).map(r=>r.sourceUrl)).size);
});

test('shared source pages and repeated preview URLs keep distinct research row identities',()=>{
 const crossBatch=bundle.items.find(r=>r.sourceLinkType==='record'&&bundle.items.some(other=>other.batchId!==r.batchId&&other.sourceKey===r.sourceKey));
 assert.ok(crossBatch);
 const related=filterPhotoResearch(bundle,{source:crossBatch.sourceKey});assert.equal(related.length,crossBatch.sameSourceCount);assert.ok(new Set(related.map(r=>r.batchId)).size>1);
 assert.equal(bundle.meta.repeatedPreviewGroupCount,129);
 assert.ok(bundle.items.some(r=>r.samePreviewCount>1));
 for(const row of related)assert.equal(row.values['자료ID'],row.id);
});

test('combined neighborhood and candidate filters match their supplied scope rather than a homonym',()=>{
 const rows=filterPhotoResearch(bundle,{district:'서대문구',batch:'BUKAHYEONDONG-SEODAEMUNGU-001',review:'candidate'});
 assert.ok(rows.length>0);assert.ok(rows.every(r=>r.dong==='북아현동'&&r.candidate));
 assert.equal(filterPhotoResearch(bundle,{district:'은평구',batch:'BUKAHYEONDONG-SEODAEMUNGU-001'}).length,0);
 assert.equal(filterPhotoResearch(bundle,{query:'존재하지않는사진조사xyz'}).length,0);
 const preview=filterPhotoResearch(bundle,{previewOnly:true});assert.equal(preview.length,bundle.items.filter(r=>r.previewUrl).length);assert.ok(preview.every(r=>r.previewUrl));
 const result=placePhotoResearch(bundle,'서대문구',['북아현동']);assert.equal(result.total,62);assert.ok(result.eligible>0);assert.ok(result.rows.length<=4);assert.ok(result.rows.every(r=>r.dong==='북아현동'&&!r.candidate&&r.relation!=='미확인'));
 assert.equal(placePhotoResearch(bundle,'은평구',['북아현동']).total,0);assert.equal(placePhotoResearch(bundle,'성동구',['성수동1가']).total,0);
});

test('photo API paginates, validates batch IDs, and exports complete filtered original data',async()=>{
 const query=p=>GET(new Request('https://example.test/api/archive/photo-research?'+p));
 const expectedTotal=searchableBundle.items.length;
 const page=await (await query('page=2')).json();assert.equal(page.total,expectedTotal);assert.equal(page.rows.length,20);assert.equal(page.page,2);
 const last=await (await query('page=99999')).json();const expectedLastPage=Math.max(1,Math.ceil(expectedTotal/20));assert.equal(last.page,expectedLastPage);assert.equal(last.rows.length,expectedTotal-(expectedLastPage-1)*20);
 assert.equal((await query('batch=missing')).status,400);
 const response=await query('district='+encodeURIComponent('은평구')+'&download=1');assert.match(response.headers.get('cache-control'),/private/);assert.match(response.headers.get('content-disposition'),/^attachment;/);
 const download=await response.json();const expectedEunpyeong=filterPhotoResearch(searchableBundle,{district:'은평구'}).length;
 assert.equal(download.total,expectedEunpyeong);assert.equal(download.rows.length,expectedEunpyeong);assert.equal(download.provenance.id,completeBundle.meta.id);assert.ok(download.rows.every(r=>r.district==='은평구'||r.regionLinks?.some(link=>link['자치구']==='은평구')));
 const candidate=await (await query('review=candidate')).json();assert.equal(candidate.total,filterPhotoResearch(searchableBundle,{review:'candidate'}).length);
 const place=await (await query('mode=place&district='+encodeURIComponent('서대문구')+'&dong='+encodeURIComponent('북아현동'))).json();assert.equal(place.total,placePhotoResearch(searchableBundle,'서대문구',['북아현동']).total);
});

test('district cumulative files retain missing sequence notices and stay separate from address matches',async()=>{
 const expected=[['YDP-HIST-001','영등포구',343,322,21],['JNR-HIST-001','종로구',1009,1009,0],['JNG-HIST-001','중구',828,828,0],['SDG-HIST-001','성동구',107,107,0]];
 for(const [batch,district,count,visual,cards] of expected){
  const file=bundle.meta.files.find(f=>f.id===batch);assert.equal(file.headerLine,2);assert.match(file.sourceNote,/^#/);
  assert.equal(file.visualRecordCount,visual);assert.equal(file.buildingRecordCount,cards);
  const rows=filterPhotoResearch(bundle,{batch});assert.equal(rows.length,count);assert.ok(rows.every(r=>r.district===district&&r.dong===''&&r.collectionScope==='district'));
  const place=placePhotoResearch(bundle,district,['가상의법정동']);assert.equal(place.total,0);assert.equal(place.rows.length,0);assert.equal(place.districtTotal,count);assert.equal(place.districtBatches.length,1);
  assert.equal(filterPhotoResearch(bundle,{batch,district:'은평구'}).length,0);
  const download=await (await GET(new Request('https://example.test/api/archive/photo-research?batch='+batch+'&download=1'))).json();assert.equal(download.total,count);assert.equal(download.rows.length,count);
 }
 const ydp=bundle.meta.files.find(f=>f.id==='YDP-HIST-001');assert.match(ydp.sourceNote,/P001~P516/);assert.ok(!bundle.items.some(r=>r.id==='YDP-HIST-001-P001'));
 const jongno=bundle.items.find(r=>r.id==='JNR-HIST-001-P001');assert.equal(jongno.sourceLinkType,'collection');assert.equal(jongno.values['기관자료ID'],'2016012504');assert.equal(jongno.mediaType,'사진(현재 모습)');assert.equal(jongno.values['원본보관가능여부'],'불가');assert.equal(jongno.previewUrl,null);
 assert.equal(bundle.meta.visualRecordCount,bundle.items.filter(row=>row.recordType==='visual').length);assert.equal(bundle.meta.buildingRecordCount,bundle.items.filter(row=>row.recordType==='building').length);
});

test('building correction rows preserve original IDs and facts while type and media filters export independently',async()=>{
 const original=bundle.items.find(r=>r.id==='BLDG-004');const correction=bundle.items.find(r=>r.id==='BLDG-004 정정');
 assert.equal(correction.correctionOf,original.id);assert.deepEqual(original.correctionIds,[correction.id]);assert.equal(correction.values['자료ID'],'BLDG-004 정정');assert.notEqual(original.values['내용설명'],correction.values['내용설명']);
 assert.equal(bundle.meta.correctionCount,1);assert.equal(filterPhotoResearch(bundle,{recordType:'building'}).length,21);
 assert.ok(filterPhotoResearch(bundle,{recordType:'building'}).every(r=>r.recordType==='building'&&r.relation==='미확인'));
 const current=filterPhotoResearch(bundle,{mediaType:'사진(현재 모습)'});assert.equal(current.length,bundle.items.filter(r=>r.values['매체유형']==='사진(현재 모습)').length);assert.ok(current.every(r=>r.values['매체유형']==='사진(현재 모습)'));
 const download=await (await GET(new Request('https://example.test/api/archive/photo-research?type=building&batch=YDP-HIST-001&download=1'))).json();assert.equal(download.total,21);assert.equal(download.rows.length,21);assert.equal(download.filters.recordType,'building');
 const media=await (await GET(new Request('https://example.test/api/archive/photo-research?media='+encodeURIComponent('사진(현재 모습)')))).json();assert.equal(media.total,current.length);
});

test('Seongdong collection preserves all 107 raw rows and separates bridge construction dates from unverified photograph dates',async()=>{
 const rows=filterPhotoResearch(bundle,{batch:'SDG-HIST-001'});assert.equal(rows.length,107);
 assert.equal(new Set(rows.map(r=>r.values['기관자료ID'])).size,107);assert.equal(new Set(rows.map(r=>r.sourceUrl)).size,4);
 assert.ok(rows.every(r=>r.mediaType==='사진(현재 모습)'&&r.reviewStatus==='원문 확인·검토 대기'&&r.sourceLinkType==='collection'&&r.previewUrl===null));
 assert.ok(rows.every(r=>r.values['원본보관가능여부']==='불가'&&r.values['썸네일표시가능여부']==='미확인'));
 const bridge=rows.filter(r=>r.values['촬영·제작일']==='1979.10.');assert.equal(bridge.length,32);
 assert.ok(bridge.every(r=>r.metadataWarnings.length===1&&r.metadataWarnings[0].includes('최초 건설 시기')&&r.metadataWarnings[0].includes('실제 촬영일')));
 assert.ok(rows.filter(r=>r.values['촬영·제작일']!=='1979.10.').every(r=>!r.metadataWarnings));
 const selected=placePhotoResearch(bundle,'성동구',['성수동1가']);assert.equal(selected.total,0);assert.equal(selected.districtTotal,107);assert.equal(selected.districtBatches[0].id,'SDG-HIST-001');
 assert.equal(placePhotoResearch(bundle,'강남구',['성수동1가']).districtTotal,0);
 const response=await (await GET(new Request('https://example.test/api/archive/photo-research?batch=SDG-HIST-001&download=1'))).json();assert.equal(response.total,107);assert.deepEqual(response.rows.map(r=>r.values),rows.map(r=>r.values));
});

test('Nowon shares one unmodified CSV across five dong batches and preserves common-file row numbers',async()=>{
 const expected=[['월계동',19],['공릉동',18],['하계동',10],['중계동',12],['상계동',20]];
 const rows=bundle.items.filter(row=>row.id.startsWith('NOWON-'));
 assert.equal(rows.length,79);assert.equal(new Set(rows.map(row=>row.id)).size,79);
 assert.deepEqual(rows.map(row=>row.dataRow).sort((a,b)=>a-b),Array.from({length:79},(_,i)=>i+1));
 const files=bundle.meta.files.filter(file=>file.id.startsWith('NOWON-'));
 assert.equal(new Set(files.map(file=>file.path)).size,1);assert.equal(new Set(files.map(file=>file.sha256)).size,1);
 assert.equal(new Set(files.map(file=>file.path)).size,1);
 for(const [dong,count] of expected){
  const batch='NOWON-'+dong+'-001', file=files.find(file=>file.id===batch);
  assert.equal(file.count,count);assert.equal(file.sourceFileRecordCount,79);assert.equal(file.headerLine,1);
  assert.equal(file.filename,'NOWON-HISTORY-PHOTOS.csv');assert.match(file.sourceNote,/5개 동의 79행/);
  const selected=filterPhotoResearch(bundle,{district:'노원구',dong,batch});assert.equal(selected.length,count);
  assert.ok(selected.every(row=>row.dong===dong&&row.collectionScope==='dong'&&row.values['관련주소ID']==='미연결'));
  const place=placePhotoResearch(bundle,'노원구',[dong]);assert.equal(place.total,count);assert.equal(place.batches[0].id,batch);
  assert.ok(place.rows.every(row=>!row.candidate&&row.relation!=='미확인'));
  assert.equal(placePhotoResearch(bundle,'도봉구',[dong]).total,0);
  const params=new URLSearchParams({batch,download:'1'});
  const download=await (await GET(new Request('https://example.test/api/archive/photo-research?'+params))).json();
  assert.equal(download.total,count);assert.deepEqual(download.rows.map(row=>row.values),selected.map(row=>row.values));
 }
 assert.equal(rows.filter(row=>row.candidate).length,5);assert.equal(rows.filter(row=>row.previewUrl).length,78);
 assert.equal(rows.filter(row=>row.mediaType==='항공사진').length,7);assert.equal(rows.filter(row=>row.mediaType==='지도').length,1);
 const historical=rows.find(row=>row.id==='NOWON-상계동-001-P020');
 assert.equal(historical.district,'노원구');assert.match(historical.values['원문장소표기'],/도봉구 상계동/);
 const map=rows.find(row=>row.id==='NOWON-하계동-001-P010');assert.ok(map.candidate);assert.equal(map.previewUrl,null);
 assert.match(map.values['추가확인사항'],/제작일로 사용하지 않음/);
});

test('neighborhoods resolve only in their supplied district and preserve candidate relations',()=>{
 const expected=[['서대문구','대신동',37],['은평구','응암동',37],['은평구','갈현동',21],['은평구','구산동',24],['서대문구','합동',35],['서대문구','홍은동',20],['서대문구','홍제동',62],['서대문구','현저동',64],['은평구','증산동',33],['은평구','진관동',40],['서대문구','미근동',39],['서대문구','냉천동',41],['서대문구','남가좌동',20],['은평구','녹번동',22],['서대문구','옥천동',64],['서대문구','신촌동',61],['은평구','신사동',24],['은평구','수색동',39],['은평구','역촌동',27],['서대문구','영천동',55],['서대문구','연희동',20]];
 for(const [district,dong,count] of expected){
  const result=placePhotoResearch(bundle,district,[dong]);assert.equal(result.total,count);assert.equal(result.batches.length,1);assert.equal(result.batches[0].dong,dong);
  assert.equal(placePhotoResearch(bundle,district==='은평구'?'서대문구':'은평구',[dong]).total,0);
  assert.ok(result.rows.every(row=>!row.candidate&&row.relation!=='미확인'));
 }
 const row=bundle.items.find(r=>r.id==='EUNGAMDONG-EUNPYEONGGU-001-P001');assert.equal(row.relation,'부지 일치 후보');assert.equal(row.values['관련주소ID'],'미연결');
 assert.equal(placePhotoResearch(bundle,'강남구',['신사동']).total,0);assert.equal(placePhotoResearch(bundle,'은평구',['신사동']).total,24);
});

test('Mapo research targets preserve the neighboring district and qualified original place labels',async()=>{
 const expected=[['공덕동',21],['구수동',2],['당인동',24],['대흥동',21],['도화동',20],['동교동',18],['아현동',20],['창전동',12],['하중동',20],['합정동',21],['신수동',21],['신정동',17],['연남동',20],['염리동',23],['용강동',20],['토정동',9]];
 for(const [dong,count] of expected){
  const place=placePhotoResearch(bundle,'마포구',[dong]);assert.equal(place.total,count);assert.equal(place.batches.length,1);
  assert.equal(placePhotoResearch(bundle,'서대문구',[dong]).total,0);
  assert.ok(place.rows.every(row=>!row.candidate&&row.relation!=='미확인'));
 }
 const adjacent=bundle.items.find(r=>r.id==='MAPO-아현동-001-P004');
 assert.equal(adjacent.district,'마포구');assert.equal(adjacent.values['자치구'],'서대문구');
 assert.match(adjacent.values['원문장소표기'],/서대문구 북아현동/);assert.match(adjacent.values['주소관계근거'],/경계를 넘어선 주변 자료/);
 const distantView=bundle.items.find(r=>r.id==='MAPO-도화동-001-P001');
 assert.equal(distantView.values['자치구'],'마포구（대상지 기준）');assert.match(distantView.values['원문장소표기'],/용산 나진빌딩/);
 const unknown=bundle.items.filter(r=>r.batchId==='MAPO-공덕동-001'&&r.relation==='미확인');assert.equal(unknown.length,5);
 const place=placePhotoResearch(bundle,'마포구',['공덕동']);assert.equal(place.eligible,16);
 const response=await GET(new Request('https://example.test/api/archive/photo-research?district='+encodeURIComponent('마포구')+'&download=1'));
 const download=await response.json();const expectedMapo=filterPhotoResearch(searchableBundle,{district:'마포구'}).length;
 assert.equal(download.total,expectedMapo);assert.equal(download.rows.length,expectedMapo);
 assert.equal(download.rows.find(r=>r.id===adjacent.id).values['자치구'],'서대문구');
 const candidate=filterPhotoResearch(bundle,{district:'마포구',review:'candidate'});assert.deepEqual(candidate.map(r=>r.id),['MAPO-대흥동-001-P021','MAPO-신수동-001-P021','MAPO-토정동-001-P009']);
 assert.equal(placePhotoResearch(bundle,'양천구',['신정동']).total,0);assert.equal(placePhotoResearch(bundle,'마포구',['신정동']).total,17);
 assert.ok(filterPhotoResearch(bundle,{batch:'MAPO-신정동-001'}).every(r=>r.relation==='주변 관련'));
});
