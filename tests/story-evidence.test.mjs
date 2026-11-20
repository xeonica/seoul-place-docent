import test from 'node:test';
import assert from 'node:assert/strict';
import {storyEvidence,evidenceUsage} from '../lib/story-evidence.ts';
import {deploymentInfo} from '../lib/deployment-info.ts';
const fixture=(mediaType,overrides={})=>({evidenceId:'fixture:'+mediaType,recordId:'fixture-record:'+mediaType,mediaType,title:'자동 테스트용 가상 자료',sourceInstitution:'시험 기관',sourceUrl:'https://example.org/'+mediaType,placeId:'juso-building:fixture',relationType:'exact_building',publishedAt:'2001-01-01',eventDate:'2000',rightsStatus:'citation_and_ai_permitted',usableAsVerifiedEvidence:true,verification:{approvalActive:true},claims:[{claimId:'claim-'+mediaType,text:'시험용 주장입니다. 실제 역사 사실이 아닙니다.',verified:true,classification:'factual'}],media:{verifiedSegments:[]},...overrides});
test('approved article projection retains identity, excerpt, rights and separate publication/event dates',()=>{
 const p=storyEvidence([fixture('article')]);assert.equal(p.articles[0].articleId,'fixture-record:article');assert.equal(p.articles[0].verifiedExcerpt,p.historicalEvents[0].description);assert.equal(p.articles[0].publishedAt,'2001-01-01');assert.equal(p.historicalEvents[0].eventDate,'2000');assert.equal(p.articles[0].relationType,'exact_site');assert.equal(p.articles[0].addressId,'juso-building:fixture');assert.deepEqual(p.usage.usedEvidenceIds,[]);
});
test('pending, revoked and empty claims never produce usable events or article excerpts',()=>{
 for(const change of [{usableAsVerifiedEvidence:false},{verification:{approvalActive:false}},{claims:[]}]){const p=storyEvidence([fixture('article',change)]);assert.deepEqual(p.articles,[]);assert.deepEqual(p.historicalEvents,[]);}
});
test('equal dates do not merge unrelated claims and photos must match the reviewed original source',()=>{
 const article=fixture('article'),document=fixture('document');const photos=[{evidenceId:'photo:wrong',sourceUrl:'https://example.org/other',displayable:true,verificationStatus:'VERIFIED'},{evidenceId:'photo:bound',sourceUrl:article.sourceUrl,displayable:true,verificationStatus:'VERIFIED'}];const events=storyEvidence([article,document],photos).historicalEvents;assert.equal(events.length,2);assert.deepEqual(events[0].articleEvidenceIds,[article.evidenceId]);assert.deepEqual(events[0].photoEvidenceIds,['photo:bound']);assert.deepEqual(events[1].photoEvidenceIds,[]);assert.equal(events[0].crossSourceEventIdentity,'not_checked');
});
test('verified video content and verified segments remain separate and filming date is not invented',()=>{
 const p=storyEvidence([fixture('video')]);assert.equal(p.videos[0].filmedAt,null);assert.equal(p.videos[0].segmentVerificationStatus,'not_checked');assert.deepEqual(p.videos[0].segments,[]);
 const withSegment=storyEvidence([fixture('video',{media:{verifiedSegments:[{segmentId:'test',startSeconds:10,endSeconds:20,sceneDescription:'시험 장면',sourceUrl:'https://example.org/video',verificationBasis:'테스트 승인'}]}})]);assert.equal(withSegment.videos[0].segments[0].segmentStart,10);assert.equal(withSegment.videos[0].segmentVerificationStatus,'verified');
});
test('usage separates accepted submissions and rejected claims without certifying the final client answer',()=>{
 const p=evidenceUsage(['legacy:1'],[{evidenceId:'article:1',valid:true},{evidenceId:'candidate:1',valid:false}]);assert.deepEqual(p.usedEvidenceIds,['legacy:1','article:1']);assert.deepEqual(p.rejectedEvidenceIds,['candidate:1']);assert.equal(p.semanticVerification,'not_checked');
});
test('deployment provenance has no guessed commit or secret environment values',()=>{
 assert.equal(deploymentInfo({SECRET:'never return'}).commitSha,null);assert.equal(deploymentInfo({VERCEL_GIT_COMMIT_SHA:'moving-main'}).commitSha,null);assert.equal(deploymentInfo({VERCEL_GIT_COMMIT_SHA:'a'.repeat(40),VERCEL_ENV:'production'}).commitSha,'a'.repeat(40));
});
