import {archiveImageBlocks} from '@/lib/mcp-archive-images';
import {livePublicDataTool, lookupLivePublicData} from '@/lib/live-public-data';
import {bigQueryGitHubCandidates,bigQueryHansungArchive,bigQueryPlaceCandidates} from '@/lib/bigquery-place';
import {env} from '@/lib/runtime-env';
import {searchResearchRecords,placeResearchCandidates} from '@/lib/research-catalog';
import {z} from 'zod';
import {archiveStats, archivePlaceEvidenceLinks,archiveApprovedHistoricalFacts} from '@/lib/archive-db';
import {getDocentStory, getFullDocentStory,getRegionalHistoricalPhotoPreviews} from '@/lib/docent-data';
import {getDocentVideoCandidates} from '@/lib/docent-videos';
import {resolveMcpMapAddress as mapAddress} from '@/lib/mcp-map-address';
import {readAttachedPhoto} from '@/lib/mcp-photo';
import {photoResearchThumbnail} from '@/lib/photo-research';
import {coordinates, searchAddresses, ServiceError, verifyAddress} from '@/lib/providers';
import {parcelNumber} from '@/lib/place-context';
import {guidePhotos,presentGuidePhoto, getPlaceRegisterContext, generatePlaceAnswer, placeAnswerStats, pickScenes, validateAnswer, sceneSource, logClientDocent, QUESTION_TYPES} from '@/lib/place-answer';
import {handleMcpMessage, rpcError, textResult, type McpTool, type McpToolResult} from '@/lib/mcp-protocol';
import {auditedCall,clientHint} from '@/lib/mcp-audit';
import {originError,configuredMcpOrigins,acceptError,protocolError,allowMcpRequest,unsupportedMcpMethod} from '@/lib/mcp-http';
import {docentTourInstructions} from '@/lib/docent-tour-builder';
import {buildPlaceDocentTourV2} from '@/lib/docent-tour-integration';
import {LANDMARK_INSTRUCTIONS,landmarkStory} from '@/lib/landmark-docent';
import {searchKakaoPlace} from '@/lib/kakao-place';
import {galleryMode,galleryVariant} from '@/lib/docent-gallery';

