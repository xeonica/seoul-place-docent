import {env} from '@/lib/runtime-env';
import {z} from 'zod';
import {archiveStats, database} from '@/lib/archive-db';
import {getDocentStory, getFullDocentStory} from '@/lib/docent-data';
import {getDocentVideoCandidates} from '@/lib/docent-videos';
import {resolveMcpMapAddress as mapAddress} from '@/lib/mcp-map-address';
import {readAttachedPhoto} from '@/lib/mcp-photo';
import {photoResearchThumbnail} from '@/lib/photo-research';
import {searchAddresses, ServiceError, verifyAddress} from '@/lib/providers';
import {generatePlaceAnswer, placeAnswerStats, pickScenes, validateAnswer, sceneSource, logClientDocent, QUESTION_TYPES} from '@/lib/place-answer';
import {enrichMcpPlace} from '@/lib/mcp-place-context';
import {handleMcpMessage, rpcError, textResult, type McpTool, type McpToolResult} from '@/lib/mcp-protocol';
import {auditedCall,clientHint} from '@/lib/mcp-audit';
import {originError,configuredMcpOrigins,acceptError,protocolError,allowMcpRequest,unsupportedMcpMethod} from '@/lib/mcp-http';

export const dynamic = 'force-dynamic';
const MAX_BODY_BYTES = 32768;
const headers = {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'};

const tools: McpTool[] = [
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
    description:'사용자 자신의 AI가 분류·도슨트 작성에 사용할 사진·영상 후보·역사·출처와 작성 지침을 반환합니다. 서버 AI 호출은 0회입니다. 먼저 질문 유형을 분류해 questionType에 넣고, 반환된 근거로 당신이 최종 답변을 작성하세요. token 또는 address 중 하나가 필요합니다. 장소와 동네를 구분하고 문단당 근거를 연결하세요.',
    inputSchema:{type:'object',properties:{token:{type:'string',minLength:1,maxLength:6000},address:{type:'string',minLength:2,maxLength:100},question:{type:'string',maxLength:300},questionType:{type:'string',enum:[...QUESTION_TYPES]}},oneOf:[{required:['token']},{required:['address']}],additionalProperties:false},
    annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:true}
  },
  {
    name:'validate_place_answer',
    description:'작성한 설명 JSON을 같은 token·question의 근거와 대조합니다. 대장 문장, 공간 관계·거리, 역사 근거 id·숫자, 사진 연결을 검사합니다. 의미 검토의 보조 수단입니다. 거절된 문단은 수정하거나 보류하세요.',
    inputSchema:{type:'object',properties:{
      token:{type:'string',minLength:1,maxLength:6000},question:{type:'string',maxLength:300},
      answer:{type:'object',properties:{question_type:{type:'string',enum:[...QUESTION_TYPES]},paragraphs:{type:'array',minItems:1,maxItems:6,items:{type:'object',properties:{heading:{type:'string',maxLength:40},text:{type:'string',minLength:1,maxLength:600},evidence_ids:{type:'array',minItems:1,maxItems:14,items:{type:'string',maxLength:200}},visual_ids:{type:'array',maxItems:6,items:{type:'string',maxLength:200}}},required:['heading','text','evidence_ids'],additionalProperties:false}},held:{type:'array',maxItems:4,items:{type:'string',maxLength:200}}},required:['question_type','paragraphs','held'],additionalProperties:false}
    },required:['token','answer'],additionalProperties:false},
    annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}
  },
  {
    name: 'search_place',
    description: '서울 도로명·지번 주소를 검색합니다. 후보의 token을 get_place_history에 전달하세요. 후보가 여러 개면 사용자가 장소를 선택하도록 하세요.',
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
    description: 'search_place의 주소 token으로 대장 정보와 동네 역사·사진·출처를 조회합니다. 기록의 직선거리와 공간 관계가 확인된 경우 함께 돌려줍니다.',
    inputSchema: {
      type: 'object',
      properties: {
        token: {type: 'string', minLength: 1, maxLength: 6000},
        offset: {type: 'integer', minimum: 0, maximum: 10000, default: 0},
        limit: {type: 'integer', minimum: 1, maximum: 12, default: 6},
      },
      required: ['token'],
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
  token: z.string().min(1).max(6000),
  offset: z.number().int().min(0).max(10000).default(0),
  limit: z.number().int().min(1).max(12).default(6),
}).strict();

