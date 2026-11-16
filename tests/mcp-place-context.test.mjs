import test from 'node:test';
import assert from 'node:assert/strict';
import {POST} from '../app/mcp/route.ts';
import {distanceMeters, enrichMcpPlace} from '../lib/mcp-place-context.ts';
import {getFullDocentStory} from '../lib/docent-data.ts';

const address = {
  siNm:'서울특별시', sggNm:'성동구', emdNm:'마장동', admCd:'1120010500',
  roadAddr:'서울특별시 성동구 마장로42길 16 (마장동, 세림아파트)',
  jibunAddr:'서울특별시 성동구 마장동 784 세림아파트',
  lnbrMnnm:'784', lnbrSlno:'0', mtYn:'0', bdNm:'세림아파트',
};
const addressPoint = {latitude:37.56504066245,longitude:127.046038485838};
const buildingRow = {
  mgmBldrgstPk:'test-1', sigunguCd:'11200', bjdongCd:'10500', platGbCd:'0', bun:'0784', ji:'0000',
  bldNm:'세림아파트', dongNm:'테스트 A동', newPlatPlc:'서울 성동구 마장로42길 16',
  platPlc:'서울특별시 성동구 마장동 784', useAprDay:'20000229', mainPurpsCdNm:'공동주택',
  grndFlrCnt:'12', ugrndFlrCnt:'0', platArea:'300', archArea:'88.5', totArea:'1000',
};
const museumId = 'landmark:cheonggyecheon-museum-opening';
const pointDocs = [{
  x:String(addressPoint.longitude), y:String(addressPoint.latitude),
  address:{region_1depth_name:'서울',b_code:address.admCd,main_address_no:'784',sub_address_no:'',mountain_yn:'N'},
  road_address:{address_name:'서울 성동구 마장로42길 16'},
}];
const registerResponse = rows => Response.json({response:{header:{resultCode:'00'},body:{items:{item:rows},totalCount:rows.length}}});
const history = () => getFullDocentStory('성동구','마장동');

async function mcp(name,args) {
  const request = new Request('https://docent.test/mcp',{
    method:'POST', headers:{'content-type':'application/json',accept:'application/json, text/event-stream'},
    body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}}),
  });
  const response = await POST(request);
  assert.equal(response.status,200);
  const {result} = await response.json();
  assert.equal(result.isError,undefined);
  assert.ok(result._meta.requestId);
  return JSON.parse(result.content[0].text);
}

