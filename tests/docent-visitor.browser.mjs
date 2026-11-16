// Run against the local Next.js server with Playwright and a Chromium browser.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.DOCENT_PREVIEW_URL || 'http://127.0.0.1:3142';
const browser = await chromium.launch({executablePath:process.env.PLAYWRIGHT_BROWSER || undefined,headless:true});
const title = '마장동의 옛 거리';
const narration = '마장동 거리에는 오가는 사람들의 일상이 남아 있어요.';
const summaryLine = '마장동의 옛 거리에서 동네 사람들의 생활을 살펴볼 수 있어요.';
const road = '서울특별시 성동구 마장로42길 16';
const address = {roadAddr:road,jibunAddr:'서울특별시 성동구 마장동 784',sggNm:'성동구',emdNm:'마장동',admCd:'1120010500',bdNm:'세림아파트',bdMgtSn:'sample'};
const point = {latitude:37.56504,longitude:127.04604};
const source = 'https://museum.seoul.go.kr/test-source';
const photo = {
  id:'photo-1',previewUrl:'https://museum.seoul.go.kr/example.jpg',sourceUrl:source,provider:'서울역사박물관',
  values:{자료명:title,'촬영·제작일':'1965년',촬영장소:'서울 마장동','이용조건':'공공누리 제1유형'},
};
const scene = {id:'scene-1',kind:'photo',date:'1965년',year:1965,title,text:narration,scope:'dong',photos:[photo],cutCount:1,evidence:[{title:'공식 사진 자료',institution:photo.provider,url:source}]};
const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4ioAAAAASUVORK5CYII=','base64');
const receipt = {requestId:'d68b5613-7041-4f46-ba92-85d8c56a00c2',auditPersisted:false};

