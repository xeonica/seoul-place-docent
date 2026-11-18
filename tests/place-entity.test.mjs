import test from 'node:test';
import assert from 'node:assert/strict';
import {resolvePlaceEntity,placeEntity} from '../lib/place-entity.ts';
import {textResult} from '../lib/mcp-protocol.ts';
import {validateAnswer} from '../lib/place-answer.ts';
const address={roadAddr:'서울특별시 성동구 마장로42길 16',jibunAddr:'서울특별시 성동구 마장동 784',siNm:'서울특별시',sggNm:'성동구',emdNm:'마장동',admCd:'1120010500',bdMgtSn:'fixture-building',bdNm:'세림아파트',lnbrMnnm:'784',lnbrSlno:'0',mtYn:'0',zipNo:''};
test('official responses unify road, parcel and name inputs; a generic name stays ambiguous',async()=>{
 const original=fetch;let many=false;globalThis.fetch=async()=>Response.json({results:{common:{errorCode:'0',totalCount:many?'2':'1'},juso:many?[address,{...address,bdMgtSn:'different'}]:[address]}});
 try{
  const results=await Promise.all(['마장로42길 16','마장동 784','마장동 세림아파트'].map(query=>resolvePlaceEntity({query},{JUSO_API_KEY:'fixture'})));
  assert.equal(new Set(results.map(row=>row.placeId)).size,1);assert.equal(results[0].buildingRegisterId,null);assert.equal(results[0].apartmentComplexCode,null);
  assert.equal((await resolvePlaceEntity({token:results[0].token},{JUSO_API_KEY:'fixture'})).placeId,results[0].placeId);
  many=true;const ambiguous=await resolvePlaceEntity({query:'세림아파트'},{JUSO_API_KEY:'fixture'});assert.equal(ambiguous.matchStatus,'ambiguous');assert.equal(ambiguous.placeId,null);
  assert.notEqual(placeEntity(address).placeId,placeEntity({...address,bdMgtSn:'another-building-same-parcel'}).placeId);
 }finally{globalThis.fetch=original;}
});
test('structured content and legacy text describe identical objects',()=>{
 const value={place:{placeId:'test'},limitations:['미확인']};const result=textResult(value);assert.deepEqual(result.structuredContent,JSON.parse(result.content[0].text));
});
test('neighborhood evidence cannot verify building scope, invented causality, media or years',()=>{
 const scene={id:'N1',scope:'dong',title:'마장동 시장',text:'1980년 시장의 모습입니다.',date:'1980',photos:[],evidence:[]};
 const paragraph=(text,extra={})=>({heading:'동네',text,evidence_ids:['N1'],...extra});
 const checked=validateAnswer({paragraphs:[paragraph('1980년 시장의 모습입니다.'),paragraph('1980년 건물입니다.',{scope:'building'}),paragraph('시장 때문에 아파트가 생겼습니다.'),paragraph('1999년 시장입니다.'),paragraph('시장의 모습입니다.',{media_ids:['video:invented']})]},[scene]);
 assert.equal(checked.paragraphs.length,1);assert.equal(checked.omitted,4);
});
