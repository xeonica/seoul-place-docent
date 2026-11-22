import {DocentTourV2Schema,TOUR_SECTION_IDS,TOUR_SECTION_TITLES,validateDocentTourV2,type DocentTourSection,type DocentTourV2} from './docent-tour-schema';
import {HistoricalEventSchema,HistoricalPlaceNameSchema} from './historical-records';

type Obj=Record<string,unknown>;
type SourceRow=Obj&{id:string;relationScope:string;claimIds:string[];mediaType:string;verificationStatus:string;usableAsVerifiedEvidence:boolean;displayStatus:'verified_display'|'unverified_display'|'source_link_only'|'withheld'|'not_applicable'};
const asObj=(v:unknown):Obj=>v&&typeof v==='object'&&!Array.isArray(v)?v as Obj:{};
const arr=(v:unknown):Obj[]=>Array.isArray(v)?v.map(asObj):[];
const strings=(v:unknown):string[]=>Array.isArray(v)?v.filter((x):x is string=>typeof x==='string'):[];
const str=(v:unknown,fallback='')=>typeof v==='string'?v:fallback;
const nullable=(v:unknown)=>typeof v==='string'&&v?v:null;
const rel=(v:unknown):string=>['exact_building','exact_parcel','historical_site','nearby','dong_context','district_context'].includes(String(v))?String(v):'unknown';
const recordRelation=(item:Obj,kind:string)=>{const explicit=rel(item.relationType||item.relation_type);if(explicit!=='unknown')return explicit;const scope=String(item.scope||'');if(scope==='dong'||scope==='legal_dong')return 'dong_context';if(scope==='district')return 'district_context';if(scope==='building')return 'exact_building';if(scope==='parcel')return 'exact_parcel';return 'unknown';};
const photoRelation=(photo:Obj)=>{
 const raw=String(photo.relation_type||photo.relationType||photo.locationRelation||'');
 if(['exact_building','exact_parcel','historical_site','nearby'].includes(raw))return raw;
 if(raw==='neighborhood'||raw==='dong_context'||photo.scope==='dong')return 'dong_context';
 if(raw==='district'||raw==='district_context'||photo.scope==='district')return 'district_context';
 return 'unknown';
};
const videoRelation=(video:Obj)=>{
 const raw=String(video.relation||video.relationType||'');
 if(raw==='legal_dong_candidate'||raw==='place_candidate')return 'dong_context';
 if(raw==='district_background')return 'district_context';
 return rel(raw);
};
const mediaKind=(v:unknown):'photo'|'video'|'article'|'document'|'building_register'|'map'|'scene'|'other'=>{const s=String(v||'').toLowerCase();if(s.includes('photo')||s==='image')return 'photo';if(s.includes('video'))return 'video';if(s.includes('article')||s.includes('news'))return 'article';if(s.includes('document')||s==='file')return 'document';if(s.includes('register'))return 'building_register';if(s==='map')return 'map';if(s==='scene')return 'scene';return 'other';};
const uniq=(items:string[])=>[...new Set(items.filter(Boolean))];
const titles=TOUR_SECTION_TITLES;
const subtitles=['첫 번째 정거장 · 장소의 이해','두 번째 정거장 · 지역의 기원과 옛 모습','세 번째 정거장 · 역사적 사건과 산업의 발전','네 번째 정거장 · 건물과 부지의 이력','다섯 번째 정거장 · 과거에서 현재로','여섯 번째 정거장 · 현재 진행 중인 변화','일곱 번째 정거장 · 역사적 의미와 마무리'];
const purposes=['검색 장소의 현재 정보와 확인된 관찰 지점을 소개합니다.','공식 자료에서 확인된 지명과 옛 지역 기록을 살핍니다.','출처가 연결된 사건과 사회·산업 변화를 설명합니다.','건물·필지에 직접 연결된 이력과 공식 현재 정보를 구분합니다.','시대별 도시공간 기록과 검증된 사진을 살핍니다.','장소와 관련성이 확인된 현재 변화 기록만 다룹니다.','앞서 확인한 자료를 정리하고 핵심 질문으로 돌아옵니다.'];
const photoTopics=[['건물','장소','아파트','현재 모습'],['지명','동명','유래','옛 이름','고지도','옛 지도','지도'],['시장','산업','사건','공장','축산','상업','철도','전쟁','운동','노동','교통','개통','변화'],['건물','부지','필지','아파트','건축','공사','준공','철거','옛 모습'],['도시공간','도시 공간','거리','도로','주거','항공사진','지도','도시','공간','골목'],['재개발','재건축','도시재생','정비','착공','보존','현재 변화'],['대표','상징','기억','의미','마무리','장소의 역사']];
const videoTopics=[['건물','장소','아파트'],['지명','동명','유래','옛 이름'],['시장','산업','사건','공장','축산','철도','전쟁','운동','노동','교통','도시 변화'],['건물','부지','필지','아파트','건축','재건축'],['도시공간','도시 공간','거리','도로','주거','항공','지도','도시 변화'],['재개발','재건축','도시재생','정비','착공','보존']];
const DIRECT_SCOPES=['exact_building','exact_parcel'];
const linkablePhoto=(p:Obj)=>p.verificationStatus!=='REJECTED'&&!!(p.sourceUrl||p.sourcePageUrl);
// Photos with an image and an institution source page are shown as reference images even before review.
// Explicit rejections and rights refusals (displayable:false) stay hidden.
const showablePhoto=(p:Obj)=>p.verificationStatus!=='REJECTED'&&p.displayable!==false&&typeof p.imageUrl==='string'&&!!p.imageUrl&&!!(p.sourceUrl||p.sourcePageUrl);
const displayablePhoto=(p:Obj)=>p.verificationStatus==='VERIFIED'&&p.displayable===true&&typeof p.imageUrl==='string'&&!!p.imageUrl&&!!(p.sourceUrl||p.sourcePageUrl)&&typeof p.mediaId==='string'&&!!p.mediaId&&typeof p.sourceRecordId==='string'&&!!p.sourceRecordId;
// Keep the tour planner independent from the pre-rollback docent-experience module.
const scopes:Record<string,number>={exact_building:0,exact_parcel:1,historical_site:2,nearby:3,dong_context:4,district_context:5,unknown:6};
const scopePriority=(value:string)=>scopes[value as keyof typeof scopes]??6;
const normalized=(value:string)=>value.normalize('NFKC').toLocaleLowerCase('ko-KR');
const containsAny=(text:string,terms:string[])=>terms.filter(term=>text.includes(normalized(term))).length;
const dateOrder=(v:unknown)=>{const m=String(v||'').match(/(?:18|19|20)\d{2}/);return m?Number(m[0]):Number.MAX_SAFE_INTEGER;};
const scopesSameAsPlace=(value:string)=>DIRECT_SCOPES.includes(value);

