import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {registerArchivePlace,recordArchiveSourcePlaceCandidate,reviewArchivePlaceIdentity,reviewArchiveSourcePlaceLink} from '../lib/archive-place-link.ts';
import {archivePlaceEvidenceLinks} from '../lib/archive-db.ts';

function dbFixture(){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec("PRAGMA foreign_keys=ON; CREATE TABLE archive_sources(id TEXT PRIMARY KEY,url TEXT NOT NULL,institution TEXT NOT NULL,rights TEXT NOT NULL,review_status TEXT NOT NULL,title TEXT NOT NULL DEFAULT '',kind TEXT NOT NULL DEFAULT 'web',publication_date TEXT NOT NULL DEFAULT '');");
 sqlite.exec(readFileSync(new URL('../drizzle/0006_tired_jack_flag.sql',import.meta.url),'utf8'));
 sqlite.exec(readFileSync(new URL('../drizzle/0007_tearful_the_renegades.sql',import.meta.url),'utf8'));
 sqlite.exec(readFileSync(new URL('../drizzle/0008_careful_place_review.sql',import.meta.url),'utf8'));
 return {sqlite,prepare(sql){let params=[];const stmt=sqlite.prepare(sql);const wrap=()=>({bind(...values){params=values;return wrap();},async run(){return stmt.run(...params);},async first(){return stmt.get(...params)??null;},async all(){return {results:stmt.all(...params)};}});return wrap();}};
}
test('additive archive place pipeline stores candidate evidence and append-only review without mutating source',async()=>{
 const db=dbFixture();
 db.sqlite.prepare('INSERT INTO archive_sources (id,url,institution,rights,review_status) VALUES (?,?,?,?,?)').run('news-1','https://news.example/article/1','테스트 언론','unknown','pending');
 const place=await registerArchivePlace(db,{id:'place-row-1',placeId:'PLACE-1',placeType:'building',name:'검증 대상 건물',district:'마포구',legalDong:'당인동',buildingManagementNumber:'1120010500100210000021801',identitySourceUrl:'https://www.gov.example/building/BM-001'},'reviewer');
 assert.equal(place.identityReviewStatus,'pending');
 const preReview=await recordArchiveSourcePlaceCandidate(db,{id:'link-pre-review',sourceId:'news-1',placeId:'PLACE-1',declaredRelation:'exact_site',sourceBuildingManagementNumber:'1120010500100210000021801',matchEvidence:'원문 기사 본문에 같은 건물관리번호가 명시됨',evidenceId:'news-1#paragraph-2'},'reviewer');
 assert.equal(preReview.relation,'uncertain');
 await assert.rejects(()=>reviewArchiveSourcePlaceLink(db,{id:'review-pre-review',linkId:'link-pre-review',status:'approved',relation:'exact_site',originalChecked:true,rightsStatus:'unknown',evidence:'주소와 관리번호 대조를 확인하고 직접 연결로 승인'},'reviewer'),/EXACT_SITE_APPROVAL_REQUIRES_VERIFIED_IDENTITY_AND_ORIGINAL/);
 const identityReview=await reviewArchivePlaceIdentity(db,{id:'identity-review-1',placeId:'PLACE-1',status:'verified',evidence:'공공 건축물대장에서 도로명주소와 건물관리번호를 대조'},'reviewer');
 assert.equal(identityReview.revision,1);
 const candidate=await recordArchiveSourcePlaceCandidate(db,{id:'link-1',sourceId:'news-1',placeId:'PLACE-1',declaredRelation:'exact_site',sourceBuildingManagementNumber:'1120010500100210000021801',matchEvidence:'원문 기사 본문에 같은 건물관리번호가 명시됨',evidenceId:'news-1#paragraph-3'},'reviewer');
 assert.equal(candidate.relation,'exact_site');assert.equal(candidate.reviewStatus,'pending');assert.equal(candidate.originalChecked,false);assert.equal(candidate.rightsStatus,'unknown');
 const lookup=await archivePlaceEvidenceLinks(db,'1120010500100210000021801');assert.equal(lookup.status,'ready');assert.equal(lookup.items.length,2);assert.equal(lookup.items.find(x=>x.linkId==='link-1').usableAsDirectEvidence,false);
 await assert.rejects(()=>reviewArchiveSourcePlaceLink(db,{id:'review-bad',linkId:'link-1',status:'approved',relation:'exact_site',originalChecked:false,rightsStatus:'unknown',evidence:'원문 대조를 수행했다고 확인'},'reviewer'),/EXACT_SITE_APPROVAL_REQUIRES_VERIFIED_IDENTITY_AND_ORIGINAL/);
 const review=await reviewArchiveSourcePlaceLink(db,{id:'review-1',linkId:'link-1',status:'approved',relation:'exact_site',originalChecked:true,rightsStatus:'unknown',evidence:'원문 주소와 건물관리번호를 확인했으며 공간 일치를 승인'},'reviewer');
 assert.equal(review.revision,1);assert.equal(db.sqlite.prepare('SELECT review_status,rights FROM archive_sources WHERE id=?').get('news-1').review_status,'pending');
 assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM archive_source_place_reviews').get().n,1);
 const approved=await archivePlaceEvidenceLinks(db,'1120010500100210000021801');assert.equal(approved.items.find(x=>x.linkId==='link-1').usableAsDirectEvidence,true);
 await reviewArchivePlaceIdentity(db,{id:'identity-review-2',placeId:'PLACE-1',status:'rejected',evidence:'재검토 결과 주소 식별 일치를 확인할 수 없어 검증을 철회'},'reviewer');
 const revoked=await archivePlaceEvidenceLinks(db,'1120010500100210000021801');assert.equal(revoked.items.find(x=>x.linkId==='link-1').usableAsDirectEvidence,false);
 await assert.rejects(()=>registerArchivePlace(db,{id:'place-row-2',placeId:'PLACE-1',placeType:'building',name:'다른 건물'},'reviewer'));
 db.sqlite.close();
});
test('identity verification requires a valid official evidence URL and coordinates are bounded',async()=>{
 const db=dbFixture();
 await assert.rejects(()=>registerArchivePlace(db,{id:'p1',placeId:'P1',placeType:'building',name:'x',buildingManagementNumber:'BM',identitySourceUrl:'javascript:alert(1)'},'reviewer'),/PLACE_IDENTITY_SOURCE_INVALID/);
 await assert.rejects(()=>registerArchivePlace(db,{id:'p2',placeId:'P2',placeType:'building',name:'x',latitude:91,longitude:127},'reviewer'),/PLACE_COORDINATE_INVALID/);
 db.sqlite.close();
});
test('PNU links stay parcel-level and can be retrieved without a building-management number',async()=>{
 const db=dbFixture();db.sqlite.prepare('INSERT INTO archive_sources (id,url,institution,rights,review_status) VALUES (?,?,?,?,?)').run('photo-1','https://photo.example/item/1','서울기록원','unknown','pending');
 const place=await registerArchivePlace(db,{id:'parcel-row-1',placeId:'PARCEL-1',placeType:'parcel',name:'확인된 필지',pnu:'1111010100100010000',identitySourceUrl:'https://www.gov.example/parcel/1'},'reviewer');
 await reviewArchivePlaceIdentity(db,{id:'parcel-identity-1',placeId:place.placeId,status:'verified',evidence:'공식 토지대장에서 PNU와 필지 주소를 대조'},'reviewer');
 const candidate=await recordArchiveSourcePlaceCandidate(db,{id:'parcel-link-1',sourceId:'photo-1',placeId:place.placeId,declaredRelation:'exact_site',sourcePnu:'1111010100100010000',matchEvidence:'사진 원문 설명에서 동일 PNU의 부지 사용 이력을 확인',evidenceId:'photo-1#metadata'},'reviewer');
 assert.equal(candidate.relation,'parcel');assert.equal(candidate.matchMethod,'pnu');
 await reviewArchiveSourcePlaceLink(db,{id:'parcel-review-1',linkId:'parcel-link-1',status:'approved',relation:'parcel',originalChecked:true,rightsStatus:'unknown',evidence:'원문 설명과 공식 필지 식별정보를 대조'},'reviewer');
 const lookup=await archivePlaceEvidenceLinks(db,{pnu:'1111010100100010000'});assert.equal(lookup.status,'ready');assert.equal(lookup.items.length,1);assert.equal(lookup.items[0].usableAsDirectEvidence,true);
 db.sqlite.close();
});
test('district-only source and place agreement remains context and never a direct match',async()=>{
 const db=dbFixture();db.sqlite.prepare('INSERT INTO archive_sources (id,url,institution,rights,review_status) VALUES (?,?,?,?,?)').run('article-ctx','https://news.example/context/1','언론사','unknown','pending');
 const place=await registerArchivePlace(db,{id:'district-row',placeId:'DISTRICT-MAPO',placeType:'district',name:'마포구',district:'마포구'},'reviewer');
 const candidate=await recordArchiveSourcePlaceCandidate(db,{id:'district-link',sourceId:'article-ctx',placeId:place.placeId,sourceDistrict:'마포구',matchEvidence:'자료 색인과 장소 모두 마포구라는 행정구역만 확인',evidenceId:'article-ctx#metadata'},'reviewer');
 assert.equal(candidate.relation,'district_context');assert.equal(candidate.approvable,false);assert.equal(candidate.matchMethod,'district_only');db.sqlite.close();
});