export const dynamic = 'force-dynamic';
const MAX_BODY_BYTES = 32768;
const headers = {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'};

const tools: McpTool[] = [
  livePublicDataTool,
  {
    name:'extract_photo_location',
    description:'사용자가 첨부한 원본 JPEG/HEIC 사진 파일에서 실제 EXIF GPS·촬영일을 읽고 서울 주소 후보를 반환합니다. 이미지 외관으로 추측하지 않습니다. 파일 첨부를 file로 전달하세요. GPS가 제거됐으면 원본 재첨부·웹 원본 선택·주소 입력을 안내하세요. 반환된 주소는 촬영 위치이며 사용자가 확인한 후보 token으로 prepare_place_answer를 호출한 뒤 사진·영상·출처를 포함한 도슨트를 작성하세요. 원본은 처리 중 메모리에서만 읽고 저장하지 않습니다.',
    inputSchema:{type:'object',properties:{file:{type:'object',properties:{download_url:{type:'string',maxLength:12000},file_id:{type:'string',maxLength:300},mime_type:{type:'string',maxLength:100},file_name:{type:'string',maxLength:300}},required:['download_url','file_id'],additionalProperties:false}},additionalProperties:false},
    _meta:{'openai/fileParams':['file']},
    annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:true}
  },
  {
    name:'resolve_photo_location',
    description:'사진 EXIF 또는 사용자가 공유한 실제 GPS 좌표를 서울 주소 후보로 변환합니다. latitude=위도, longitude=경도입니다. 사진을 보고 좌표를 추측하지 마세요. GPS가 전달되지 않았다면 빈 입력으로 안내를 받거나 주소를 요청하세요. 후보는 사용자가 확인한 후 token으로 조회하세요. 촬영 위치는 피사체의 건물·부지 동일성을 증명하지 않습니다.',
    inputSchema:{type:'object',properties:{latitude:{type:'number',minimum:-90,maximum:90},longitude:{type:'number',minimum:-180,maximum:180}},additionalProperties:false},
    annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:true}
  },
  {
    name:'prepare_place_answer',
    description:'사용자 자신의 AI가 분류·도슨트 작성에 사용할 사진·영상 후보·역사·출처와 작성 지침을 반환합니다. 서버 AI 호출은 0회입니다. 먼저 질문 유형을 분류해 questionType에 넣고, 먼저 MCP 기록 사진의 장소 범위·출처·이용조건을 확인하고, 사진은 도구의 기록 사진 갤러리에서 자동 표시합니다. 해설에는 날짜·출처·원문 링크를 붙이세요. 일반 이미지 검색 결과는 MCP 원본 사진인 것처럼 표시하지 마세요. no_records여도 일반 해설을 완성하세요. token·address·place 중 하나가 필요합니다. 다리·광장·공원처럼 도로명주소가 없는 곳은 place에 장소명을 넣으세요. 주소를 찾지 못하면 같은 이름으로 조사자료를 검색해 7부 도슨트 근거를 만듭니다. 장소와 동네를 구분하고 기록을 인용한 곳에 출처를 붙이세요.',
    inputSchema:{type:'object',properties:{token:{type:'string',minLength:1,maxLength:6000},address:{type:'string',minLength:2,maxLength:100},place:{type:'string',minLength:2,maxLength:100,description:'도로명주소가 없는 다리·광장·공원 등의 장소명(예: 성수대교)'},question:{type:'string',maxLength:300},questionType:{type:'string',enum:[...QUESTION_TYPES]}},oneOf:[{required:['token']},{required:['address']},{required:['place']}],additionalProperties:false},
    annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:true}
  },
  {
    name:'validate_place_answer',
    description:'MCP 동네 기록을 사용한 문단만 같은 token·question의 근거 기록과 기계적으로 대조합니다. 미등록 근거 id·추가 숫자·과도한 문장 길이를 걸러 냅니다. AI를 호출하지 않으며 의미적 사실 전체를 보증하지 않습니다. 거절된 문단은 수정하거나 보류하세요.',
    inputSchema:{type:'object',properties:{
      token:{type:'string',minLength:1,maxLength:6000},question:{type:'string',maxLength:300},
      answer:{type:'object',properties:{question_type:{type:'string',enum:[...QUESTION_TYPES]},paragraphs:{type:'array',minItems:1,maxItems:6,items:{type:'object',properties:{heading:{type:'string',maxLength:40},text:{type:'string',minLength:1,maxLength:600},evidence_ids:{type:'array',minItems:1,maxItems:14,items:{type:'string',maxLength:200}}},required:['heading','text','evidence_ids'],additionalProperties:false}},held:{type:'array',maxItems:4,items:{type:'string',maxLength:200}}},required:['question_type','paragraphs','held'],additionalProperties:false}
    },required:['token','answer'],additionalProperties:false},
    annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}
  },
  {
    name: 'search_place',
    description: '서울 도로명·지번 주소를 검색합니다. 후보의 token을 get_place_history에 전달하세요. 단일 주소는 바로 해설하고 모호하면 후보 주소만 표시하세요.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {type: 'string', minLength: 2, maxLength: 100, description: '예: 신촌로 83'},
        page: {type: 'integer', minimum: 1, maximum: 100, default: 1},
      },
      required: ['query'],
      additionalProperties: false,
    },
    annotations: {readOnlyHint: true, destructiveHint: false, openWorldHint: true},
  },
  {
    name: 'get_place_history',
    description: '주소 token으로 동네 역사·사진과 GitHub 조사자료 후보를 조회합니다. token 없이 query(예: 세운상가, 정독도서관)로 GitHub CSV 메타데이터를 직접 검색할 수 있습니다. 후보는 검토·권리·장소 상태와 출처행을 보존하며 확정 근거가 아닙니다. 동네 기록을 해당 건물의 역사로 단정하지 마세요.',
    inputSchema: {
      type: 'object',
      properties: {
        token: {type: 'string', minLength: 1, maxLength: 6000},
        query: {type: 'string', minLength: 2, maxLength: 100, description: 'GitHub 조사자료 키워드 검색'},
        district: {type: 'string', minLength: 2, maxLength: 20, description: '조사자료 자치구 메타데이터 필터'},
        offset: {type: 'integer', minimum: 0, maximum: 10000, default: 0},
        limit: {type: 'integer', minimum: 1, maximum: 12, default: 6},
      },
      anyOf: [{required: ['token']}, {required: ['query']}],
      additionalProperties: false,
    },
    annotations: {readOnlyHint: true, destructiveHint: false, openWorldHint: false},
  },
  {
    name: 'generate_place_answer',
    description: '호환용 이름입니다. prepare_place_answer와 같은 근거 묶음을 반환합니다. 서버는 답변을 생성하지 않습니다. 호출한 당신의 AI가 질문을 분류하고 사진·출처를 포함한 도슨트 답변을 작성하세요.',
    inputSchema: {
      type: 'object',
      properties: {
        token: {type: 'string', minLength: 1, maxLength: 6000, description: 'search_place 후보의 token'},
        address: {type: 'string', minLength: 2, maxLength: 100, description: 'token이 없을 때 주소. 후보가 하나일 때만 바로 진행합니다.'},
        place: {type: 'string', minLength: 2, maxLength: 100, description: '도로명주소가 없는 장소명(예: 성수대교)'},
        question: {type: 'string', maxLength: 300, description: '예: 1960년대에는 어떤 모습이었나요? 비우면 동네 소개'},
      },
      additionalProperties: false,
    },
    annotations: {readOnlyHint: true, destructiveHint: false, openWorldHint: true},
  },
  {
    name: 'get_answer_stats',
    description: '클라이언트 AI 도슨트 흐름의 검색 성공률·P95 지연·기계적 근거 검증 통계와 KPI 목표를 조회합니다. 사용자 토큰·최종 답변 완료·의미적 정확도는 관측할 수 없어 미측정으로 표시합니다.',
    inputSchema: {type: 'object', properties: {days: {type: 'integer', minimum: 1, maximum: 365, default: 30}}, additionalProperties: false},
    annotations: {readOnlyHint: true, destructiveHint: false, openWorldHint: false},
  },
  {
    name: 'get_archive_stats',
    description: '연결된 D1 DB의 자료·본문·첨부·지역 분류 건수를 실제 조회합니다. 지역 분류 건수는 해당 지역의 역사 본문 확보 건수와 다릅니다.',
    inputSchema: {type: 'object', properties: {}, additionalProperties: false},
    annotations: {readOnlyHint: true, destructiveHint: false, openWorldHint: false},
  },
];

