import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeClosedBuildings, normalizeParcel, normalizePublications, parcelNumber} from '../lib/place-context.ts';
import {photoResearchThumbnail, placePhotoResearch} from '../lib/photo-research.ts';
import bundle from '../data/photo-research/bundle.json';
const address = {siNm:'서울특별시',sggNm:'중구',emdNm:'태평로1가',admCd:'1114010300',roadAddr:'서울특별시 중구 세종대로 110',jibunAddr:'서울특별시 중구 태평로1가 31',bdMgtSn:'',bdNm:'서울시청',lnbrMnnm:'31',lnbrSlno:'0',mtYn:'0',zipNo:''};
test('closed records keep current parcel matching separate from building identity, and reject expired authorization',()=>{
 const row={sigunguCd:'11140',bjdongCd:'10300',platGbCd:'0',bun:'0031',ji:'0000',mgmBldrgstPk:'closed-1',bldNm:'과거 대장'};
 const data=normalizeClosedBuildings({response:{header:{resultCode:'00'},body:{items:{item:[row,{...row,bun:'0032'}]},totalCount:2}}},address);
 assert.deepEqual(data.items.map(r=>r.id),['closed-1']);assert.equal(data.total,2);
 assert.throws(()=>normalizeClosedBuildings({response:{header:{resultCode:'31'}}},address),e=>e.code==='CLOSED_31');
});
test('parcel polygons require the exact PNU, finite Seoul coordinates, and preserve holes',()=>{
 const pnu=parcelNumber(address);assert.equal(pnu,'1114010300100310000');assert.equal(parcelNumber({...address,mtYn:'1'}),'1114010300200310000');
 const ring=[[126.97,37.56],[126.98,37.56],[126.98,37.57],[126.97,37.56]];
 const body={response:{status:'OK',result:{featureCollection:{features:[{properties:{pnu,addr:'서울특별시 중구'},geometry:{type:'Polygon',coordinates:[ring,ring]}}]}}}};
 assert.equal(normalizeParcel(body,pnu).polygons[0].length,2);
 assert.throws(()=>normalizeParcel(body,'other'),e=>e.code==='PARCEL_MISMATCH');
 const malformed=structuredClone(body);malformed.response.result.featureCollection.features[0].geometry.coordinates[0][0][0]=Infinity;
 assert.throws(()=>normalizeParcel(malformed,pnu),e=>e.code==='PARCEL_GEOMETRY');
});
test('publication normalization strips markup and only opens official museum ebook URLs',()=>{
 const source={SEQ:'1',TITLE:'<b>성수동</b>',EBOOKURL:' https://museum.seoul.go.kr/CHM_HOME/ebook/ecatalog.jsp?Dir=1 ',PUBLISHDT:'2020년',CONTENTS:'<script>ignored()</script>지역조사'};
 const r=normalizePublications({HisMuseumPublica:{RESULT:{CODE:'INFO-000'},list_total_count:2,row:[source,{...source,SEQ:'2',EBOOKURL:'javascript:alert(1)'}]}});
 assert.equal(r.items[0].title,'성수동');assert.equal(r.items[0].description,'지역조사');assert.match(r.items[0].ebookUrl,/museum.seoul.go.kr/);assert.equal(r.items[1].ebookUrl,null);
 assert.throws(()=>normalizePublications({RESULT:{CODE:'INFO-100'}}),e=>e.code==='PUBLICATIONS_INFO-100');
});
test('a public image URL alone cannot enable a thumbnail, and unknown permissions stay unchanged',()=>{
 const allowed=bundle.items.find(r=>r.previewUrl&&r.values['사이트표시가능여부']==='가능'&&r.values['썸네일표시가능여부']==='가능');
 assert.ok(photoResearchThumbnail(allowed));
 for(const value of ['미확인','불가',''])assert.equal(photoResearchThumbnail({...allowed,values:{...allowed.values,'썸네일표시가능여부':value}}),null);
 assert.equal(photoResearchThumbnail({...allowed,previewUrl:'https://user:password@example.test/image.jpg'}),null);
});
test('visual galleries paginate in place, reset invalid pages, and label district fallback without cross-district matching',()=>{
 const first=placePhotoResearch(bundle,'서대문구',['북아현동']);const second=placePhotoResearch(bundle,'서대문구',['북아현동'],2);
 assert.equal(first.visuals.scope,'dong');assert.equal(first.visuals.rows.length,6);assert.equal(second.visuals.page,2);
 assert.ok(first.visuals.rows.every(r=>r.district==='서대문구'&&r.dong==='북아현동'&&!r.candidate));
 assert.ok(!second.visuals.rows.some(r=>first.visuals.rows.some(a=>a.id===r.id)));
 assert.equal(placePhotoResearch(bundle,'서대문구',['북아현동'],NaN).visuals.page,1);
 const fallback=placePhotoResearch(bundle,'성동구',['가상동']);assert.equal(fallback.visuals.scope,'district');assert.ok(fallback.visuals.rows.every(r=>r.district==='성동구'&&r.recordType==='visual'));
 assert.equal(placePhotoResearch(bundle,'강남구',['북아현동']).visuals.total,0);
});