function requestScope(question:string,questionType:string):'comprehensive_tour'|'focused_question'{
 const q=normalized(question);
 if(!q)return 'comprehensive_tour';
 if(/(?:언제|몇\s*년|연도|무슨\s*뜻|무슨\s*이름|이름의\s*유래|사진만|옛\s*사진만|영상만|영상의\s*내용|몇\s*층|주용도)/.test(q))return 'focused_question';
 if(['사진 찾기','지명 유래'].includes(questionType))return 'focused_question';
 if(['동네 역사','시대별 모습'].includes(questionType))return 'comprehensive_tour';
 if(/도슨트|역사\s*(?:해설|투어|알려|설명)|투어|둘러보|과거와\s*현재|변화|역사를\s*알|이\s*장소에\s*대해/.test(q))return 'comprehensive_tour';
 return questionType==='특정 장소·건물'&&!/언제|몇\s*년|사진|영상|유래/.test(q)?'comprehensive_tour':'focused_question';
}

/** Build a deterministic, source-linked outline. It never writes historical prose. */
export function buildDocentTourV2(packetValue:unknown):DocentTourV2{
 const packet=asObj(packetValue),evidence=asObj(packet.evidence),approved=arr(evidence.records),candidates=arr(evidence.candidates),scenes=arr(asObj(packet.neighborhood).records),allPhotos=arr(asObj(packet.visuals).photos),allVideos=arr(asObj(packet.videos).records),place=asObj(packet.place),placeRecords=arr(place.records),registers=arr(asObj(packet.registerDiagnostics).records);
 const detailLevel=['brief','full'].includes(String(packet.detailLevel))?String(packet.detailLevel) as 'brief'|'full':'standard';
 const videos=detailLevel==='brief'?allVideos.slice(0,2):allVideos;
 const sourceRows:SourceRow[]=[];
  const add=(id:unknown,item:Obj,kind:unknown,ver:unknown,usable:boolean,claims:string[]=[],displayStatus:SourceRow['displayStatus']='not_applicable')=>{if(typeof id!=='string'||!id)return;const type=mediaKind(kind);sourceRows.push({id,title:str(item.title||item.record_title||item.name,id),sourceUrl:nullable(item.sourceUrl||item.sourcePageUrl||item.source_url||item.url),institution:nullable(item.sourceInstitution||item.institution||item.provider),date:nullable(item.eventDate||item.timeLabel||item.date||item.publicationDate||item.publishedAt||item.approved),eventDate:nullable(item.eventDate||item.timeLabel),subjectPeriod:nullable(item.subjectPeriod),publicationDate:nullable(item.publicationDate||item.publishedAt),dateType:item.eventDate||item.timeLabel?'event':item.publicationDate||item.publishedAt?'publication':item.approved?'approval':item.date?'capture':'unknown',mediaType:type,relationScope:type==='photo'?photoRelation(item):type==='video'?videoRelation(item):recordRelation(item,type),verificationStatus:str(ver,'not_checked'),usableAsVerifiedEvidence:usable,displayStatus,claimIds:claims});};
 for(const e of approved){const claims=arr(e.claims);add(e.evidenceId,e,e.mediaType,e.usableAsVerifiedEvidence?'reviewed_source_claim':'not_checked',!!e.usableAsVerifiedEvidence,e.usableAsVerifiedEvidence?claims.map(c=>str(c.claimId)).filter(Boolean):[]);}
 // Scene links live in source/evidence; lift them so the source list carries the original link and institution.
 for(const s of scenes){const src=asObj(s.source),ev=asObj(arr(s.evidence)[0]);add(s.id,{...s,sourceUrl:s.sourceUrl||src.url||ev.url,institution:s.institution||src.institution||ev.institution},'scene','source_metadata_only',false,[]);}
 for(const c of candidates)add(c.evidenceId,c,c.mediaType,'candidate_only',false,[]);
 for(const v of videos)add(v.evidenceId||v.id,v,'video',Array.isArray(v.verifiedSegments)&&v.verifiedSegments.length?'source_metadata_only':'candidate_only',false,[]);
 for(const r of [...placeRecords,...registers]){const verified=!!(r.status==='ok'||r.status==='ready'||r.verified),verification=r.candidateOnly===true?'candidate_only':verified?'official_register':'not_checked';add(r.id,r,'building_register',verification,verified&&!r.candidateOnly,[]);}
 const sources=[...new Map(sourceRows.map(s=>[s.id,s])).values()].sort((a,b)=>scopePriority(a.relationScope)-scopePriority(b.relationScope)||a.id.localeCompare(b.id)).slice(0,100);
 const byId=new Map(sources.map(s=>[s.id,s])),findScenes=(re:RegExp)=>scenes.filter(s=>re.test(`${s.title} ${s.text}`)).map(s=>str(s.id)).filter(Boolean),findEvidence=(re:RegExp,directOnly=false)=>approved.filter(e=>(!directOnly||DIRECT_SCOPES.includes(rel(e.relationType)))&&re.test(`${e.title} ${arr(e.claims).map(c=>c.text).join(' ')}`)).map(e=>str(e.evidenceId)).filter(Boolean);
 const district=str(packet.district||asObj(packet.neighborhood).district),dong=str(packet.dong||asObj(packet.neighborhood).dong),address=str(packet.address),question=str(packet.question),questionType=str(asObj(packet.classification).questionType||'종합 도슨트'),placeName=str(place.name||packet.address),scope=requestScope(question,questionType);
  const historyIds=(...kinds:string[])=>approved.filter(e=>kinds.includes(String(e.historyKind))&&e.usableAsVerifiedEvidence===true).map(e=>str(e.evidenceId)).filter(Boolean);
 const currentRegisterIds=registers.filter(r=>r.recordType==='current_building_official_record'&&r.verified===true).map(r=>str(r.id)).filter(Boolean),historicalRegisterIds=registers.filter(r=>r.recordType==='historical_building_official_record').map(r=>str(r.id)).filter(Boolean);
 const sectionSources:string[][]=[
  uniq([...placeRecords.map(r=>str(r.id)),...currentRegisterIds,...findEvidence(/용도|연면적|층|사용승인|현황/i)]),
   uniq([...historyIds('toponymy'),...findScenes(/지명|동명|유래|기원|옛 이름/),...findEvidence(/지명|동명|유래|기원|옛 이름/)]),
   uniq([...historyIds('event','industrial_change','social_change'),...findScenes(/시장|공장|산업|사건|전쟁|운동|노동|철도|개통|변화|붕괴|사고|재난|참사/),...findEvidence(/시장|공장|산업|사건|전쟁|운동|노동|철도|개통|변화|붕괴|사고|재난|참사/)]),
  uniq([...historicalRegisterIds,...placeRecords.filter(r=>!r.recordType).map(r=>str(r.id)),...findEvidence(/./,true)]),
   uniq([...historyIds('urban_space'),...findScenes(/사진|지도|도로|주거|공간|도시|전경|공사|건설|준공|복구/),...findEvidence(/사진|지도|도로|주거|공간|도시/)]),
  uniq(findEvidence(/재개발|재건축|도시재생|보존|착공|정비사업/)),
  [],
 ];
 sectionSources[6]=uniq(sectionSources.slice(0,5).flat());

 const photoIdsBySection=Array.from({length:7},()=>[] as string[]),usedPhotos=new Set<string>();
 const rankedPhotos=allPhotos.filter(showablePhoto).filter(p=>!!str(p.evidenceId||p.mediaId)).map(p=>({photo:p,id:str(p.evidenceId||p.mediaId),scope:photoRelation(p),text:normalized(`${p.title||''} ${p.caption||''} ${p.note||''}`),links:new Set([str(p.evidenceId),...strings(p.relatedEvidenceIds),...strings(p.storyEvidenceIds)].filter(Boolean))}));
 const directOpening=rankedPhotos.filter(({photo,scope:photoScope})=>scopesSameAsPlace(photoScope)&&photo.locationVerification==='reviewed_relation').sort((a,b)=>Number(normalized(str(b.photo.title)).includes(normalized(placeName)))-Number(normalized(str(a.photo.title)).includes(normalized(placeName)))||scopePriority(a.scope)-scopePriority(b.scope)||dateOrder(a.photo.date)-dateOrder(b.photo.date)||a.id.localeCompare(b.id))[0];
 const openingPhotos=directOpening?[directOpening.id]:[];openingPhotos.forEach(id=>usedPhotos.add(id));
 const photoPairs:{id:string;section:number;score:number;date:number}[]=[];
 for(const item of rankedPhotos){if(usedPhotos.has(item.id))continue;for(let section=0;section<7;section++){
  const terms=photoTopics[section],matches=containsAny(item.text,terms),linked=sectionSources[section].some(id=>item.links.has(id)),direct=scopesSameAsPlace(item.scope),relationBoost=direct?(section===0||section===3?8:1):item.scope==='nearby'?(section===3?0:4):item.scope==='dong_context'?(section===1||section===2||section===4?3:1):item.scope==='district_context'?0:0;
  if(section===3&&!direct)continue;
  if(section===0&&(!direct||!normalized(item.text).includes(normalized(placeName))&&!linked))continue;
  if(section===3&&!matches&&!linked)continue;
  if(section!==0&&section!==3&&matches===0&&!linked)continue;
  const score=relationBoost+matches*5+(linked?14:0)+(item.photo.date?0.5:0);
  if(score>=4)photoPairs.push({id:item.id,section,score,date:dateOrder(item.photo.date)});
 }}
 const sectionPhotoCounts=photoIdsBySection.map(()=>0);
 photoPairs.sort((a,b)=>b.score-a.score||[3,2,4,5,1,0,6].indexOf(a.section)-[3,2,4,5,1,0,6].indexOf(b.section)||a.date-b.date||a.id.localeCompare(b.id));
 for(const pair of photoPairs){if(usedPhotos.size>=8)break;if(usedPhotos.has(pair.id)||sectionPhotoCounts[pair.section]>=4)continue;photoIdsBySection[pair.section].push(pair.id);sectionPhotoCounts[pair.section]++;usedPhotos.add(pair.id);}

 const videoIdsBySection=Array.from({length:7},()=>[] as string[]),videoPairs:{id:string;section:number;score:number;date:number}[]=[];
 for(const video of videos){const id=str(video.evidenceId||video.id),source=byId.get(id);if(!id||!source||source.mediaType!=='video'||video.relation==='seoul_background')continue;const text=normalized(`${video.title||''} ${video.description||''} ${video.historicalPeriods||''}`),relation=videoRelation(video);
  for(let section=0;section<6;section++){const matches=containsAny(text,videoTopics[section]);if(matches===0)continue;const relationBoost=relation==='dong_context'?3:relation==='district_context'?0:0;const score=matches*5+relationBoost+(Array.isArray(video.verifiedSegments)&&video.verifiedSegments.length?1:0);if(score>=5)videoPairs.push({id,section,score,date:dateOrder(video.date)});}
 }
 const usedVideos=new Set<string>();videoPairs.sort((a,b)=>b.score-a.score||[2,3,4,5,1,0].indexOf(a.section)-[2,3,4,5,1,0].indexOf(b.section)||a.date-b.date||a.id.localeCompare(b.id));
 for(const pair of videoPairs){if(usedVideos.size>=3)break;if(usedVideos.has(pair.id))continue;videoIdsBySection[pair.section].push(pair.id);usedVideos.add(pair.id);}

 const sections:DocentTourSection[]=TOUR_SECTION_IDS.map((id,i)=>{
  const evidenceIds=sectionSources[i].filter(sid=>byId.has(sid)),sectionClaims=uniq(evidenceIds.flatMap(sid=>byId.get(sid)?.claimIds||[])),sourceIds=[...evidenceIds],direct=evidenceIds.some(sid=>{const source=byId.get(sid);return !!source?.usableAsVerifiedEvidence&&source.mediaType!=='building_register'&&DIRECT_SCOPES.includes(source.relationScope);}),verified=evidenceIds.some(sid=>{const source=byId.get(sid);return !!source&&(source.verificationStatus==='reviewed_source_claim'&&source.claimIds.length>0&&(i!==3||DIRECT_SCOPES.includes(source.relationScope))||(i!==3&&source.verificationStatus==='official_register'));}),has=evidenceIds.length>0;
  const directGap=i===3&&!direct,missingReason=directGap?'건물·필지에 직접 연결된 승인 역사 근거가 없습니다. 현재 공식 정보와 주변 지역 자료를 분리하고 건립 이전 이력은 미확인으로 남기세요.':!has?['이 주소의 공식 지명 유래 자료가 응답에 없습니다.','관련 사건·산업 자료가 확인되지 않았습니다.','건물 또는 필지 직접 자료가 없습니다.','건물 또는 필지 직접 과거 자료가 확인되지 않았습니다.','시대별 공간 변화 자료가 없습니다.','장소 관련 최신 공식 사업 기록이 없습니다.'][i]||'연결된 근거가 없습니다.':null;
  const scopeValues=evidenceIds.map(sid=>byId.get(sid)?.relationScope||'unknown'),relationScope=scopeValues.length&&scopeValues.every(s=>s===scopeValues[0])?scopeValues[0]:'mixed';
  return {id,order:i+1,title:titles[i],subtitle:subtitles[i],purpose:purposes[i],narrationInstructions:`검증된 자료만 사용하고 자료의 공간 범위·시기·출처를 문장 가까이에 표시하세요. ${directGap?'건물 자체의 과거 이력은 확인되지 않았다고 명시하세요.':''} 자료가 부족하면 분량을 채우지 마세요.`,evidenceIds,claimIds:sectionClaims,photoIds:photoIdsBySection[i],videoIds:videoIdsBySection[i],sourceIds,relationScope:relationScope as DocentTourSection['relationScope'],verificationStatus:!has?'missing':verified&&!directGap?'supported':'partial',missingEvidenceReason:missingReason,recommendedLength:i===0?{min:150,max:200}:i===6?{min:120,max:300}:{min:250,max:450}};
 });
 const uncertainty=[...new Set(sections.map(s=>s.missingEvidenceReason).filter((s):s is string=>!!s))],centralQuestion=question||`${dong||district||'이 장소'}의 공간은 어떤 기록을 남겼을까요?`;
 const photoAssets=allPhotos.map(p=>{const displayable=displayablePhoto(p),showable=showablePhoto(p),id=str(p.evidenceId||p.mediaId),comparisonVerified=p.comparisonStatus==='same_location_verified'&&!!p.comparisonGroupId;return {id,mediaId:nullable(p.mediaId),sourceRecordId:nullable(p.sourceRecordId),title:str(p.title,id),sourceUrl:nullable(p.sourceUrl||p.sourcePageUrl),date:nullable(p.date),captureDate:nullable(p.captureDate||(p.dateBasis==='capture'?p.date:null)),publicationDate:nullable(p.publicationDate||(p.dateBasis==='publication'?p.date:null)),dateBasis:['capture','publication','catalog'].includes(String(p.dateBasis))?String(p.dateBasis):'unknown',cameraLocation:p.capturePointVerified===true?nullable(p.cameraLocation):null,subjectLocation:p.subjectLocationVerified===true?nullable(p.subjectLocation):null,viewDirection:p.viewDirectionVerified===true?nullable(p.viewDirection):null,comparisonGroupId:comparisonVerified?nullable(p.comparisonGroupId):null,comparisonStatus:comparisonVerified?'same_location_verified':p.comparisonStatus==='not_comparable'?'not_comparable':'unverified',relationScope:photoRelation(p),displayStatus:displayable?'verified_display':showable?'unverified_display':linkablePhoto(p)?'source_link_only':'withheld',imageUrl:showable?nullable(p.imageUrl):null,credit:nullable(p.credit),license:nullable(p.license),relatedEvidenceIds:strings(p.relatedEvidenceIds)};}).filter(p=>p.id);
 const historicalNames=arr(packet.historicalNames).map(item=>HistoricalPlaceNameSchema.safeParse(item)).filter((result):result is {success:true;data:import('./historical-records').HistoricalPlaceName}=>result.success).map(result=>result.data);
 const historicalEvents=arr(packet.historicalEvents).map(item=>HistoricalEventSchema.safeParse(item)).filter((result):result is {success:true;data:import('./historical-records').HistoricalEvent}=>result.success).map(result=>result.data);
 const currentRows=approved.filter(e=>e.historyKind==='urban_space'&&e.usableAsVerifiedEvidence===true&&['current','active','in_force'].includes(String(e.currentStatus||e.status).toLowerCase())&&typeof (e.asOfDate||e.effectiveDate)==='string');
 const noUpdateRows=approved.filter(e=>e.historyKind==='urban_space'&&e.usableAsVerifiedEvidence===true&&e.currentStatus==='no_current_update'&&typeof (e.asOfDate||e.effectiveDate)==='string');
 const historicalRows=approved.filter(e=>e.historyKind==='urban_space'&&e.usableAsVerifiedEvidence===true),selectedCurrentRows=currentRows.length?currentRows:noUpdateRows;
 const currentSourceIds=uniq(selectedCurrentRows.map(e=>str(e.evidenceId)).filter(id=>byId.has(id))),asOfDates=selectedCurrentRows.map(e=>str(e.asOfDate||e.effectiveDate)).filter(Boolean).sort();
 const historicalSourceIds=uniq(historicalRows.map(e=>str(e.evidenceId)).filter(id=>byId.has(id)));
 const currentStatus=currentRows.length?'official_current':noUpdateRows.length?'no_current_update':historicalRows.length?'historical_only':'not_checked';
 const currentChange={status:currentStatus,asOfDate:selectedCurrentRows.length?asOfDates.at(-1)??null:null,sourceIds:currentRows.length||noUpdateRows.length?currentSourceIds:historicalSourceIds,note:currentRows.length?'공식 출처와 기준일이 연결된 현재 계획 자료입니다.':noUpdateRows.length?'공식 조회 결과와 기준일이 연결된 현재 자료 없음 상태입니다.':historicalRows.length?'역사적 도시공간 자료만 확인되었으며 현재 계획 여부는 확인되지 않았습니다.':'현재 계획 자료를 확인하지 못했습니다. 자료 미존재와 조회 미실행은 구분해야 합니다.'};
 const result={version:'2.0',placeName,address,district,dong,questionType,responseScope:scope,detailLevel,centralQuestion,currentChange,opening:{targetCharacters:{min:150,max:200},instructions:'장소명·주소·자치구·동과 확인된 현재 정보에서 시작하고 핵심 질문을 제시하세요. 직접 장소로 검증된 대표 사진만 사용하세요. 주변·동네 사진을 대상 건물 사진처럼 표시하지 마세요.',placeImageIds:openingPhotos,sourceIds:sections[0].sourceIds},sections,sources,historicalNames,historicalEvents,photoAssets,uncertainties:uncertainty,provenance:{provider:'seoul_place_docent_mcp',returnedEvidenceIds:uniq(sources.filter(s=>s.mediaType!=='photo'&&s.mediaType!=='video').map(s=>s.id)),returnedPhotoIds:photoAssets.map(p=>p.id),returnedVideoIds:videos.map(v=>str(v.evidenceId||v.id)).filter(Boolean),requestId:nullable(asObj(packet.audit).requestId||asObj(packet.provenance).requestId),semanticVerification:'not_checked',operatorAiCalls:0}};
 const parsed=DocentTourV2Schema.parse(result),validation=validateDocentTourV2(parsed);if(!validation.valid)throw new Error('DocentTourV2 validation failed: '+validation.reasonCodes.join(','));return parsed;
}