const answerInput = z.object({
  token: z.string().min(1).max(6000).optional(),
  address: z.string().trim().min(2).max(100).optional(),
  question: z.string().trim().max(300).optional(),
  questionType: z.enum(QUESTION_TYPES).optional(),
}).strict().refine(v => Boolean(v.token) !== Boolean(v.address), {message: 'token 또는 address 중 하나만 필요합니다'});

const locationInput=z.object({latitude:z.number().finite().min(-90).max(90).optional(),longitude:z.number().finite().min(-180).max(180).optional()}).strict()
  .refine(v=>(v.latitude===undefined)===(v.longitude===undefined),{message:'위도와 경도를 함께 전달하세요'});
const photoInput=z.object({file:z.object({download_url:z.string().min(1).max(12000),file_id:z.string().min(1).max(300),mime_type:z.string().max(100).optional(),file_name:z.string().max(300).optional()}).strict().optional()}).strict();
const validationInput=z.object({
  token:z.string().min(1).max(6000),question:z.string().trim().max(300).optional(),
  answer:z.object({question_type:z.enum(QUESTION_TYPES),
    paragraphs:z.array(z.object({heading:z.string().max(40),text:z.string().min(1).max(600),evidence_ids:z.array(z.string().max(200)).min(1).max(14),visual_ids:z.array(z.string().max(200)).max(6).optional()}).strict()).min(1).max(6),
    held:z.array(z.string().max(200)).max(4)}).strict()
}).strict();

