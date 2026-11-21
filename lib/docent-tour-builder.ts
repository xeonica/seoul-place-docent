import {DocentTourV2Schema,TOUR_SECTION_IDS,TOUR_SECTION_TITLES,validateDocentTourV2,type DocentTourSection,type DocentTourV2} from './docent-tour-schema';
import {relationPriority} from './docent-experience';

type Obj=Record<string,unknown>;
type SourceRow=Obj&{id:string;relationScope:string;claimIds:string[];mediaType:string;verificationStatus:string;usableAsVerifiedEvidence:boolean};
const asObj=(v:unknown):Obj=>v&&typeof v==='object'&&!Array.isArray(v)?v as Obj:{};
const arr=(v:unknown):Obj[]=>Array.isArray(v)?v.map(asObj):[];
const str=(v:unknown,fallback='')=>typeof v==='string'?v:fallback;
const nullable=(v:unknown)=>typeof v==='string'&&v?v:null;
const rel=(v:unknown):string=>['exact_building','exact_parcel','historical_site','nearby','dong_context','district_context'].includes(String(v))?String(v):'unknown';
const mediaKind=(v:unknown):'photo'|'video'|'article'|'document'|'building_register'|'map'|'scene'|'other'=>{const s=String(v||'').toLowerCase();if(s.includes('photo')||s==='image')return 'photo';if(s.includes('video'))return 'video';if(s.includes('article')||s.includes('news'))return 'article';if(s.includes('document')||s==='file')return 'document';if(s.includes('register'))return 'building_register';if(s==='map')return 'map';if(s==='scene')return 'scene';return 'other';};
const uniq=(items:string[])=>[...new Set(items.filter(Boolean))];
const titles=TOUR_SECTION_TITLES;
const subtitles=['첫 번째 정거장 · 장소의 이해','두 번째 정거장 · 지역의 기원과 옛 모습','세 번째 정거장 · 역사적 사건과 산업의 발전','네 번째 정거장 · 이 장소가 등장한 시대','다섯 번째 정거장 · 과거에서 현재로','여섯 번째 정거장 · 현재와 미래','일곱 번째 정거장 · 역사적 의미와 마무리'];
const purposes=['검색 장소의 현재 정보와 확인된 관찰 지점을 소개합니다.','공식 자료에서 확인된 지명과 옛 지역 기록을 살핍니다.','출처가 연결된 사건과 사회·산업 변화를 설명합니다.','건물·필지에 직접 연결된 이력과 공식 현재 정보를 구분합니다.','시대별 도시공간 기록과 검증된 사진을 살핍니다.','장소와 관련성이 확인된 현재 변화 기록만 다룹니다.','앞서 확인한 자료를 정리하고 핵심 질문으로 돌아옵니다.'];
const purposeTerms=[/주소|건물|용도|층|승인|place/i,/지명|유래|옛 이름|동명|기원/i,/사건|산업|시장|공장|전쟁|운동|개발|변화|기록|영상/i,/건물|부지|필지|아파트|사용승인|대장/i,/사진|영상|지도|도로|공간|주거|전후|도시|기록/i,/재개발|재건축|도시재생|보존|착공|사업|정비/i,/.*/];

