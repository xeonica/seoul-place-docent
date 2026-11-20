import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import bundle from '../data/document-research/bundle.json';
import {filterDocumentRows, documentContext, documentPlaceResearch, safeDocumentUrl} from '../lib/document-research.ts';
import {GET} from '../app/api/archive/document-research/route.ts';

test('all eight accumulated tables have matching download counts and hashes', () => {
 assert.deepEqual(bundle.meta.counts, {targets:493,sources:279,links:1013,claims:1070,drafts:53,timeline:857,leads:297,progress:42});
 assert.equal(bundle.meta.totalRecords,4104);
 for(const file of bundle.meta.files){
  const bytes=readFileSync(new URL('../public'+file.path,import.meta.url));
  assert.equal(bytes.length,file.sizeBytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256);
  assert.equal(bundle.tables[file.key].length,file.count);
  assert.equal(new Set(bundle.tables[file.key].map(r=>r.id)).size,file.count);
 }
 assert.equal(new Set(bundle.tables.sources.map(r=>r.values['원문URL'])).size,147);
 assert.equal(bundle.meta.sourceUrlCount,147);
 assert.equal(bundle.targets.filter(r=>r.level==='법정동').length,467);
});

test('all target, source and claim references resolve without modifying source review statuses', () => {
 const sources=new Set(bundle.tables.sources.map(r=>r.id));
 const claims=new Set(bundle.tables.claims.map(r=>r.id));
 const targets=new Set(bundle.targets.map(t=>t.id));
 for(const table of Object.values(bundle.tables))for(const row of table){
  for(const id of row.sourceIds)assert.ok(sources.has(id));
  for(const id of row.evidenceIds)assert.ok(claims.has(id));
  for(const id of row.targetIds)assert.ok(targets.has(id));
  if(row.values['검토상태'])assert.equal(row.status,row.values['검토상태']);
 }
 assert.equal(bundle.tables.sources.filter(r=>r.status==='원문 미확인 후보').length,3);
 const draft=bundle.tables.drafts.find(r=>r.id==='SEOUL');
 assert.equal(draft.status,'책임자검토대기');
 assert.equal(documentContext(bundle,[draft]).claims.length,38);
 assert.equal(filterDocumentRows(bundle,'claims',{target:'SEOUL'}).length,39);
});

test('six inconsistent place links remain inspectable but cannot populate an automatic region match', () => {
 const flagged=filterDocumentRows(bundle,'links',{issuesOnly:true});
 assert.equal(flagged.length,6);
 assert.equal(bundle.meta.invalidLinkCount,6);
 for(const row of flagged){assert.equal(row.targetIds.length,0);assert.ok(row.values['대상ID']);}
 const wrong=bundle.tables.links.find(r=>r.id==='R000039');
 assert.equal(wrong.values['동·권역명'],'논현동');
 assert.equal(wrong.values['대상ID'],'GU-001-DONG-003');
 assert.ok(!filterDocumentRows(bundle,'links',{target:'GU-001-DONG-003'}).some(r=>r.id===wrong.id));
 const valid=filterDocumentRows(bundle,'links',{target:'GU-001-DONG-003'});
 assert.ok(valid.length>0);assert.ok(valid.every(r=>r.values['동·권역명']==='대치동'));
});

test('combined filters and multi-source evidence lead to the correct original records', () => {
 const draft=filterDocumentRows(bundle,'drafts',{district:'강동구',query:'천호동',target:'GU-002-DONG-009'})[0];
 assert.equal(draft.values['동·권역명'],'천호동');
 const claim=filterDocumentRows(bundle,'claims',{evidence:'E000002'})[0];
 assert.ok(claim.sourceIds.length>1);
 const context=documentContext(bundle,[claim]);
 assert.ok(claim.sourceIds.every(id=>context.sources.some(s=>s.id===id)));
 assert.equal(filterDocumentRows(bundle,'drafts',{query:'존재하지않는기록xyz'}).length,0);
 assert.equal(filterDocumentRows(bundle,'leads',{query:'07-0001'}).length,1);
});

test('address context requires the exact district and legal dong and labels district fallback', () => {
 const local=documentPlaceResearch(bundle,'강동구',['천호동']);
 assert.equal(local.scope,'legal_dong');assert.equal(local.drafts[0].values['동·권역명'],'천호동');
 assert.ok(local.timeline.length>0);assert.ok(local.timeline.every(r=>r.values['동·권역명']==='천호동'));
 const fallback=documentPlaceResearch(bundle,'성동구',['성수동1가']);
 assert.equal(fallback.scope,'district');assert.equal(fallback.drafts[0].values['동·권역명'],'성동구 전체');
 const wrongDistrict=documentPlaceResearch(bundle,'강남구',['미아동']);
 assert.equal(wrongDistrict.exactTargets.length,0);assert.equal(wrongDistrict.scope,'district');
 assert.ok(!wrongDistrict.drafts.some(r=>r.values['동·권역명']==='미아동'));
});

test('API paginates, validates table/target, and exports all rows matching the current filters',async()=>{
 const query=p=>GET(new Request('https://example.test/api/archive/document-research?'+p));
 const paged=await query('table=claims&page=2').json();assert.equal(paged.total,1070);assert.equal(paged.rows.length,20);assert.equal(paged.page,2);assert.notEqual(paged.rows[0].id,bundle.tables.claims[0].id);
 const capped=await query('table=claims&page=99999').json();assert.equal(capped.page,54);assert.equal(capped.rows.length,10);
 assert.equal(query('table=invalid').status,400);assert.equal(query('target=invalid').status,400);assert.equal(query('mode=place&district=부산').status,400);
 const response=query('table=timeline&district=강남구&download=1');assert.match(response.headers.get('content-disposition'),/^attachment;/);assert.match(response.headers.get('cache-control'),/private/);
 const exported=await response.json();assert.ok(exported.rows.length>20);assert.ok(exported.rows.every(r=>r.district==='강남구'));assert.equal(exported.provenance.id,bundle.meta.id);
 assert.equal(safeDocumentUrl('javascript:alert(1)'),null);assert.equal(safeDocumentUrl('미확인'),null);assert.equal(safeDocumentUrl('https://www.seoul.go.kr'),'https://www.seoul.go.kr/');
});