test('마장로42길 16: MCP prepares address, individual title records and source-based distances', async t => {
  const keys = {JUSO_API_KEY:'fixture-juso',BUILDING_API_KEY:'fixture-register',KAKAO_REST_API_KEY:'fixture-kakao',MCP_HISTORY_RADIUS_METERS:'1500'};
  for (const [name,value] of Object.entries(keys)) {
    const previous = process.env[name];
    process.env[name] = value;
    t.after(() => previous === undefined ? delete process.env[name] : (process.env[name] = previous));
  }
  t.mock.method(console,'info',()=>{});
  const requests = [];
  t.mock.method(globalThis,'fetch',async input => {
    const url = new URL(String(input));
    requests.push(url.hostname);
    if (url.hostname === 'business.juso.go.kr') {
      assert.equal(url.searchParams.get('keyword'),'서울특별시 성동구 마장로42길 16');
      return Response.json({results:{common:{errorCode:'0',totalCount:'1'},juso:[address]}});
    }
    if (url.hostname === 'apis.data.go.kr') {
      assert.equal(url.pathname,'/1613000/BldRgstHubService/getBrTitleInfo');
      assert.equal(url.searchParams.get('bun'),'0784');
      return registerResponse([
        buildingRow,
        {...buildingRow,mgmBldrgstPk:'test-2',dongNm:'테스트 B동',ji:'',grndFlrCnt:'8',useAprDay:'20000230'},
        {...buildingRow,mgmBldrgstPk:'another-road',newPlatPlc:'서울 성동구 마장로42길 18'},
        {...buildingRow,mgmBldrgstPk:'another-lot',bun:'0001'},
        {...buildingRow,mgmBldrgstPk:'missing-lot-part',ji:undefined},
      ]);
    }
    if (url.hostname === 'dapi.kakao.com') return Response.json({documents:pointDocs});
    assert.fail('Unexpected external call: ' + url.hostname);
  });
  const query = '서울특별시 성동구 마장로42길 16';
  const {candidates:[candidate]} = await mcp('search_place',{query});
  const token = candidate.token;
  assert.equal(candidate.bdNm,'세림아파트');
  const packet = await mcp('prepare_place_answer',{token,question:'건물과 주변 역사를 알려주세요.'});
  assert.equal(packet.generation.serverAiCalls,0);
  assert.equal(packet.place.status,'unverified');
  assert.equal(packet.place.buildingRegister.status,'multiple_or_partial');
  const [first,second] = packet.place.buildingRegister.records;
  assert.equal(packet.place.buildingRegister.parcelCandidates.length,1);
  assert.equal(first.facts.useApprovalDate,'2000-02-29');
  assert.equal(second.facts.useApprovalDate,null);
  assert.equal(first.facts.buildingAreaM2,88.5);
  assert.equal(first.facts.floorsBelowGround,0);
  assert.notEqual(first.id,second.id);
  assert.equal(packet.spatial.origin.latitude,addressPoint.latitude);
  const nearby = packet.neighborhood.records.find(record=>record.id === museumId);
  assert.equal(nearby.spatialRelation.category,'nearby');
  assert.equal(nearby.spatialRelation.identity,'unconfirmed');
  assert.equal(nearby.spatialRelation.distanceMeters,1194);
  assert.match(nearby.spatialRelation.locationSource,/museum\.seoul\.go\.kr/);
  assert.ok(packet.neighborhood.records.some(record=>record.spatialRelation.category==='regional_background'));
  assert.ok(packet.neighborhood.records.some(record=>record.spatialRelation.category==='location_unconfirmed'));
  assert.ok(!JSON.stringify(packet).includes('fixture-register'));

  const paragraph = (text, id, extra={}) => ({heading:'',text,evidence_ids:[id],...extra});
  const answer = {
    question_type:'특정 장소·건물',held:[],
    paragraphs:[
      paragraph(first.statements.find(text=>text.includes('사용승인일')),first.id),
      paragraph(nearby.distanceStatement,museumId),
      paragraph(nearby.text,museumId),
      paragraph('테스트 A동은 2000년 2월 29일에 처음 지었어요.',first.id),
      paragraph('이 자리에서 2005년 9월 26일에 청계천박물관이 개관했어요.',museumId),
      paragraph(nearby.text,museumId,{visual_ids:[museumId]}),
    ],
  };
  const checked = await mcp('validate_place_answer',{token,question:packet.question,answer});
  assert.deepEqual(checked.rejected.map(item=>item.code),['unsupported_building_fact','unsupported_site_identity','unlinked_visual']);
  assert.equal(checked.paragraphs.length,3);
  assert.ok(checked.sources.some(source=>source.id===first.id&&source.url.includes('data.go.kr')));
  const unsupported = await mcp('validate_place_answer',{token,question:packet.question,answer:{
    ...answer, paragraphs:[
      paragraph('청계천박물관은 2005년 9월 26일 국립 왕궁으로 지정됐어요.',museumId),
      paragraph(nearby.distanceStatement.replace('직선으로','걸어서'),museumId),
      paragraph('테스트 A동의 지상은 8층이에요.',first.id),
    ],
  }});
  assert.equal(unsupported.paragraphs.length,0);
  assert.deepEqual(unsupported.rejected.map(item=>item.code),['unsupported_event_or_media','unsupported_distance','unsupported_number']);
  assert.deepEqual(new Set(requests),new Set(['business.juso.go.kr','apis.data.go.kr','dapi.kakao.com']));
});

test('missing keys and upstream failure leave source-backed local history available', async t => {
  const fetch = t.mock.method(globalThis,'fetch',async () => new Response(null,{status:503}));
  const missing = await enrichMcpPlace(address,history(),{});
  assert.equal(fetch.mock.callCount(),0);
  assert.equal(missing.context.register.status,'not_configured');
  assert.equal(missing.context.origin,null);
  assert.equal(missing.context.relations.get(museumId).category,'regional_background');
  const failed = await enrichMcpPlace(address,history(),{BUILDING_API_KEY:'fixture',KAKAO_REST_API_KEY:'fixture'});
  assert.equal(failed.context.register.status,'unavailable');
  assert.equal(failed.context.origin,null);
  assert.ok(failed.story.scenes.length>0);
});

test('distance separates radius, address mismatch and a separately reviewed historical parcel', async t => {
  t.mock.method(globalThis,'fetch',async () => Response.json({documents:pointDocs}));
  const narrow = await enrichMcpPlace(address,history(),{KAKAO_REST_API_KEY:'fixture',MCP_HISTORY_RADIUS_METERS:'800'});
  assert.equal(narrow.context.relations.get(museumId).category,'regional_background');
  assert.equal(narrow.context.relations.get(museumId).distanceMeters,null);
  const wrongLot = await enrichMcpPlace({...address,lnbrMnnm:'785'},history(),{KAKAO_REST_API_KEY:'fixture'});
  assert.equal(wrongLot.context.origin,null);
  const museum = await enrichMcpPlace({...address,roadAddr:'서울 성동구 청계천로 530',lnbrMnnm:'527',lnbrSlno:'4'},history(),{});
  assert.equal(museum.context.relations.get(museumId).identity,'reviewed_parcel');
  assert.equal(museum.context.relations.get(museumId).category,'direct');
  assert.equal(distanceMeters(addressPoint,addressPoint),0);
  assert.equal(distanceMeters(addressPoint,{latitude:127,longitude:37}),null);
});
