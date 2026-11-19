import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {saveArchiveSource,addArchivePassage,requireArchiveAdmin} from '../lib/archive-db.ts';
import {listPassageReviewTargets,reviewArchivePassage,reviewDimensions} from '../lib/archive-passage-review.ts';
import {reviewEvidence,reviewedEvidence,evidenceReviewTarget} from '../lib/reviewed-evidence.ts';
import {evidencePlace,normalizePlaceText,normalizeRelation} from '../lib/evidence-place.ts';
import {validateEvidenceClaims,prepareEvidence} from '../lib/place-evidence.ts';
import {articleCandidates} from '../lib/article-evidence.ts';

function database(){
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
 for(const n of readdirSync(new URL('../drizzle/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())sql.exec(readFileSync(new URL('../drizzle/'+n,import.meta.url),'utf8'));
 return {sql,prepare(q){return {values:[],bind(...v){this.values=v;return this;},async first(){return sql.prepare(q).get(...this.values)||null;},async all(){return {results:sql.prepare(q).all(...this.values)};},async run(){return sql.prepare(q).run(...this.values);}};},async batch(items){sql.exec('BEGIN');try{const out=[];for(const x of items)out.push(await x.run());sql.exec('COMMIT');return out;}catch(e){sql.exec('ROLLBACK');throw e;}}};
}
// These are mechanical fixtures, not live JUSO identification/operational facts.
const addresses=[
 {roadAddr:'서울특별시 강동구 강동대로 207',jibunAddr:'서울특별시 강동구 성내동 448-11',sggNm:'강동구',emdNm:'성내동',bdNm:'윤선생빌딩',admCd:'1174010800',lnbrMnnm:'448',lnbrSlno:'11'},
 {roadAddr:'서울특별시 성동구 마장로42길 16',jibunAddr:'서울특별시 성동구 마장동 1',sggNm:'성동구',emdNm:'마장동',bdNm:'시험 건물',admCd:'1120010500',lnbrMnnm:'1',lnbrSlno:'0'},
 {roadAddr:'서울특별시 성북구 삼선교로16길 116',jibunAddr:'서울특별시 성북구 삼선동2가 389',sggNm:'성북구',emdNm:'삼선동2가',bdNm:'한성대학교',admCd:'1129011200',lnbrMnnm:'389',lnbrSlno:'0'},
].map((a,i)=>({...a,siNm:'서울특별시',mtYn:'0',bdMgtSn:'1'.repeat(24)+i,zipNo:''}));

async function fixture(media='article',rights=true){
 const db=database(),source=await saveArchiveSource(db,{providerId:'ARTICLE-ORIGINAL-ID',title:'검토용 기사',institution:'시험 기관',url:'https://example.org/original',kind:'web',summary:'테스트용 짧은 요약',regionIds:[],publicationDate:'1979-02-03',...(rights?{rights:'permission',rightsUrl:'https://example.org/rights',rightsNote:'시험 시나리오의 인용·AI 처리 허락',reuseAllowed:true}:{})},'fixture');
 const passage=await addArchivePassage(db,source.id,{text:'1978년에 시장이 이전했다는 기사 설명을 확인했다.',locator:'기사 7면 2문단',textKind:'paraphrase'},'fixture');
 const target=(await listPassageReviewTargets(db,new URLSearchParams())).items[0];
 const content={passageId:passage.id,expectedRevision:0,expectedFingerprint:target.fingerprint,status:'content_checked',evidence:{sourceUrl:'https://example.org/original',sourceLocator:'기사 7면 2문단',observedAt:new Date().toISOString(),sourceHash:null,classification:'factual',spatialScope:'neighborhood',scopeNote:'현재 시험 주소와 관련된 원문을 대조했다.',summary:'제공기관 원문과 짧은 재서술을 직접 대조했다.',checks:Object.fromEntries(reviewDimensions.map(k=>[k,{result:'checked',note:'시험 원문의 해당 항목을 확인했다.'}]))}};
 await reviewArchivePassage(db,content,'reviewer');
 const input={recordId:'ARTICLE-ORIGINAL-ID',passageId:passage.id,placeKey:evidencePlace(addresses[0]).placeId,mediaType:media,relationType:'exact_building',status:'approved',expectedRevision:0,expectedFingerprint:(await evidenceReviewTarget(db,passage.id)).fingerprint,payload:{relationEvidenceId:'test-location-proof',relationBasis:'원문 지번과 시험 건물 식별자를 대조한 테스트 근거',sourceVerified:true,contentVerified:true,placeVerified:true,claimVerified:true,citationAllowed:true,aiAllowed:true,rightsEvidenceUrl:'https://example.org/rights',rightsNote:'시험용 인용 및 AI 처리 허락',eventDate:'1978',publishedAt:'1979-02-03',aliases:[{name:'옛 시장 시험명',validFrom:'1970',validTo:'1980',evidenceId:'alias-test-proof'}],segments:[]}};
 return {db,source,passage,input,content};
}

test('same building/parcel identities survive road/jibun presentation and malformed lot numbers do not create PNU',()=>{
 for(const address of addresses){const a=evidencePlace(address),b=evidencePlace({...address,roadAddr:'서울 '+address.roadAddr.replace('서울특별시 ',''),bdNm:''});assert.equal(a.placeId,b.placeId);assert.equal(a.pnu,b.pnu);assert.equal(a.pnu.length,19);assert.equal(normalizePlaceText(address.roadAddr),normalizePlaceText(b.roadAddress));}
 assert.equal(evidencePlace({...addresses[0],lnbrSlno:'bad'}).pnu,null);assert.equal(normalizeRelation('exact_site'),'historical_site');
});
test('approved short article claim preserves original ID, dates, source and reviewed historical alias',async()=>{
 const {db,input}=await fixture();await reviewEvidence(db,input,'reviewer');const result=await reviewedEvidence(db,addresses[0]);assert.equal(result.status,'approved_records_available');const e=result.records[0];assert.equal(e.recordId,input.recordId);assert.equal(e.eventDate,'1978');assert.equal(e.publishedAt,'1979-02-03');assert.equal(e.claims[0].classification,'factual');assert.equal(e.aliases[0].evidenceId,'alias-test-proof');assert.equal(e.sourceUrl,'https://example.org/original');
 assert.equal((await reviewedEvidence(db,addresses[1])).records.length,0);
});
test('same-dong article remains regional background rather than another building history',async()=>{
 const {db,input}=await fixture();input.placeKey='dong:강동구:성내동';input.relationType='dong_context';await reviewEvidence(db,input,'reviewer');const other={...addresses[0],bdMgtSn:'9'.repeat(25)};const e=(await reviewedEvidence(db,other)).records[0];assert.equal(e.relationType,'dong_context');assert.equal(validateEvidenceClaims([e],[{evidenceId:e.evidenceId,claimId:e.claims[0].claimId,text:e.claims[0].text,relationType:'exact_building'}]).valid,false);
});
test('pending candidates and rights-restricted records cannot become evidence from approval strings alone',async()=>{
 const {db,input}=await fixture('article',false);await assert.rejects(()=>reviewEvidence(db,input,'reviewer'),e=>e.code==='EVIDENCE_APPROVAL');input.status='pending_review';await reviewEvidence(db,input,'reviewer');assert.equal((await reviewedEvidence(db,addresses[0])).records[0].claims.length,0);
 db.sql.exec("UPDATE docent_evidence_reviews SET status='approved'");assert.equal((await reviewedEvidence(db,addresses[0])).records[0].usableAsVerifiedEvidence,false);
});
test('AI processing permission and place namespace are independently required',async()=>{
 const {db,input}=await fixture();for(const change of [{payload:{...input.payload,aiAllowed:false}},{placeKey:'district:강동구'},{relationType:'uncertain'}])await assert.rejects(()=>reviewEvidence(db,{...input,...change},'reviewer'));
 await assert.rejects(()=>reviewEvidence(db,input,''),e=>e.code==='EVIDENCE_ACTOR');
});
test('an unaudited approval string cannot promote an otherwise rights-permitted pending claim',async()=>{
 const {db,input}=await fixture();await reviewEvidence(db,{...input,status:'pending_review'},'reviewer');db.sql.exec("UPDATE docent_evidence_reviews SET status='approved'");const e=(await reviewedEvidence(db,addresses[0])).records[0];assert.equal(e.usableAsVerifiedEvidence,false);assert.ok(e.verification.reasonCodes.includes('approval_stale_or_unaudited'));
});
test('revocation immediately invalidates claims without caching and keeps immutable audit history',async()=>{
 const {db,input}=await fixture();const first=await reviewEvidence(db,input,'reviewer');const e=(await reviewedEvidence(db,addresses[0])).records[0];await reviewEvidence(db,{...input,status:'revoked',expectedRevision:first.revision},'reviewer');const current=await reviewedEvidence(db,addresses[0]);assert.equal(current.records[0].claims.length,0);assert.equal(validateEvidenceClaims(current.records,[{evidenceId:e.evidenceId,claimId:e.claims[0].claimId,text:e.claims[0].text}]).valid,false);assert.equal(db.sql.prepare('SELECT count(*) AS n FROM docent_evidence_reviews').get().n,2);
});
test('source rights edits, content review replacement and missing audit invalidate prior approvals',async()=>{
 for(const mode of ['rights','content','audit']){const {db,input,source,content}=await fixture();await reviewEvidence(db,input,'reviewer');if(mode==='rights')db.sql.prepare('UPDATE archive_sources SET reuse_allowed=0 WHERE id=?').run(source.id);if(mode==='content')await reviewArchivePassage(db,{...content,expectedRevision:1,status:'needs_review'},'reviewer');if(mode==='audit')db.sql.exec("DELETE FROM archive_audit WHERE action='evidence_review'");const e=(await reviewedEvidence(db,addresses[0])).records[0];assert.equal(e.usableAsVerifiedEvidence,false,mode);assert.equal(e.claims.length,0);}
});
test('video without segments provides reviewed full link and no invented timestamps',async()=>{
 const {db,input}=await fixture('video');await reviewEvidence(db,input,'reviewer');const e=(await reviewedEvidence(db,addresses[0])).records[0];assert.equal(e.videoVerificationStatus,'place_verified');assert.equal(e.usageMode,'full_video_link');assert.deepEqual(e.media.verifiedSegments,[]);assert.equal(e.claims.length,1);
});
test('verified segments bind exact original source and reject malformed times or substituted URLs',async()=>{
 const {db,input}=await fixture('video');const segment={segmentId:'s1',startSeconds:10,endSeconds:20,sceneDescription:'시험 원문에서 확인한 장면',verificationBasis:'실제 원문 구간과 장소 표기를 대조한 시험',verifiedAt:new Date().toISOString(),sourceUrl:'https://example.org/original'};
 for(const bad of [{...segment,endSeconds:1},{...segment,startSeconds:'00:10'},{...segment,sourceUrl:'https://wrong.org/video'}])await assert.rejects(()=>reviewEvidence(db,{...input,payload:{...input.payload,segments:[bad]}},'reviewer'));
 await reviewEvidence(db,{...input,payload:{...input.payload,segments:[segment]}},'reviewer');const e=(await reviewedEvidence(db,addresses[0])).records[0];assert.equal(e.videoVerificationStatus,'segment_verified');assert.equal(e.media.verifiedSegments[0].startSeconds,10);
});
test('validation detects unknown claims, altered facts, switched dates, wrong scope and unsupported video time',async()=>{
 const {db,input}=await fixture();await reviewEvidence(db,input,'reviewer');const records=(await reviewedEvidence(db,addresses[0])).records,e=records[0],base={evidenceId:e.evidenceId,claimId:e.claims[0].claimId,text:e.claims[0].text,relationType:e.relationType,eventDate:e.eventDate,publishedAt:e.publishedAt};assert.equal(validateEvidenceClaims(records,[base]).valid,true);
 for(const change of [{claimId:'other'},{text:base.text+' 1900년에 지어졌다.'},{eventDate:base.publishedAt},{publishedAt:base.eventDate},{relationType:'district_context'},{segmentId:'fake'}])assert.equal(validateEvidenceClaims(records,[{...base,...change}]).valid,false);
 assert.equal(validateEvidenceClaims(records,[base]).semanticVerification,'not_checked');
});
test('optimistic revision prevents concurrent approvals and unaudited writes roll back',async()=>{
 const {db,input}=await fixture();const out=await Promise.allSettled([reviewEvidence(db,input,'one'),reviewEvidence(db,input,'two')]);assert.equal(out.filter(r=>r.status==='fulfilled').length,1);
 const f=await fixture();f.db.sql.exec("CREATE TRIGGER audit_failure BEFORE INSERT ON archive_audit WHEN NEW.action='evidence_review' BEGIN SELECT RAISE(ABORT,'fixture'); END");await assert.rejects(()=>reviewEvidence(f.db,f.input,'reviewer'));assert.equal(f.db.sql.prepare('SELECT count(*) AS n FROM docent_evidence_reviews').get().n,0);
});
test('missing D1 or migration degrades to unavailable instead of claiming approval',async()=>{
 assert.equal((await reviewedEvidence(undefined,addresses[0])).status,'backend_unavailable');const db=database();db.sql.exec('DROP TABLE docent_evidence_reviews');assert.equal((await reviewedEvidence(db,addresses[0])).status,'backend_unavailable');
});
test('admin key and same-origin guard block anonymous and spoofed approval attempts',()=>{
 const env={ARCHIVE_ADMIN_TOKEN:'fixture-key'};for(const headers of [{},{'oai-authenticated-user-id':'spoof','oai-authenticated-user-email':'owner@example.org'},{'x-archive-admin':'wrong'},{'x-archive-admin':'fixture-key',origin:'https://evil.org'}])assert.throws(()=>requireArchiveAdmin(new Request('https://app.test/api/admin/evidence',{headers}),env));assert.ok(requireArchiveAdmin(new Request('https://app.test/api/admin/evidence',{headers:{'x-archive-admin':'fixture-key'}}),env));
});
test('all three address fixtures retain candidate types and fallback without live BigQuery or D1',async()=>{
 const old=process.env.VERCEL;delete process.env.VERCEL;try{for(const a of addresses){const result=await prepareEvidence(new Request('https://fixture.test/mcp'),undefined,a);assert.equal(result.bigQueryResearch.diagnosticStatus,'backend_unavailable');assert.equal(result.evidence.records.length,0);assert.equal(result.evidence.semanticVerification,'not_checked');assert.ok(result.videos.records.length<=3);assert.ok(result.evidence.candidates.every(r=>r.usableAsVerifiedEvidence===false&&r.claims.length===0));for(const type of ['article','video','photo','document'])assert.ok(type in result.evidence.diagnostics.byMediaType);}}finally{if(old!==undefined)process.env.VERCEL=old;}
});
test('article metadata index returns provenance but never distributes unreviewed full text or claims',async()=>{
 const result=await articleCandidates(addresses[0]);assert.ok(result.total>0);assert.ok(result.records.length<=6);for(const row of result.records){assert.equal(row.usableAsVerifiedEvidence,false);assert.equal(row.claims.length,0);assert.ok(row.provenance.file);assert.equal('기사요약' in row,false);}
});

test('wrong original record cannot be combined with an unrelated reviewed source',async()=>{
 const {db,input}=await fixture();await assert.rejects(()=>reviewEvidence(db,{...input,recordId:'ANOTHER-ARTICLE-ID'},'reviewer'),e=>e.code==='EVIDENCE_SOURCE');
});
test('approved article flows through prepare and validation while returned static articles remain candidates',async()=>{
 const {db,input}=await fixture();await reviewEvidence(db,input,'reviewer');const result=await prepareEvidence(new Request('https://fixture.test/mcp'),db,addresses[0]);const e=result.evidence.records[0];assert.equal(e.usableAsVerifiedEvidence,true);assert.equal(result.evidence.status,'approved_records_available');assert.equal(result.evidence.diagnostics.byMediaType.article.usableEvidenceCount,1);assert.equal(validateEvidenceClaims(result.evidence.records,[{evidenceId:e.evidenceId,claimId:e.claims[0].claimId,text:e.claims[0].text}]).valid,true);assert.ok(result.evidence.candidates.every(r=>!r.usableAsVerifiedEvidence));
});