export function docentTourInstructions(plan:DocentTourV2){
 const integrity='승인된 claimIds는 확정 근거로 사용하세요. source_metadata_only 장면과 candidate_only 후보도 검토 전 자료로 해설에 사용할 수 있습니다. 소장기관과 함께 기록이 전하는 내용으로 서술하고 원문 링크를 붙이세요. 검토 상태는 본문에서 반복하지 말고 마지막 출처 및 검증 정보에 한 번만 적으세요. historicalNames는 옛 지명 조사 후보입니다. 공식 페이지·표제는 확인했어도 과거 경계와 현재 법정동·행정동의 일치가 미검증이므로, 특정 주소의 지명 유래나 건물 역사로 단정하지 마세요. 건축물대장의 사용승인일을 최초 건립일로 바꾸지 마세요. 사진은 plan에 연결된 ID(verified_display 또는 unverified_display)와 같은 자료의 제목·이미지·출처만 사용하고 주변 사진을 건물 직접 사진처럼 표시하지 마세요. unverified_display는 검토 전 참고 사진이므로 표시하되 캡션에 날짜·소장기관·장소 범위를 적고 사진만으로 역사 사실을 단정하지 마세요. 영상은 plan에 연결된 관련 후보만 소개하고 verifiedSegments가 있는 경우에만 구간 시각을 사용하세요. 의미 검증은 not_checked이며 검증 완료라고 표현하지 마세요.';
 if(plan.responseScope==='focused_question')return `사용자 질문의 좁은 범위에 집중하여 기존 answerSchema로 답하고 7부 전체를 강제하지 마세요. tourPlan은 관련성이 있는 경우에만 출처를 찾는 보조 자료입니다. 질문에 필요하지 않은 부를 채우지 마세요. ${integrity}`;
 const detail=plan.detailLevel==='brief'?'각 부를 짧게 한두 문장으로 요약하되 부와 순서는 모두 유지하세요.':plan.detailLevel==='full'?'근거가 충분한 부를 더 자세히 풀되 자료가 부족한 부는 짧은 미확인 안내로 남기세요.':'각 부를 근거에 비례한 보통 분량으로 설명하세요.';
 return `종합 역사 도슨트 요청입니다. 아래 순서를 도입부, 1부 장소의 이해, 2부 지명과 지역의 기원, 3부 역사적 사건과 변화, 4부 건물 및 부지의 역사, 5부 도시공간의 변화, 6부 현재 진행 중인 변화, 7부 역사적 의미와 마무리, 출처 및 검증 정보 순으로 모두 유지하세요. 자료가 없는 부도 생략하지 말고 미확인으로 표시하세요. brief·standard·full은 깊이와 분량만 다르고 이 구조는 같습니다. ${detail} ${integrity}${photoPlacementGuide(plan)}`;
}

/** Spells out which photos follow which part, so cards land between paragraphs instead of in one block. */
export function photoPlacementGuide(plan:DocentTourV2){
 const title=(id:string)=>plan.photoAssets.find(p=>p.id===id)?.title||id;
 const steps=[{label:'도입부',ids:plan.opening.placeImageIds},...plan.sections.map(s=>({label:`${s.order}부`,ids:s.photoIds}))]
  .filter(step=>step.ids.length>0)
  .map(step=>`${step.label} 뒤: ${step.ids.map(id=>`${id}(${title(id)})`).join(', ')}`);
 if(!steps.length)return '';
 return ` 사진 배치: 각 부를 쓴 직후 해당 사진을 visuals.photos에서 찾아 show_place_photos로 호출하세요(한 번에 1~2장, 3장 이상이면 나눠서). ${steps.join(' / ')}. 이 목록에 없는 부에는 사진을 넣지 마세요.`;
}