const searchInput = z.object({
  query: z.string().trim().min(2).max(100),
  page: z.number().int().min(1).max(100).default(1),
}).strict();
const historyInput = z.object({
  token: z.string().min(1).max(6000).optional(),
  query: z.string().trim().min(2).max(100).optional(),
  district: z.string().trim().min(2).max(20).optional(),
  offset: z.number().int().min(0).max(10000).default(0),
  limit: z.number().int().min(1).max(12).default(6),
}).strict().refine(v=>Boolean(v.token)||Boolean(v.query),{message:'token 또는 query가 필요합니다'});

const answerInput = z.object({
  token: z.string().min(1).max(6000).optional(),
  address: z.string().trim().min(2).max(100).optional(),
  place: z.string().trim().min(2).max(100).optional(),
  question: z.string().trim().max(300).optional(),
  questionType: z.enum(QUESTION_TYPES).optional(),
}).strict().refine(v => [v.token, v.address, v.place].filter(Boolean).length === 1, {message: 'token·address·place 중 하나만 필요합니다'});

const locationInput=z.object({latitude:z.number().finite().min(-90).max(90).optional(),longitude:z.number().finite().min(-180).max(180).optional()}).strict()
  .refine(v=>(v.latitude===undefined)===(v.longitude===undefined),{message:'위도와 경도를 함께 전달하세요'});
const photoInput=z.object({file:z.object({download_url:z.string().min(1).max(12000),file_id:z.string().min(1).max(300),mime_type:z.string().max(100).optional(),file_name:z.string().max(300).optional()}).strict().optional()}).strict();
const validationInput=z.object({
  token:z.string().min(1).max(6000),question:z.string().trim().max(300).optional(),
  answer:z.object({question_type:z.enum(QUESTION_TYPES),
    paragraphs:z.array(z.object({heading:z.string().max(40),text:z.string().min(1).max(600),evidence_ids:z.array(z.string().max(200)).min(1).max(14)}).strict()).min(1).max(6),
    held:z.array(z.string().max(200)).max(4)}).strict()
}).strict();

