import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {archiveApprovedHistoricalFacts} from '../lib/archive-db.ts';
import {HistoricalFactSchema,HistoricalPlaceNameSchema,historicalFactTourKind,historicalPlaceNamesForRegion} from '../lib/historical-records.ts';
import {seedArchive} from '../lib/archive-seed.ts';
import {saveArchiveSource,addArchivePassage} from '../lib/archive-db.ts';
import {listPassageReviewTargets,reviewArchivePassage,reviewDimensions} from '../lib/archive-passage-review.ts';

function database(){
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
 for(const n of readdirSync(new URL('../drizzle/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())sql.exec(readFileSync(new URL('../drizzle/'+n,import.meta.url),'utf8'));
 return {sql,prepare(q){return {values:[],bind(...v){this.values=v;return this;},async first(){return sql.prepare(q).get(...this.values)||null;},async all(){return {results:sql.prepare(q).all(...this.values)};},async run(){return sql.prepare(q).run(...this.values);}};},async batch(items){sql.exec('BEGIN');try{const out=[];for(const x of items)out.push(await x.run());sql.exec('COMMIT');return out;}catch(e){sql.exec('ROLLBACK');throw e;}}};
}

test('regional facts query requires approved current source, passage and bounded Seoul region links',async()=>{
 let bound=[];
 const db={prepare(sql){
  assert.match(sql,/f\.review_status='approved'/);assert.match(sql,/p\.review_status='content_checked'/);assert.match(sql,/s\.review_status='content_checked'/);assert.match(sql,/checked\.status='content_checked'/);assert.match(sql,/checked\.snapshot_json=/);
  assert.match(sql,/v\.version=s\.current_version/);assert.match(sql,/r\.level='legal_dong'/);assert.match(sql,/r\.level='district'/);assert.match(sql,/LIMIT 60/);
  return {bind(...values){
   bound=values;
   return {all:async()=>({results:[{id:'fact-1',title:'옥수동 지명',description:'출처로 승인한 설명',scope:'toponymy',timeLabel:'1960년대',startYear:1960,endYear:1969,sourceId:'src-1',sourceTitle:'지명자료',sourceUrl:'https://archive.example/name',institution:'기록관',publicationDate:'2024-01-02',passageId:'pass-1',passageText:'검토한 원문 또는 요약 문단',passageTextKind:'paraphrase',regionId:'dong-seongdong-oksu',regionLevel:'legal_dong',regionRelation:'exact_name',reviewStatus:'approved'}]})};
  }};
 }};
 const result=await archiveApprovedHistoricalFacts(db,'성동구','옥수동');
 assert.deepEqual(bound,['성동구','옥수동','성동구']);assert.equal(result.status,'ready');assert.equal(result.records.length,1);assert.equal(result.records[0].relationScope,'dong_context');
 assert.equal(HistoricalFactSchema.safeParse(result.records[0]).success,true);assert.equal(historicalFactTourKind('toponymy'),'toponymy');
 const names=historicalPlaceNamesForRegion('성동구','성수동1가');assert.ok(names.length>0);assert.ok(names.every(name=>HistoricalPlaceNameSchema.safeParse(name).success&&name.currentDongType==='unresolved'&&name.spatialRelation==='historical_area_candidate'));
});

test('missing D1 and query failure never masquerade as an empty, validated archive',async()=>{
 const unavailable=await archiveApprovedHistoricalFacts(undefined,'성동구','옥수동');assert.equal(unavailable.status,'database_unavailable');
 const failed=await archiveApprovedHistoricalFacts({prepare(){throw new Error('offline')}},'성동구','옥수동');assert.equal(failed.status,'query_failed');assert.deepEqual(failed.records,[]);
});

test('real SQLite archive schema returns only a current, content-checked, approved regional fact',async()=>{
 const db=database();await seedArchive(db,'fixture');
 const source={title:'옥수동 지명 원문 대조',institution:'서울특별시',url:'https://www.seoul.go.kr/archive/oksu-fixture',kind:'web',summary:'옥수동 지역 지명 근거',publicationDate:'2024-01-02',subjectPeriod:'조선 후기',rights:'unknown',rightsUrl:'',rightsNote:'원문은 링크로 제공',storageAllowed:false,reuseAllowed:false,reviewStatus:'content_checked',regionIds:['dong-성동구-옥수동'],changeNote:'검증 fixture'};
 const saved=await saveArchiveSource(db,source,'fixture'),passage=await addArchivePassage(db,saved.id,{text:'옥수동 이름의 유래를 설명하는 검토된 지역 문단.',locator:'옥수동 > 지명 유래',textKind:'paraphrase'},'fixture');
 await db.prepare('INSERT INTO archive_passage_regions (id,passage_id,region_id,label,relation,basis) VALUES (?,?,?,?,?,?)').bind('region-link-1',passage.id,'dong-성동구-옥수동','옥수동','exact_name','공식 동명 연결').run();
 const target=(await listPassageReviewTargets(db,new URLSearchParams())).items.find(x=>x.id===passage.id),checks=Object.fromEntries(reviewDimensions.map(key=>[key,{result:'checked',note:'확인용 fixture'}]));
 await reviewArchivePassage(db,{passageId:passage.id,expectedRevision:0,expectedFingerprint:target.fingerprint,status:'content_checked',evidence:{sourceUrl:source.url,sourceLocator:'옥수동 > 지명 유래',observedAt:new Date().toISOString(),sourceHash:null,classification:'factual',spatialScope:'neighborhood',scopeNote:'옥수동 맥락이며 특정 주소 직접 근거가 아니다.',summary:'검토 테스트',checks}},'fixture-reviewer');
 await db.prepare('INSERT INTO archive_facts (id,source_id,passage_id,title,description,time_label,start_year,end_year,scope,review_status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').bind('fact-approved',saved.id,passage.id,'옥수동 명칭','옥수동의 명칭을 다룬 승인 재서술','조선 후기',1700,1899,'toponymy','approved',new Date().toISOString()).run();
 const found=await archiveApprovedHistoricalFacts(db,'성동구','옥수동');assert.equal(found.records.length,1);assert.equal(found.records[0].id,'fact-approved');assert.equal(found.records[0].passageText, '옥수동 이름의 유래를 설명하는 검토된 지역 문단.');assert.equal(found.records[0].relationScope,'dong_context');
 await db.prepare('UPDATE archive_passages SET text=? WHERE id=?').bind('수정되어 검토가 만료된 문단',passage.id).run();
 const stale=await archiveApprovedHistoricalFacts(db,'성동구','옥수동');assert.equal(stale.records.length,0);
});