/** Build a deterministic, source-linked outline. It never writes historical prose. */
export function buildDocentTourV2(packetValue:unknown):DocentTourV2{
 const packet=asObj(packetValue),evidence=asObj(packet.evidence),approved=arr(evidence.records),candidates=arr(evidence.candidates),scenes=arr(asObj(packet.neighborhood).records),photos=arr(asObj(packet.visuals).photos),videos=arr(asObj(packet.videos).records),place=asObj(packet.place),placeRecords=arr(place.records),registers=arr(asObj(packet.registerDiagnostics).records);
 const sourceRows:SourceRow[]=[];
 const add=(id:unknown,item:Obj,kind:unknown,ver:unknown,usable:boolean,claims:string[]=[])=>{if(typeof id!=='string'||!id)return;sourceRows.push({id,title:str(item.title||item.record_title||item.name,id),sourceUrl:nullable(item.sourceUrl||item.source_url||item.url),institution:nullable(item.sourceInstitution||item.institution||item.provider),date:nullable(item.eventDate||item.date||item.publishedAt||item.approved),dateType:item.eventDate?'event':item.publishedAt?'publication':item.approved?'approval':item.date?'capture':'unknown',mediaType:mediaKind(kind),relationScope:rel(item.relationType||item.relation_type),verificationStatus:str(ver,'not_checked'),usableAsVerifiedEvidence:usable,claimIds:claims});};
 for(const e of approved){const claims=arr(e.claims);add(e.evidenceId,e,e.mediaType,e.usableAsVerifiedEvidence?'reviewed_source_claim':'not_checked',!!e.usableAsVerifiedEvidence,e.usableAsVerifiedEvidence?claims.map(c=>str(c.claimId)).filter(Boolean):[]);}
 for(const s of scenes)add(s.id,s,'scene','source_metadata_only',false,[]);
 for(const c of candidates)add(c.evidenceId,c,c.mediaType,'candidate_only',false,[]);
 for(const p of photos)add(p.evidenceId||p.mediaId,p,'photo','source_metadata_only',false,[]);
 for(const v of videos)add(v.evidenceId||v.id,v,'video',Array.isArray(v.verifiedSegments)&&v.verifiedSegments.length?'source_metadata_only':'candidate_only',false,[]);
 for(const r of [...placeRecords,...registers])add(r.id,r,'building_register',r.status==='ok'||r.verified?'official_register':'not_checked',!!(r.status==='ok'||r.verified),[]);
 const sources=[...new Map(sourceRows.map(s=>[s.id,s])).values()].sort((a,b)=>(relationPriority[a.relationScope as keyof typeof relationPriority]??6)-(relationPriority[b.relationScope as keyof typeof relationPriority]??6)||a.id.localeCompare(b.id)).slice(0,100);
 const byId=new Map(sources.map(s=>[s.id,s])),findScenes=(re:RegExp)=>scenes.filter(s=>re.test(`${s.title} ${s.text}`)).map(s=>str(s.id)).filter(Boolean),findEvidence=(re:RegExp,directOnly=false)=>approved.filter(e=>(!directOnly||['exact_building','exact_parcel','historical_site'].includes(rel(e.relationType)))&&re.test(`${e.title} ${arr(e.claims).map(c=>c.text).join(' ')}`)).map(e=>str(e.evidenceId)).filter(Boolean);
 const district=str(packet.district||asObj(packet.neighborhood).district),dong=str(packet.dong||asObj(packet.neighborhood).dong),address=str(packet.address),question=str(packet.question),questionType=str(asObj(packet.classification).questionType||'종합 도슨트');
 const sectionSources:string[][]=[
  uniq([...placeRecords.map(r=>str(r.id)),...registers.map(r=>str(r.id)),...findEvidence(/용도|연면적|층|사용승인|현황/i)]),
  uniq([...findScenes(/지명|동명|유래|기원|옛 이름/),...findEvidence(/지명|동명|유래|기원|옛 이름/)]),
  uniq([...findScenes(/시장|공장|산업|사건|전쟁|운동|노동|철도|개통|변화/),...findEvidence(/시장|공장|산업|사건|전쟁|운동|노동|철도|개통|변화/)]),
  uniq([...placeRecords.map(r=>str(r.id)),...registers.map(r=>str(r.id)),...findEvidence(/./,true)]),
  uniq([...findScenes(/사진|지도|도로|주거|공간|도시/),...findEvidence(/사진|지도|도로|주거|공간|도시/)]),
  uniq(findEvidence(/재개발|재건축|도시재생|보존|착공|정비사업/)),
  uniq([...findEvidence(/./),...findScenes(/./)]),
 ];
 const usedPhotos=new Set<string>(),usedVideos=new Set<string>();
 const sectionMedia=(index:number)=>{
  const match=purposeTerms[index];
  const assignedPhotos=index===4?photos.filter(p=>match.test(`${p.title} ${p.caption||''}`)):[];
  const photoIds=assignedPhotos.map(p=>str(p.evidenceId||p.mediaId)).filter(id=>id&&!usedPhotos.has(id)).slice(0,8);photoIds.forEach(id=>usedPhotos.add(id));
  const assignedVideos=videos.filter(v=>!usedVideos.has(str(v.evidenceId||v.id))&&match.test(str(v.title)));
  const videoIds=assignedVideos.map(v=>str(v.evidenceId||v.id)).filter(Boolean).slice(0,3);videoIds.forEach(id=>usedVideos.add(id));
  return {photoIds,videoIds};
 };
 const sections:DocentTourSection[]=TOUR_SECTION_IDS.map((id,i)=>{
  const evidenceIds=sectionSources[i].filter(sid=>byId.has(sid)),sectionClaims=uniq(evidenceIds.flatMap(sid=>byId.get(sid)?.claimIds||[])),sourceIds=[...evidenceIds],media=sectionMedia(i),direct=evidenceIds.some(sid=>{const source=byId.get(sid);return !!source?.usableAsVerifiedEvidence&&source.mediaType!=='building_register'&&['exact_building','exact_parcel','historical_site'].includes(source.relationScope);}),verified=evidenceIds.some(sid=>{const source=byId.get(sid);return !!source&&(source.verificationStatus==='reviewed_source_claim'&&source.claimIds.length>0&&(i!==3||['exact_building','exact_parcel','historical_site'].includes(source.relationScope))||(i!==3&&source.verificationStatus==='official_register'));}),has=evidenceIds.length>0;
  const directGap=i===3&&!direct;
  const missingReason=directGap?'건물·필지에 직접 연결된 승인 역사 근거가 없습니다. 현재 공식 정보와 주변 지역 자료를 분리하고 건립 이전 이력은 미확인으로 남기세요.':!has?['이 주소의 공식 지명 유래 자료가 응답에 없습니다.','관련 사건·산업 자료가 확인되지 않았습니다.','건물 또는 필지 직접 자료가 없습니다.','시대별 공간 변화 자료가 없습니다.','장소 관련 최신 공식 사업 기록이 없습니다.'][i]||'연결된 근거가 없습니다.':null;
  const scopeValues=evidenceIds.map(sid=>byId.get(sid)?.relationScope||'unknown'),scope=scopeValues.length&&scopeValues.every(s=>s===scopeValues[0])?scopeValues[0]:'mixed';
  return {id,order:i+1,title:titles[i],subtitle:subtitles[i],purpose:purposes[i],narrationInstructions:`검증된 자료만 사용하고 자료의 공간 범위·시기·출처를 문장 가까이에 표시하세요. ${directGap?'건물 자체의 과거 이력은 확인되지 않았다고 명시하세요.':''} 자료가 부족하면 분량을 채우지 마세요.`,evidenceIds,claimIds:sectionClaims,photoIds:media.photoIds,videoIds:media.videoIds,sourceIds,relationScope:scope as DocentTourSection['relationScope'],verificationStatus:!has?'missing':verified&&!directGap?'supported':'partial',missingEvidenceReason:missingReason,recommendedLength:i===0?{min:150,max:200}:i===6?{min:120,max:300}:{min:250,max:450}};
 });
 const uncertainty=[...new Set(sections.map(s=>s.missingEvidenceReason).filter((s):s is string=>!!s))];
 const centralQuestion=question||`${dong||district||'이 장소'}의 공간은 어떤 기록을 남겼을까요?`;
 const photoIdentity=photos.map(p=>str(p.evidenceId||p.mediaId)).filter(Boolean),videoIdentity=videos.map(v=>str(v.evidenceId||v.id)).filter(Boolean),allEvidence=uniq(sources.map(s=>s.id));
 const result={version:'2.0',placeName:str(place.name||packet.address),address,district,dong,questionType,centralQuestion,opening:{targetCharacters:{min:150,max:200},instructions:'장소명·주소·자치구·동과 확인된 현재 정보에서 시작하고 핵심 질문을 제시하세요. 실제 응답의 대표 사진 또는 공식 원문 링크만 사용하세요.',placeImageIds:photos.filter(p=>p.verificationStatus==='VERIFIED').slice(0,1).map(p=>str(p.evidenceId||p.mediaId)),sourceIds:sections[0].sourceIds},sections,sources,uncertainties:uncertainty,provenance:{provider:'seoul_place_docent_mcp',returnedEvidenceIds:allEvidence,returnedPhotoIds:photoIdentity,returnedVideoIds:videoIdentity,requestId:nullable(asObj(packet.audit).requestId||asObj(packet.provenance).requestId),semanticVerification:'not_checked',operatorAiCalls:0}};
 const parsed=DocentTourV2Schema.parse(result),validation=validateDocentTourV2(parsed);if(!validation.valid)throw new Error('DocentTourV2 validation failed: '+validation.reasonCodes.join(','));return parsed;
}

export const DOCENT_TOUR_V2_INSTRUCTIONS='종합 역사 도슨트 답변이면 tourPlan의 고정 7부를 순서대로 유지하세요. 질문이 좁은 경우 기존 질문별 답변을 유지하세요. 각 부의 evidenceIds/claimIds만 인용하고 source metadata만 있는 장면을 검증된 사실로 승격하지 마세요. 사진과 영상은 각 부의 photoIds/videoIds에 연결된 반환 자료만 사용하고, 미검증 영상 시간 구간이나 사진 전후 비교를 만들지 마세요. 섹션이 missing이면 미확인 사유를 간단히 밝히고 추측이나 일반론으로 분량을 채우지 마세요. 투어 구조는 작성 계획이며 사실의 의미 검증 결과가 아닙니다.';