async function execute(name: string, args: Record<string, unknown>): Promise<McpToolResult> {
  const startedAt=Date.now();
  try {
    switch (name) {
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
        const {story,context}=await enrichMcpPlace(address,getFullDocentStory(address.sggNm,address.emdNm),env);
        const question=input.question||story.dong+'의 시간을 안내해 주세요.';
        const scenes=pickScenes(story,question,14,address.bdNm,context);
        const checked=validateAnswer(input.answer,scenes,context);
        await logClientDocent(env.DB,{event:'validation',ms:Date.now()-started,ok:checked.omitted===0,records:scenes.length,type:checked.questionType,kept:checked.paragraphs.length,omitted:checked.omitted});
        const used=new Set(checked.paragraphs.flatMap(p=>p.evidenceIds));
        const registerSources=context.register.records.filter(record=>used.has(record.id)).map(record=>({
          id:record.id,title:record.title,institution:record.source.institution,url:record.source.url,date:'현재 건축물대장',photo:null,
        }));
        return textResult({...checked,sources:[...scenes.filter(s=>used.has(s.id)).map(sceneSource),...registerSources],valid:checked.paragraphs.length>0&&checked.omitted===0,
          verification:'mechanical_only',note:'대장·거리 문장, 근거 id·범위·숫자와 자료 연결을 검사했습니다. 역사 문장의 의미와 인과관계는 원문으로 확인하세요.'});
      }
      case 'search_place': {
        const input = searchInput.parse(args);
        return textResult(await searchAddresses(input.query, input.page, env));
      }
      case 'get_place_history': {
        const input = historyInput.parse(args);
        const address = await verifyAddress(input.token, env);
        const {story,context} = await enrichMcpPlace(address,getDocentStory(address.sggNm, address.emdNm, [address.bdNm].filter(Boolean)),env);
        const scenes = story.scenes.slice(input.offset, input.offset + input.limit).map(scene => ({
          id: scene.id,
          kind: scene.kind,
          date: scene.date,
          year: scene.year,
          title: scene.title,
          text: scene.text,
          scope: scene.scope,
          spatialRelation: context.relations.get(scene.id),
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
        const direct=story.scenes.filter(scene=>context.relations.get(scene.id)?.category==='direct').map(scene=>({
          ...sceneSource(scene),text:scene.text,spatialRelation:context.relations.get(scene.id),
        }));
        return textResult({
          address,
          place: {records: direct, status: direct.length?'verified_parcel':'unverified', buildingRegister:context.register,
            note: direct.length?'출처에서 확인한 필지의 역사 기록입니다.':'이 주소와 직접 연결된 역사 기록은 확인되지 않았습니다.'},
          spatial: {origin:context.origin,coordinateStatus:context.coordinateStatus,radiusMeters:context.radiusMeters,distanceMethod:'straight_line_between_reference_points'},
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
          note: '각 장면의 출처와 공간 관계를 확인하세요. 인근 및 지역 배경 자료는 입력한 건물·부지와 별개입니다.',
        });
      }
      case 'prepare_place_answer':
      case 'generate_place_answer': {
        const input = answerInput.parse(args);
        let token = input.token;
        if (!token) {
          const found = await searchAddresses(input.address!, 1, env);
          if (found.candidates.length !== 1 || found.total !== 1) {
            return textResult({needsChoice: true, note: found.candidates.length ? '주소 후보가 여러 개예요. 사용자가 고른 후보의 token으로 다시 호출하세요.' : '서울 주소를 찾지 못했어요. 도로명과 건물번호를 확인해 주세요.', candidates: found.candidates.slice(0, 10).map(c => ({roadAddr: c.roadAddr, jibunAddr: c.jibunAddr, token: c.token}))});
          }
          token = found.candidates[0].token;
        }
        const address = await verifyAddress(token, env);
        const [{story,context},videos] = await Promise.all([
          enrichMcpPlace(address,getFullDocentStory(address.sggNm,address.emdNm),env),
          getDocentVideoCandidates(address.sggNm,address.emdNm),
        ]);
        const packet=await generatePlaceAnswer({address,story,context,question:input.question,questionType:input.questionType});
        await logClientDocent(env.DB,{event:'retrieval',ms:Date.now()-startedAt,ok:packet.status==='ready',records:packet.neighborhood.selected,type:input.questionType});
        const photos=packet.neighborhood.records.filter(record=>record.source.photo).slice(0,3).map(record=>({evidenceId:record.id,title:record.title,date:record.date,scope:record.scope,spatialRelation:record.spatialRelation,...record.source.photo!}));
        return textResult({...packet,videos,visuals:{photos,photoCount:photos.length,videoCount:videos.records.length,emptyNote:photos.length||videos.records.length?null:'주소에 연결된 표시 가능한 시각자료가 없습니다. 자료 없음으로 안내하세요.'},instructions:packet.instructions+'\n10) visuals.photos의 imageUrl이 있으면 사진을 Markdown 이미지로 직접 표시하고 시기·기관·원문·공간 범위를 붙이세요. 사진이 없으면 없다고 명시하세요. 관련 영상은 제목·원문 링크로 별도 안내하세요. 역사 서술의 검증 근거에는 neighborhood 기록 ID를 사용하세요. 원자료 시간과 독립 검증 상태를 구분하세요. verifiedSegments만 검증된 시간 링크이며 비어 있으면 playbackStatus의 재생구간 미검증을 명시하세요. 영상 후보를 입력 건물의 과거 모습으로 단정하지 마세요.'});
      }
      case 'get_answer_stats': {
        const input = z.object({days: z.number().int().min(1).max(365).default(30)}).strict().parse(args);
        return textResult(await placeAnswerStats(env.DB, input.days));
      }
      case 'get_archive_stats': {
        z.object({}).strict().parse(args);
        const stats: Record<string, unknown> = await archiveStats(database(env));
        // Return public counts only. Import logs can contain internal operational notes.
        const {sources, districts, dongs, historicalAreas, passages, facts, assets, originalSources, rightsChecked, storage, coverageNote} = stats;
        return textResult({sources, districts, dongs, historicalAreas, passages, facts, assets, originalSources, rightsChecked, storage, coverageNote});
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
  if(rejected)return rejected;
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
  if(invalidProtocol)return invalidProtocol;
  const response = await handleMcpMessage(message, tools, (name, args) => auditedCall(env.DB,name,clientHint(request),()=>execute(name, args)));
  if (response === undefined) return new Response(null, {status: 202, headers});
  return Response.json(response, {headers,status:'error' in response?(response.error.code===-32601?404:400):200});
}

export function GET(request:Request){return unsupportedMcpMethod(request,configuredMcpOrigins(env.MCP_ALLOWED_ORIGINS));}
export const DELETE=GET;
export const HEAD=GET;
export function OPTIONS(request:Request){return originError(request,configuredMcpOrigins(env.MCP_ALLOWED_ORIGINS))??new Response(null,{status:204,headers:{...headers,Allow:'POST, OPTIONS'}});}