async function execute(request: Request, name: string, args: Record<string, unknown>): Promise<McpToolResult> {
  const startedAt=Date.now();
  try {
    switch (name) {
      case 'lookup_live_public_data':
        return textResult(await lookupLivePublicData(args, name => (env as unknown as Record<string,string|undefined>)[name]));
      case 'extract_photo_location': {
        const {file}=photoInput.parse(args);
        if(!file)return textResult({status:'needs_file',nextAction:'GPS가 보존된 원본 JPEG/HEIC를 파일로 첨부해 주세요. 첨부가 MCP에 전달되지 않으면 https://seoul-place-history.xeonire.chatgpt.site 에서 원본 사진을 선택하고 확인된 주소를 공유하세요.',note:'이미지 미리보기만으로 좌표를 추측하지 마세요.'});
        const {location,capturedAt,utcOffset}=await readAttachedPhoto(file.download_url);
        if(location.status!=='ready')return textResult({status:location.status,locationSource:'photo_exif',nextAction:location.status==='outside_seoul'?'서울 지역 원본 사진 또는 서울 주소를 입력해 주세요.':'촬영 위치정보가 보존된 원본 JPEG/HEIC를 다시 첨부하거나 웹에서 원본 사진·현재 위치·주소 입력을 사용하세요.',note:'위치를 추정하지 않았습니다. 스크린샷·공유 과정에서 GPS가 제거될 수 있습니다.'});
        const result=await mapAddress(location.point.x,location.point.y,env);
        return textResult({...result,status:result.candidates.length?'confirm_address':'needs_address',needsConfirmation:true,locationSource:'photo_exif',coordinates:{latitude:location.point.y,longitude:location.point.x},capturedAt,capturedAtUtcOffset:utcOffset,capturedAtNote:utcOffset?'카메라 기록 시각·UTC 오프셋':'카메라 기록 시각이며 시간대는 미확인입니다.',photoStored:false,note:'촬영 위치의 주소 후보입니다. 피사체의 건물·부지와 같다고 단정하지 마세요. 후보를 확인한 뒤 token으로 prepare_place_answer를 호출하세요.'});
      }
      case 'resolve_photo_location': {
        const input=locationInput.parse(args);
        if(input.latitude===undefined||input.longitude===undefined)return textResult({status:'needs_location',nextAction:'주소 입력 또는 위치 공유를 요청하세요. 사진만 있다면 도슨트 웹에서 원본 사진을 선택해 주소를 확인할 수 있습니다.',note:'AI 앱에서 사진 GPS가 전달되지 않을 수 있습니다. 이미지 모습으로 위치를 추측하지 마세요.'});
        const result=await mapAddress(input.longitude,input.latitude,env);
        return textResult({...result,status:result.candidates.length?'confirm_address':'needs_address',needsConfirmation:true,note:'좌표는 촬영 위치입니다. 피사체의 위치 또는 건물 역사로 단정하지 마세요. 주소 후보를 확인한 뒤 token을 사용하세요.'});
      }
      case 'validate_place_answer': {
        const started=Date.now();const input=validationInput.parse(args);
        const address=await verifyAddress(input.token,env);
        const story=getFullDocentStory(address.sggNm,address.emdNm);
        const question=input.question||story.dong+'의 시간을 안내해 주세요.';
        const scenes=pickScenes(story,question,14,address.bdNm);
        const checked=validateAnswer(input.answer,scenes);
        await logClientDocent(env.DB,{event:'validation',ms:Date.now()-started,ok:checked.omitted===0,records:scenes.length,type:checked.questionType,kept:checked.paragraphs.length,omitted:checked.omitted});
        const used=new Set(checked.paragraphs.flatMap(p=>p.evidenceIds));
        return textResult({...checked,sources:scenes.filter(s=>used.has(s.id)).map(sceneSource),valid:checked.paragraphs.length>0&&checked.omitted===0,
          verification:'mechanical_only',note:'근거 id·숫자·길이 검사입니다. 의미적 사실 일치와 장소 동일성은 별도로 확인해야 합니다.'});
      }
      case 'search_place': {
        const input = searchInput.parse(args);
        return textResult(await searchAddresses(input.query, input.page, env));
      }
      case 'get_place_history': {
        const input = historyInput.parse(args);
        if(!input.token){
          const [bigQueryGitHubResearch,hansungArchive] = await Promise.all([
            bigQueryGitHubCandidates(request,input), bigQueryHansungArchive(request,input),
          ]);
          return textResult({...searchResearchRecords(input),bigQueryGitHubResearch,hansungArchive});
        }
        const address = await verifyAddress(input.token, env);
        const research=input.query?searchResearchRecords({query:input.query,district:input.district,offset:input.offset,limit:input.limit}):placeResearchCandidates(address.sggNm,address.emdNm,address.bdNm);
        const story = getDocentStory(address.sggNm, address.emdNm, [address.bdNm].filter(Boolean));
        const scenes = story.scenes.slice(input.offset, input.offset + input.limit).map(scene => ({
          id: scene.id,
          kind: scene.kind,
          date: scene.date,
          year: scene.year,
          title: scene.title,
          text: scene.text,
          scope: scene.scope,
          cutCount: scene.cutCount,
          photos: scene.photos.slice(0, 1).map(photo => ({
            previewUrl: photoResearchThumbnail(photo),
            sourceUrl: photo.sourceUrl,
            provider: photo.provider,
            relation: photo.relation,
            note: '이미지 이용조건과 장소 관계는 제공기관 원문을 확인해 주세요.',
          })),
          evidence: scene.evidence,
        }));
        const nextOffset = input.offset + scenes.length;
        const [bigQueryResearch,bigQueryGitHubResearch,hansungArchive] = await Promise.all([
          bigQueryPlaceCandidates(request,address,input.limit,input.offset),
          bigQueryGitHubCandidates(request,{district:address.sggNm,dong:address.emdNm,placeName:address.bdNm,query:input.query,limit:input.limit,offset:input.offset}),
          bigQueryHansungArchive(request,{...input,roadAddr:address.roadAddr,district:address.sggNm}),
        ]);
        const [placeEvidenceLinks,regionalHistoryFacts]=await Promise.all([archivePlaceEvidenceLinks(env.DB,{buildingManagementNumber:address.bdMgtSn,pnu:parcelNumber(address)}),archiveApprovedHistoricalFacts(env.DB,address.sggNm,address.emdNm)]);
        const registerContext=await getPlaceRegisterContext(address,env);
        return textResult({
          address,research,bigQueryResearch,bigQueryGitHubResearch,hansungArchive,placeEvidenceLinks,
          place: {records: registerContext.records},
          registerDiagnostics:registerContext.diagnostics,
          neighborhood: {
            district: story.district,
            dong: story.dong,
            scenes,
            total: story.total,
            offset: input.offset,
            nextOffset: nextOffset < story.scenes.length ? nextOffset : null,
            sceneCount: story.scenes.length,
            photoRecords: story.photoRecords,
            photoGroups: story.photoGroups,
            unpictured: story.unpictured,
          },
          note: '장면은 동네 또는 자치구 범위의 기록입니다. 입력한 건물·부지와의 동일성을 뜻하지 않습니다. 출처별 확인 범위를 함께 읽어 주세요.',
        });
      }
      case 'prepare_place_answer':
      case 'generate_place_answer': {
        const input = answerInput.parse(args);
        let token = input.token;
        let landmarkName = input.place ?? null;
        if (!token && !landmarkName) {
          const found = await searchAddresses(input.address!, 1, env);
          // A landmark name (bridge, plaza, park) has no road address; continue with the place-name flow.
          if (!found.candidates.length) landmarkName = input.address!;
          else if (found.candidates.length !== 1 || found.total !== 1) {
            return textResult({needsChoice: true, note: found.candidates.length ? '일치하는 서울 주소 후보' : '서울 주소를 찾지 못했어요. 도로명과 건물번호를 확인해 주세요.', candidates: found.candidates.slice(0, 10).map(c => ({roadAddr: c.roadAddr, jibunAddr: c.jibunAddr, token: c.token}))});
          }
          else token = found.candidates[0].token;
        }
        if (landmarkName) {
          const kakao = await searchKakaoPlace(landmarkName, env);
          const location = kakao ? await mapAddress(kakao.x, kakao.y, env).then(result => result.location).catch(() => null) : null;
          const landmark = landmarkStory(landmarkName, location);
          if (!landmark.story.scenes.length && !kakao) {
            return textResult({needsChoice: true, note: '서울 주소나 장소를 찾지 못했어요. 도로명주소 또는 장소 이름을 확인해 주세요.', candidates: []});
          }
          const place = landmark.address.bdNm, district = landmark.story.district, dong = landmark.story.dong;
          const packet = await generatePlaceAnswer({address:landmark.address,story:landmark.story,question:input.question||`${place}의 역사를 도슨트로 안내해 주세요.`,questionType:input.questionType});
          await logClientDocent(env.DB,{event:'retrieval',ms:Date.now()-startedAt,ok:packet.status==='ready',records:packet.neighborhood.selected,type:input.questionType});
          // Dong-level videos are about the neighborhood, not the landmark; keep only those that name it.
          const placeKey = place.normalize('NFKC').replace(/\s+/g,'');
          const dongVideos = district ? await getDocentVideoCandidates(district,dong).catch(() => ({records:[]})) : {records:[]};
          const videos = {...dongVideos,records:dongVideos.records.filter(video=>String(video.title||'').normalize('NFKC').replace(/\s+/g,'').includes(placeKey))};
          const regular = guidePhotos(packet).map(photo=>presentGuidePhoto(photo,{district,dong,buildingName:place}));
          const regionalPhotos = district && dong ? getRegionalHistoricalPhotoPreviews(district,dong) : [];
          const seenPhotos = new Set<string>();
          const photos = [...regular,...regionalPhotos].filter(photo=>{
            const alternateUrls='alternateUrls' in photo&&Array.isArray(photo.alternateUrls)?photo.alternateUrls:[];
            const key=('sourceRecordId' in photo?photo.sourceRecordId:undefined)||alternateUrls[0]||photo.imageUrl||photo.evidenceId;
            if(seenPhotos.has(key))return false;seenPhotos.add(key);return true;
          }).slice(0,8);
          const roadview = {provider:'카카오맵',searchUrl:kakao?.placeUrl||'https://map.kakao.com/link/search/'+encodeURIComponent(place),url:kakao?`https://map.kakao.com/link/roadview/${kakao.y},${kakao.x}`:null};
          const responsePacket = {...packet,place:{name:place,records:[],status:'landmark_by_name'},
            landmark:{name:place,district:district||null,dong:dong||null,matchedBy:kakao?'kakao_keyword+research_catalog':'research_catalog',researchTotal:landmark.research.total,landmarkRecords:landmark.landmarkSceneCount,neighborhoodRecords:landmark.neighborhoodSceneCount,roadAddress:null,
              kakaoPlace:kakao?{name:kakao.name,category:kakao.category,addressName:kakao.addressName,placeUrl:kakao.placeUrl}:null,coordinates:kakao?{latitude:kakao.y,longitude:kakao.x}:null},
            roadview,videos,visuals:{photos,photoCount:photos.length,videoCount:videos.records.length,emptyNote:null},instructions:packet.instructions+'\n'+LANDMARK_INSTRUCTIONS};
          const tourPlan = buildPlaceDocentTourV2({packet:responsePacket,placeRecords:[],photos,videos,placeEvidenceLinks:{items:[]},regionalHistoryFacts:{records:[]}});
          responsePacket.instructions += '\n'+docentTourInstructions(tourPlan)+'\n현재 모습에 roadview.url이 있으면 “카카오 로드뷰 열기” 링크를, 없으면 roadview.searchUrl을 “카카오맵에서 장소 확인” 링크로 제공하세요. 로드뷰 촬영일은 확인되지 않았으며 과거 기록 사진으로 인용하지 마세요.';
          const result = textResult({...responsePacket,tourPlan});
          const imageBlocks = await archiveImageBlocks(photos);
          return {...result,content:[...result.content,...imageBlocks],structuredContent:{photos,photoPreviews:photos,tourPlan,roadview}};
        }
        const address = await verifyAddress(token!, env);
        const [placeEvidenceLinks,regionalHistoryFacts]=await Promise.all([archivePlaceEvidenceLinks(env.DB,{buildingManagementNumber:address.bdMgtSn,pnu:parcelNumber(address)}),archiveApprovedHistoricalFacts(env.DB,address.sggNm,address.emdNm)]);
        const story = getFullDocentStory(address.sggNm, address.emdNm);
        const registerContext=await getPlaceRegisterContext(address,env);
        const placeRecords=registerContext.records;
        const packet=await generatePlaceAnswer({address,story,placeRecords,question:input.question,questionType:input.questionType});
        await logClientDocent(env.DB,{event:'retrieval',ms:Date.now()-startedAt,ok:packet.status==='ready',records:packet.neighborhood.selected,type:input.questionType});
        const videos=await getDocentVideoCandidates(address.sggNm,address.emdNm);
        const regular=guidePhotos(packet).map(photo=>presentGuidePhoto(photo,{district:address.sggNm,dong:address.emdNm,buildingName:address.bdNm}));
        const regionalPhotos=getRegionalHistoricalPhotoPreviews(address.sggNm,address.emdNm);
        const seenPhotos=new Set<string>();
        const photos=[...regular,...regionalPhotos].filter(photo=>{
          const alternateUrls='alternateUrls' in photo&&Array.isArray(photo.alternateUrls)?photo.alternateUrls:[];
          const key=('sourceRecordId' in photo?photo.sourceRecordId:undefined)||alternateUrls[0]||photo.imageUrl||photo.evidenceId;
          if(seenPhotos.has(key))return false;seenPhotos.add(key);return true;
        }).slice(0,8);
        const research=placeResearchCandidates(address.sggNm,address.emdNm,address.bdNm);
        const [bigQueryResearch,bigQueryGitHubResearch,hansungArchive,point] = await Promise.all([
          bigQueryPlaceCandidates(request,address),
          bigQueryGitHubCandidates(request,{district:address.sggNm,dong:address.emdNm,placeName:address.bdNm}),
          bigQueryHansungArchive(request,{roadAddr:address.roadAddr,district:address.sggNm}),
          coordinates(address,env).catch(() => null),
        ]);
        const roadview = {
          provider: '카카오맵',
          searchUrl: 'https://map.kakao.com/link/search/'+encodeURIComponent(address.roadAddr),
          url: point?.status === 'verified' && point.x != null && point.y != null
            ? `https://map.kakao.com/link/roadview/${point.y},${point.x}`
            : null,
        };
        const responsePacket={...packet,roadview,research,bigQueryResearch,bigQueryGitHubResearch,hansungArchive,placeEvidenceLinks,regionalHistoryFacts,videos,registerDiagnostics:registerContext.diagnostics,visuals:{photos,photoCount:photos.length,videoCount:videos.records.length,emptyNote:null},instructions:packet.instructions+(hansungArchive?.records.length ? ' hansungArchive는 한성대 공식 아카이브 원문 목록입니다. 관련 기록은 제목과 원문 링크로 안내하고, 기록 본문에서 확인한 사실만 해설에 인용하세요.' : '')+' bigQueryResearch와 bigQueryGitHubResearch에는 검토 후보와 원문 링크만 있습니다. 확정 근거나 시각자료로 사용하지 마세요.'+'\nplaceEvidenceLinks의 usableAsDirectEvidence가 true인 항목만 승인된 직접 장소 근거로 사용하세요. false인 항목은 미승인 후보이며 relation 범위를 넘겨 설명하지 마세요.\nregisterDiagnostics의 current.status가 ready일 때만 현재 건물의 공식 대장정보로 설명하세요. 사용승인일을 최초 건립일로 말하지 마세요. closed.status가 ready여도 폐쇄말소대장은 같은 필지의 과거 대장 후보입니다. 폐쇄 유형·건물 PK·현재 건물의 PK와 명칭을 대조하기 전에는 철거, 동일 건물, 이전 부지라고 단정하지 마세요. same_parcel_historical_candidate와 identity_ambiguous는 후보 상태이며 건물 직접 이력으로 인용하지 마세요. key_missing, unauthorized, query_failed, schema_mismatch는 조회 실패 상태이지 자료 없음이 아닙니다.\nphotos의 imageUrl은 같은 evidenceId의 원문 자료에 연결된 참고 이미지입니다. 동네·주변 범위 사진은 입력한 건물 자체의 사진이나 직접 역사 근거가 아닙니다. formalEvidenceApproval 상태를 바꾸지 않으며 사진 자체만으로 역사 주장을 뒷받침하지 않습니다. 이미지 블록은 AI가 사진을 확인하는 용도이며 사용자 화면에 보이지 않을 수 있습니다. 본문에 이미지 마크다운을 쓰지 말고, 사진을 언급할 때마다 날짜·소장기관·장소 범위와 함께 sourceUrl 기관 원문 링크를 제공하세요. 사진과 연결된 evidenceId를 확인하고 해당 건물·부지 사진과 동네 맥락 사진을 명확히 구별하세요. 사진의 표시 순서는 직접 장소 기록, 주변 기록, 동네 기록을 우선하되 시간 흐름과 설명 관련성을 고려하세요. 일반 이미지 검색 결과는 사용하지 마세요. 출처는 각 사진 캡션과 해당 역사 문단에 가깝게 연결하세요. 사진을 직접 볼 수 없는 독자도 이해하도록, 기록 본문에서 확인되는 구체적인 단서와 그 의미를 해설하세요. relatedEvidenceIds는 다른 시기나 생활 모습과 연결할 후보입니다. 실제 같은 장소·시점인지 확인하고, 맞는 자료가 없으면 일반 현장 해설을 이어가세요. 관련 영상은 이야기와 연결될 때 원문으로 안내하고 시간 링크는 verifiedSegments만 사용하세요. research는 GitHub 조사자료 후보로 확정 근거 ID가 아닙니다. 검토·권리·장소 상태를 내부적으로 확인하고 검증된 항목만 필요한 문단에 사용하세요.'};
        const tourPlan=buildPlaceDocentTourV2({packet:responsePacket,placeRecords,photos,videos,placeEvidenceLinks,regionalHistoryFacts});
        responsePacket.instructions+='\n'+docentTourInstructions(tourPlan)+'\n현재 모습에 roadview.url이 있으면 “카카오 로드뷰 열기” 링크를 제공하세요. 없으면 roadview.searchUrl을 “카카오맵에서 주소 확인” 링크로 제공하세요. 로드뷰 촬영일·촬영 가능 여부는 확인되지 않았으며 로드뷰를 과거 기록 사진으로 인용하지 마세요.';
        const result=textResult({...responsePacket,tourPlan});
        const imageBlocks=await archiveImageBlocks(photos);
        return {...result,content:[...result.content,...imageBlocks],structuredContent:{photos,photoPreviews:photos,tourPlan,roadview,registerDiagnostics:registerContext.diagnostics}};
      }
      case 'get_answer_stats': {
        const input = z.object({days: z.number().int().min(1).max(365).default(30)}).strict().parse(args);
        return textResult(await placeAnswerStats(env.DB, input.days));
      }
      case 'get_archive_stats': {
        z.object({}).strict().parse(args);
        if (!env.DB) return textResult({available:false,status:'unavailable',errorCode:'ARCHIVE_NOT_CONFIGURED',note:'D1 연결 설정이 없어 역사자료 통계를 조회하지 못했습니다. MCP 도구 인자는 정상 처리되었습니다. 서버 운영 설정에서 D1 DB 바인딩과 식별정보를 확인해야 합니다.'});
        let stats: Record<string, unknown>;
        try { stats = await archiveStats(env.DB); }
        catch { return textResult({available:false,status:'query_failed',errorCode:'ARCHIVE_QUERY_FAILED',note:'D1 연결은 설정되어 있지만 자료 통계 조회가 실패했습니다. 서버 로그에서 해당 요청 ID의 D1 오류를 확인해야 합니다. 입력 인자 오류로 판정하지 않았습니다.'}); }
        // Return public counts only. Import logs can contain internal operational notes.
        const {sources, districts, dongs, historicalAreas, passages, facts, assets, originalSources, rightsChecked, storage, coverageNote} = stats;
        return textResult({available:true,sources, districts, dongs, historicalAreas, passages, facts, assets, originalSources, rightsChecked, storage, coverageNote});
      }
      default:
        throw new Error('Unknown tool');
    }
  } catch (error) {
    if(name==='prepare_place_answer'||name==='generate_place_answer')await logClientDocent(env.DB,{event:'retrieval',ms:Date.now()-startedAt,ok:false,records:0});
    if (error instanceof z.ZodError) {
      return {content: [{type: 'text', text: '도구 입력 형식을 확인해 주세요.'}], isError: true,errorType:'invalid_input'};
    }
    if (error instanceof ServiceError) {
      return {content: [{type: 'text', text: error.message}], isError: true,errorType:'service_error'};
    }
    throw error;
  }
}

