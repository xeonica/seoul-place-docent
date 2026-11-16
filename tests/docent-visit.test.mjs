import test from 'node:test';
import assert from 'node:assert/strict';
import {POST} from '../app/api/docent/visit/route.ts';
import {signAddress} from '../lib/providers.ts';

function request(body, origin = 'https://docent.test') {
  return new Request('https://docent.test/api/docent/visit', {
    method:'POST', headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(body),
  });
}

test('visitor evidence returns real lookup receipts and verified historical points without signed address tokens', async t => {
  const address = {
    roadAddr:'서울특별시 성동구 마장로42길 16',jibunAddr:'서울특별시 성동구 마장동 784',
    siNm:'서울특별시',sggNm:'성동구',emdNm:'마장동',admCd:'1120010500',
    bdNm:'세림아파트',lnbrMnnm:'784',lnbrSlno:'0',mtYn:'0',
  };
  const variables = {JUSO_API_KEY:'fixture-address',KAKAO_REST_API_KEY:'fixture-coordinate',BUILDING_API_KEY:'fixture-building'};
  for (const [key,value] of Object.entries(variables)) {
    const previous = process.env[key];
    process.env[key] = value;
    t.after(()=>{if(previous === undefined) delete process.env[key];else process.env[key] = previous;});
  }
  t.mock.method(console,'info',()=>{});
  const fetch = t.mock.method(globalThis,'fetch',async input => {
    const url = new URL(String(input));
    assert.equal(url.hostname,'dapi.kakao.com');
    return Response.json({documents:[{
      x:'127.046038485838',y:'37.56504066245',
      address:{region_1depth_name:'서울',b_code:address.admCd,main_address_no:'784',sub_address_no:'',mountain_yn:'N'},
      road_address:{address_name:address.roadAddr},
    }]});
  });
  assert.equal((await POST(request({token:'any'},'https://other.test'))).status,403);
  assert.equal((await POST(request({token:'x'.repeat(8500)}))).status,400);
  assert.equal((await POST(request({token:'forged'}))).status,422);
  assert.equal(fetch.mock.callCount(),0);
  const signed = await signAddress(address,variables.JUSO_API_KEY);
  const response = await POST(request({token:signed}));
  assert.equal(response.status,200);
  assert.equal(response.headers.get('cache-control'),'no-store');
  const raw = await response.text();
  const visit = JSON.parse(raw);
  assert.ok(!raw.includes(signed) && !raw.includes('fixture-') && !raw.includes('buildingRegister'));
  assert.match(visit.receipt.requestId,/^[\da-f-]{36}$/);
  assert.equal(visit.receipt.auditPersisted,false);
  assert.equal(visit.spatial.coordinateStatus,'verified');
  assert.equal(visit.mappedRecords[0].spatialRelation.distanceMeters,1194);
  assert.equal(visit.mappedRecords[0].spatialRelation.category,'nearby');
  assert.ok(visit.returned <= 12 && visit.available >= visit.returned);
  assert.ok(visit.sources.length > 0);
  assert.equal(fetch.mock.callCount(),1);
});
