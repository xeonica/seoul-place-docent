import test from 'node:test';
import assert from 'node:assert/strict';
import {getPlaceRegisterContext} from '../lib/building-register.ts';
import {buildDocentTourV2} from '../lib/docent-tour-builder.ts';
import {parcelNumber} from '../lib/place-context.ts';

const address={roadAddr:'서울특별시 성동구 마장로42길 16',jibunAddr:'서울특별시 성동구 마장동 510-1',siNm:'서울특별시',sggNm:'성동구',emdNm:'마장동',admCd:'1120010500',bdMgtSn:'JUSO-BUILDING-MANAGEMENT-ID',bdNm:'세림아파트',lnbrMnnm:'510',lnbrSlno:'1',mtYn:'0',zipNo:'04754'};
const ring=[[127.04,37.57],[127.041,37.57],[127.041,37.571],[127.04,37.57]];
const currentRow={sigunguCd:'11200',bjdongCd:'10500',platGbCd:'0',bun:'0510',ji:'0001',mgmBldrgstPk:'CURRENT-LEDGER-PK',bldNm:'세림아파트',dongNm:'101동',newPlatPlc:address.roadAddr,platPlc:address.jibunAddr,mainPurpsCdNm:'공동주택',strctCdNm:'철근콘크리트구조',totArea:'1234.5',platArea:'600',grndFlrCnt:'15',ugrndFlrCnt:'2',pmsDay:'20000101',stcnsDay:'20000301',useAprDay:'20021231'};
const closedRow={...currentRow,mgmBldrgstPk:'CLOSED-LEDGER-PK',bldNm:'옛 마장주택',shtGbCd:'4',shtGbCdNm:'합병에 의한 폐쇄',shtDay:'19991231',useAprDay:'19600101'};
function response(rows,total=rows.length){return Response.json({response:{header:{resultCode:'00'},body:{totalCount:total,items:{item:rows}}}});}
function withFetch(handler){const original=globalThis.fetch;globalThis.fetch=handler;return()=>{globalThis.fetch=original;};}
async function scenario({current=[currentRow],currentTotal=current.length,closed=[closedRow],closedTotal=closed.length,vworld=true}={}){
 const closedPages=[];const restore=withFetch(async input=>{const u=new URL(String(input));if(u.pathname.endsWith('/getBrTitleInfo'))return response(current,currentTotal);if(u.pathname.endsWith('/getSrTitleInfo')){const page=Number(u.searchParams.get('pageNo'));closedPages.push(page);const rows=closedTotal>100&&page===1?Array.from({length:100},(_,i)=>({...closed[0],mgmBldrgstPk:`CLOSED-${i}`})):closed;return response(rows,closedTotal);}if(u.hostname==='api.vworld.kr')return Response.json({response:{status:'OK',result:{featureCollection:{features:[{properties:{pnu:parcelNumber(address),addr:address.jibunAddr,jibun:'510-1',gosi_year:'2025'},geometry:{type:'Polygon',coordinates:[ring]}}]}}}});throw new Error('unexpected URL '+u);});
 try {const context=await getPlaceRegisterContext(address,{BUILDING_API_KEY:'test-key',CLOSED_BUILDING_API_KEY:'test-closed-key',...(vworld?{VWORLD_API_KEY:'test-vworld-key'}:{})});return {context,closedPages};} finally {restore();}
}

test('current ledger PK, JUSO building management number and derived PNU remain distinct; closed same-parcel item stays a candidate',async()=>{
 const {context,closedPages}=await scenario({closedTotal:101});
 assert.equal(context.diagnostics.current.status,'ready');assert.equal(context.records.length,1);
 const current=context.records[0];assert.equal(current.id,'building-register:CURRENT-LEDGER-PK');assert.equal(current.ledgerPk,'CURRENT-LEDGER-PK');assert.equal(current.buildingManagementNumber,'JUSO-BUILDING-MANAGEMENT-ID');assert.equal(current.derivedPnu,parcelNumber(address));assert.equal(current.permitDate,'20000101');assert.equal(current.startDate,'20000301');assert.equal(current.useApprovalDate,'20021231');
 assert.deepEqual(closedPages,[1,2]);assert.equal(context.diagnostics.closed.pages,2);assert.equal(context.diagnostics.closed.truncated,false);assert.equal(context.diagnostics.closed.recordCount,101);assert.equal(context.diagnostics.closed.status,'ready');
 const old=context.diagnostics.records.find(row=>row.ledgerPk==='CLOSED-LEDGER-PK');assert.equal(old.recordType,'historical_building_official_record');assert.equal(old.placeRelation,'same_parcel_historical_candidate');assert.equal(old.verified,false);assert.equal(old.closureTypeCode,'4');assert.equal(old.closedAt,'19991231');
});

test('empty successful pages are no_records and missing provider keys remain key_missing',async()=>{
 const empty=await scenario({current:[],currentTotal:0,closed:[],closedTotal:0});assert.equal(empty.context.diagnostics.current.status,'no_records');assert.equal(empty.context.diagnostics.closed.status,'no_records');assert.deepEqual(empty.context.records,[]);
 const missing=await getPlaceRegisterContext(address,{});assert.equal(missing.diagnostics.current.status,'key_missing');assert.equal(missing.diagnostics.closed.status,'key_missing');assert.equal(missing.diagnostics.parcel.status,'key_missing');assert.deepEqual(missing.records,[]);
});

test('multiple current rows with the same visible identity are not selected arbitrarily',async()=>{
 const {context}=await scenario({current:[currentRow,{...currentRow,mgmBldrgstPk:'SECOND-LEDGER-PK',dongNm:'102동'}],currentTotal:2});assert.equal(context.diagnostics.current.status,'identity_ambiguous');assert.deepEqual(context.records,[]);
});

test('7-part plan uses current official facts in part one and does not promote closed same-parcel candidates in part four',async()=>{
 const {context}=await scenario();const plan=buildDocentTourV2({address:address.roadAddr,district:address.sggNm,dong:address.emdNm,place:{name:address.bdNm,records:context.records},neighborhood:{records:[]},evidence:{records:[],candidates:[]},visuals:{photos:[]},videos:{records:[]},registerDiagnostics:context.diagnostics});
 const partOne=plan.sections[0],partFour=plan.sections[3],oldId='closed-building-register:CLOSED-LEDGER-PK';
 assert.ok(partOne.evidenceIds.includes('building-register:CURRENT-LEDGER-PK'));assert.equal(partOne.verificationStatus,'supported');
 assert.ok(partFour.evidenceIds.includes(oldId));assert.equal(partFour.verificationStatus,'partial');assert.equal(partFour.relationScope,'unknown');assert.match(partFour.missingEvidenceReason,/직접 연결된 승인 역사 근거/);
 assert.equal(plan.sources.find(source=>source.id===oldId).verificationStatus,'candidate_only');
});