/** Bound streamed bodies as well as requests with Content-Length. */
export async function POST(request: Request) {
  const rejected=originError(request,configuredMcpOrigins(env.MCP_ALLOWED_ORIGINS))??acceptError(request);
  if(rejected){earlyLog(request,'transport',rejected.status);return rejected;}
  if(!allowMcpRequest())return Response.json(rpcError(null,-31000,'Too many requests'),{status:429,headers:{...headers,'Retry-After':'60'}});
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') ?? '')) {
    return Response.json(rpcError(null, -32600, 'Content-Type must be application/json'), {status: 415, headers});
  }
  const declaredLength = Number(request.headers.get('content-length'));
  if (declaredLength > MAX_BODY_BYTES) {
    return Response.json(rpcError(null, -32600, 'Request too large'), {status: 413, headers});
  }
  const reader = request.body?.getReader();
  let body = '';
  let size = 0;
  if (reader) {
    const decoder = new TextDecoder();
    try {
      while (true) {
        const {done, value} = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BODY_BYTES) {
          await reader.cancel();
          return Response.json(rpcError(null, -32600, 'Request too large'), {status: 413, headers});
        }
        body += decoder.decode(value, {stream: true});
      }
      body += decoder.decode();
    } catch {
      return Response.json(rpcError(null, -32700, 'Unable to read request'), {status: 400, headers});
    } finally {
      reader.releaseLock();
    }
  }
  let message: unknown;
  try {
    message = JSON.parse(body);
  } catch {
    return Response.json(rpcError(null, -32700, 'Parse error'), {status: 400, headers});
  }
  const invalidProtocol=protocolError(request,message);
  if(invalidProtocol){earlyLog(request,'protocol',invalidProtocol.status,message);return invalidProtocol;}
  const gallery=galleryMode(request,(env as unknown as Record<string,string|undefined>).MCP_GALLERY);
  const response = await handleMcpMessage(message, tools, (name, args) => auditedCall(env.DB,name,clientHint(request),()=>execute(request, name, args)), {gallery,variant:galleryVariant(request)});
  debugLog(request,message,response,gallery);
  appTrace(request,message,response,gallery);
  if (response === undefined) return new Response(null, {status: 202, headers});
  // JSON-RPC errors travel in a 200 body. Streamable HTTP clients read HTTP 404 as
  // "session/endpoint gone", which made registration fail on an unknown probe method.
  return Response.json(response, {headers,status:200});
}

