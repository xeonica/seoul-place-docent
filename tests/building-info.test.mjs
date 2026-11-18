import test from 'node:test';
import assert from 'node:assert/strict';
import {buildingInfo,validateBuildingClaims} from '../lib/building-info.ts';
import {parcelParams} from '../lib/providers.ts';
const address={roadAddr:'서울특별시 성동구 무학로6길 50',jibunAddr:'테스트 지번',siNm:'서울특별시',sggNm:'성동구',emdNm:'테스트동',admCd:'1120010100',bdMgtSn:'fixture',bdNm:'',lnbrMnnm:'1',lnbrSlno:'0',mtYn:'0',zipNo:''};
const row={...parcelParams(address),mgmBldrgstPk:'title1',bldNm:'시험건물',newPlatPlc:'서울 성동구 무학로6길 50 (시험동)',hhldCnt:'0',totArea:'123',useAprDay:'20010101'};
const body=items=>({response:{header:{resultCode:'00'},body:{items:{item:items},totalCount:items.length}}});
test('title and recap preserve zero and avoid aggregation; claims use exact fields',async()=>{
 const original=fetch;globalThis.fetch=async url=>Response.json(body([{...row,mgmBldrgstPk:String(url).includes('getBrRecapTitleInfo')?'recap1':'title1'}]));
 try{const result=await buildingInfo(address,{BUILDING_API_KEY:'fixture'});assert.equal(result.status,'verified');assert.equal(result.records[0].households,'0');assert.equal(result.records[0].buildingCount,null);assert.equal(result.recap.records.length,1);assert.equal(result.records[0].approvalDate,'20010101');assert.deepEqual(validateBuildingClaims([{evidenceId:'building_register:title1',field:'households',value:'0'},{evidenceId:'building_register:title1',field:'households',value:'123'}],result).map(row=>row.valid),[true,false]);}finally{globalThis.fetch=original;}
});
test('multiple titles remain ambiguous without summing households',async()=>{
 const original=fetch;globalThis.fetch=async()=>Response.json(body([row,{...row,mgmBldrgstPk:'title2',hhldCnt:'8'}]));try{const result=await buildingInfo(address,{BUILDING_API_KEY:'fixture'});assert.equal(result.status,'ambiguous');assert.equal(result.records.length,2);}finally{globalThis.fetch=original;}
});
test('key missing, empty result, provider, parse and timeout errors stay distinct',async()=>{
 assert.equal((await buildingInfo(address,{})).status,'key_missing');
 const original=fetch;
 try{for(const [reply,status] of [[()=>Response.json(body([])),'not_found'],[()=>new Response('',{status:403}),'provider_error'],[()=>new Response('broken'),'parse_error'],[()=>{throw new DOMException('fixture','TimeoutError');},'timeout']]){globalThis.fetch=async()=>reply();assert.equal((await buildingInfo(address,{BUILDING_API_KEY:'fixture'})).status,status);}}finally{globalThis.fetch=original;}
});
test('XML response retains parcel identity and string dates',async()=>{
 const original=fetch;globalThis.fetch=async()=>new Response('<response><header><resultCode>00</resultCode></header><body><totalCount>1</totalCount><items><item>'+Object.entries(row).map(([key,value])=>`<${key}>${value}</${key}>`).join('')+'</item></items></body></response>');
 try{assert.equal((await buildingInfo(address,{BUILDING_API_KEY:'fixture'})).records[0].approvalDate,'20010101');}finally{globalThis.fetch=original;}
});
test('name disagreement and missing road stay ambiguous, other parcels are excluded',async()=>{
 const original=fetch;
 try{
  globalThis.fetch=async()=>Response.json(body([row]));
  assert.equal((await buildingInfo({...address,bdNm:'다른건물'},{BUILDING_API_KEY:'fixture'})).status,'ambiguous');
  globalThis.fetch=async()=>Response.json(body([{...row,newPlatPlc:''}]));
  const missingRoad=await buildingInfo(address,{BUILDING_API_KEY:'fixture'});assert.equal(missingRoad.status,'ambiguous');assert.equal(missingRoad.records.length,0);assert.equal(missingRoad.candidates.length,1);
  globalThis.fetch=async()=>Response.json(body([{...row,bun:'9999'}]));
  assert.equal((await buildingInfo(address,{BUILDING_API_KEY:'fixture'})).records.length,0);
 }finally{globalThis.fetch=original;}
});