async function exercise(width, speech) {
  const context = await browser.newContext({
    viewport:{width,height:width<500?844:930}, isMobile:width<500, hasTouch:width<500, deviceScaleFactor:1,
  });
  await context.addInitScript(({speech})=>{
    if (!speech) {
      Object.defineProperty(window,'speechSynthesis',{configurable:true,value:undefined});
      return;
    }
    window.spoken = [];
    class Utterance {constructor(text){this.text=text;}}
    const engine = Object.assign(new EventTarget(),{
      getVoices:()=>[{lang:'ko-KR',name:'Korean fixture'}],
      speak:utterance=>{window.spoken.push(['speak',utterance.lang,utterance.text,utterance.voice?.lang]);utterance.onstart?.();},
      pause:()=>window.spoken.push(['pause']),
      resume:()=>window.spoken.push(['resume']),
      cancel:()=>window.spoken.push(['cancel']),
    });
    Object.defineProperty(window,'SpeechSynthesisUtterance',{configurable:true,value:Utterance});
    Object.defineProperty(window,'speechSynthesis',{configurable:true,value:engine});
  },{speech});
  await context.route('https://dapi.kakao.com/v2/maps/sdk.js?*',route=>route.fulfill({contentType:'application/javascript',body:`(()=>{
    class LatLng {constructor(lat,lng){this.lat=lat;this.lng=lng;}}
    class Map {constructor(node){this.node=node;} addControl(){} setBounds(){} relayout(){}}
    class Marker {constructor({map,title}){this.node=document.createElement('button');this.node.type='button';this.node.textContent=title;this.node.dataset.mapPin='';map?.node.append(this.node);}setMap(){}}
    class Bounds {extend(){}}
    window.kakao={maps:{load:fn=>fn(),LatLng,Map,Marker,LatLngBounds:Bounds,ZoomControl:class{},ControlPosition:{RIGHT:'right'},
      event:{addListener:(target,event,fn)=>target.node?.addEventListener(event,fn),removeListener:(target,event,fn)=>target.node?.removeEventListener(event,fn)}}};
  })();`}));
  await context.route(photo.previewUrl,route=>route.fulfill({contentType:'image/png',body:pixel}));
  await context.route(source,route=>route.fulfill({contentType:'text/html',body:'<title>Official photo fixture</title>'}));
  const data = {
    '/api/status':{address:true,building:false,coordinates:true,map:true,ai:false},
    '/api/address':{candidates:[{...address,token:'fixture-address-token'}],total:1,nonSeoulCount:0},
    '/api/place':{address,history:[],building:{status:'unavailable'},coordinates:{status:'ok',data:{status:'verified',x:point.longitude,y:point.latitude}}},
    '/api/docent':{district:'성동구',dong:'마장동',scenes:[scene],total:1,photoRecords:1,photoGroups:1,unpictured:0,version:'fixture'},
    '/api/docent/narration':{scenes:[{id:scene.id,heading:'마장동 이야기',intro:narration,detail:'사진에는 옛 거리 풍경이 보입니다.'}]},
    '/api/docent/visit':{receipt,returned:1,available:1,spatial:{origin:point,coordinateStatus:'verified'},sources:[scene.evidence[0]],
      mappedRecords:[{id:'museum',title:'청계천박물관 개관',text:'청계천박물관이 문을 열었어요.',date:'2005년',url:source,photo:null,
        spatialRelation:{category:'nearby',point:{latitude:37.5712861,longitude:127.0350222},distanceMeters:1194,locationSource:source}}]},
    '/api/map-config':{javascriptKey:'fixture-public-js-key'},
    '/api/place-photos':{photos:[],providers:[{ok:true}]},
    '/api/place-context':{closed:{status:'unavailable'},parcel:{status:'unavailable'}},
  };
  if (width > 500) data['/api/ai-summary'] = {
    sentences:[{evidenceId:'fixture-evidence',scope:'동네',text:summaryLine,sourceUrl:source,sourceTitle:'마장동 옛 사진',quote:'마장동 거리',relation:'동네 배경'}],
    questions:[],evidence:[],model:'fixture-model',generatedAt:'2026-11-16T10:00:00Z',cached:false,omitted:1,limitations:[],
  };
  await context.route('**/api/**',route=>{
    const path = new URL(route.request().url()).pathname;
    return Object.hasOwn(data,path) ? route.fulfill({json:data[path]}) : route.fulfill({status:503,json:{error:{message:'Fixture service unavailable'}}});
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error=>errors.push(error.message));
  const hydrated = page.waitForResponse(response=>new URL(response.url()).pathname==='/api/status');
  await page.goto(base,{waitUntil:'domcontentloaded',timeout:90000});
  await hydrated;
  await page.getByLabel('서울 주소',{exact:true}).fill(road);
  await page.getByRole('button',{name:'시간 여행 시작'}).click();
  await page.locator('.candidate').filter({hasText:road}).click();
  await page.getByText(narration,{exact:true}).first().waitFor();
  await page.getByRole('button',{name:'사진 한 장으로 시작'}).waitFor();
  await page.getByRole('link',{name:/내 AI로 이 장소/}).waitFor();
  const trace = page.locator('.visit-evidence');
  assert.equal(await trace.evaluate(el=>el.open),false);
  await trace.locator('summary').click();
  await trace.getByText(receipt.requestId).waitFor();
  await trace.getByText(/get_place_history · 1\/1/).waitFor();
  if (width > 500) {
    await trace.getByText(/홈페이지 AI 해설 응답 확인/).waitFor();
    await trace.getByText('마장동 거리',{exact:true}).waitFor();
  }
  assert.ok(!(await trace.textContent()).includes('fixture-address-token'));
  await trace.locator('summary').click();
  await page.getByRole('button',{name:'미니맵 열기'}).click();
  const map = page.getByRole('region',{name:'현장 미니맵'});
  await map.locator('[data-map-pin]').first().waitFor();
  assert.equal(await map.locator('[data-map-pin]').count(),2);
  await map.locator('[data-map-pin]').filter({hasText:'청계천박물관'}).click();
  await map.getByText('청계천박물관이 문을 열었어요.').waitFor();
  await map.getByRole('button',{name:/1,194m/}).waitFor();
  const thumbnail = page.getByRole('button',{name:title+' 사진 확대'});
  await thumbnail.click();
  const dialog = page.getByRole('dialog',{name:title});
  await dialog.waitFor();
  await dialog.getByText('공공누리 제1유형').waitFor();
  await dialog.getByText('서울 마장동',{exact:true}).waitFor();
  await dialog.getByText('1965년',{exact:true}).waitFor();
  assert.equal(await dialog.getByRole('link',{name:'자료 원문 열기'}).getAttribute('href'),source);
  const popup = page.waitForEvent('popup');
  await dialog.getByRole('link',{name:'자료 원문 열기'}).click();
  const original = await popup;
  await original.waitForLoadState('domcontentloaded');
  assert.equal(await original.title(),'Official photo fixture');
  await original.close();
  await dialog.locator('img').dispatchEvent('error');
  await dialog.getByText(/확대 사진을 불러오지 못했어요/).waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await dialog.count(),0);
  assert.equal(await thumbnail.evaluate(el=>document.activeElement===el),true);
  if (speech) {
    await page.getByRole('button',{name:'도슨트 해설 듣기'}).click();
    await page.getByRole('button',{name:'일시정지'}).click();
    await page.getByText('일시정지됨',{exact:true}).waitFor();
    await page.getByRole('button',{name:'이어 듣기'}).click();
    await page.getByRole('button',{name:'정지',exact:true}).click();
    await page.getByRole('button',{name:'도슨트 해설 듣기'}).click();
    await page.getByLabel('서울 주소',{exact:true}).fill('다른 서울 주소');
    await page.getByRole('button',{name:'시간 여행 시작'}).click();
    const calls = await page.evaluate(()=>window.spoken);
    assert.deepEqual(calls.map(call=>call[0]),['speak','pause','resume','cancel','speak','cancel']);
    assert.equal(calls[0][1],'ko-KR');
    assert.ok(calls[0][2].includes(width>500?summaryLine:narration) && !calls[0][2].includes('MCP'));
    assert.equal(calls[0][3],'ko-KR');
  } else {
    await page.getByText('이 브라우저에서는 음성 재생을 지원하지 않아요.').waitFor();
  }
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),true);
  assert.deepEqual(errors,[]);
  console.log(`Chromium ${width}px: address, story, trace, map pins, photo, source, ${speech?'Korean speech controls':'speech fallback'} pass`);
  await context.close();
}

try {
  await exercise(1280,true);
  await exercise(390,true);
  await exercise(390,false);
} finally {
  await browser.close();
}