function earlyLog(request:Request,stage:string,status:number,message?:unknown){
  if(process.env.VERCEL_ENV!=='preview'&&process.env.MCP_DEBUG_LOG!=='1')return;
  const m=(message&&typeof message==='object'?message:{}) as Record<string,unknown>;
  console.log('[mcp-debug]',JSON.stringify({rejectedAt:stage,status,method:m.method??null,query:new URL(request.url).search,ua:request.headers.get('user-agent'),origin:request.headers.get('origin'),accept:request.headers.get('accept'),contentType:request.headers.get('content-type'),protocol:request.headers.get('mcp-protocol-version'),mcpMethod:request.headers.get('mcp-method'),mcpName:request.headers.get('mcp-name')}));
}

/**
 * Always-on, low-volume trace for MCP Apps support: does the client announce the UI extension, and
 * does it fetch the gallery resource after a photo tool call? Logs method names, resource URI,
 * capability/extension key names and the user agent only (no arguments, bodies or tokens).
 */
const APP_TRACE_METHODS=new Set(['initialize','server/discover','resources/list','resources/read']);
function appTrace(request:Request,message:unknown,response:unknown,gallery:string){
  const m=(message&&typeof message==='object'?message:{}) as Record<string,unknown>;
  const p=(m.params&&typeof m.params==='object'?m.params:{}) as Record<string,unknown>;
  const photoCall=m.method==='tools/call'&&(p.name==='prepare_place_answer'||p.name==='generate_place_answer');
  if(!APP_TRACE_METHODS.has(String(m.method))&&!photoCall)return;
  const keys=(v:unknown)=>v&&typeof v==='object'?Object.keys(v as object):null;
  const caps=(p.capabilities&&typeof p.capabilities==='object'?p.capabilities:{}) as Record<string,unknown>;
  const meta=(p._meta&&typeof p._meta==='object'?p._meta:{}) as Record<string,unknown>;
  const r=(response&&typeof response==='object'?response:{}) as Record<string,unknown>;
  console.log('[mcp-app]',JSON.stringify({method:m.method,uri:typeof p.uri==='string'?p.uri:null,tool:photoCall?p.name:null,gallery,
    capabilityKeys:keys(caps),extensionKeys:keys(caps.extensions)??keys(caps.experimental),metaKeys:keys(meta),
    ua:request.headers.get('user-agent'),protocol:request.headers.get('mcp-protocol-version'),error:r.error?true:false}));
}

/** Preview-only trace of what a registering client sent and what it got back (no bodies, no tokens). */
function debugLog(request:Request,message:unknown,response:unknown,gallery:string){
  if(process.env.VERCEL_ENV!=='preview'&&process.env.MCP_DEBUG_LOG!=='1')return;
  const m=(message&&typeof message==='object'?message:{}) as Record<string,unknown>;
  const p=(m.params&&typeof m.params==='object'?m.params:{}) as Record<string,unknown>;
  const r=(response&&typeof response==='object'?response:{}) as Record<string,unknown>;
  const pick=(h:string)=>request.headers.get(h);
  console.log('[mcp-debug]',JSON.stringify({method:m.method,id:m.id??null,uri:p.uri??null,tool:p.name??null,paramKeys:Object.keys(p),
    query:new URL(request.url).search,gallery,ua:pick('user-agent'),protocol:pick('mcp-protocol-version'),mcpMethod:pick('mcp-method'),mcpName:pick('mcp-name'),session:pick('mcp-session-id'),accept:pick('accept'),
    status:response===undefined?202:200,error:(r.error as Record<string,unknown>|undefined)??null,resultKeys:r.result&&typeof r.result==='object'?Object.keys(r.result as object):null,bytes:response===undefined?0:JSON.stringify(response).length}));
}

export function GET(request:Request){console.log('[mcp-debug]',JSON.stringify({httpMethod:request.method,query:new URL(request.url).search,ua:request.headers.get('user-agent'),accept:request.headers.get('accept')}));return unsupportedMcpMethod(request,configuredMcpOrigins(env.MCP_ALLOWED_ORIGINS));}
export const DELETE=GET;
export const HEAD=GET;
export function OPTIONS(request:Request){return originError(request,configuredMcpOrigins(env.MCP_ALLOWED_ORIGINS))??new Response(null,{status:204,headers:{...headers,Allow:'POST, OPTIONS'}});}
