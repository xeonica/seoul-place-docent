import {z} from 'zod';

const ktv = 'https://apis.data.go.kr/1371037/';
const sources = {
  english_address: {key:'JUSO_ENG_API_KEY', url:'https://business.juso.go.kr/addrlink/addrEngApi.do'},
  ktv_posts: {key:'KTV_POSTS_API_KEY', url:ktv+'ktvBoard/noticeList'},
  ktv_ehistory: {key:'KTV_EHISTORY_API_KEY', url:ktv+'ktvHistory/dhNewsList'},
  ktv_broadcast: {key:'KTV_BROADCAST_VIDEO_API_KEY', url:ktv+'ktvVideo/videoList'},
} as const;
const sourceNames = ['english_address','ktv_posts','ktv_ehistory','ktv_broadcast'] as const;
const inputSchema = z.object({
  source:z.enum(sourceNames),
  query:z.string().trim().min(2).max(100).optional(),
  startDate:z.string().regex(/^\d{8}$/).optional(),
  endDate:z.string().regex(/^\d{8}$/).optional(),
}).strict();

export const livePublicDataTool = {
  name:'lookup_live_public_data',
  description:'공식 API를 실시간 조회합니다. english_address는 한글 도로명주소(query)의 영문 표기를, ktv_posts는 KTV 공지 목록을, ktv_ehistory는 대한뉴스를, ktv_broadcast는 방송 영상을 조회합니다. KTV 날짜는 YYYYMMDD이며 query는 제목 필터입니다. 반환 자료는 장소 일치가 검증되지 않은 후보입니다.',
  inputSchema:{
    type:'object' as const,
    properties:{
      source:{type:'string',enum:[...sourceNames]},
      query:{type:'string',minLength:2,maxLength:100},
      startDate:{type:'string',pattern:'^[0-9]{8}$'},
      endDate:{type:'string',pattern:'^[0-9]{8}$'},
    },
    required:['source'],
    additionalProperties:false,
  },
  annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:true},
};

export async function lookupLivePublicData(args:unknown, getKey:(name:string)=>string|undefined) {
  const input = inputSchema.parse(args);
  const {source,query,startDate,endDate} = input;
  const english = source === 'english_address';
  if (english && !query) return {source,status:'query_required'};
  const config = sources[source];
  const key = getKey(config.key)?.trim();
  if (!key) return {source,status:'not_configured'};
  const url = new URL(config.url);
  url.search = new URLSearchParams(english
    ? {confmKey:key,keyword:query!,resultType:'json',currentPage:'1',countPerPage:'5'}
    : {serviceKey:key,pageNo:'1',numOfRows:'5',...(query ? {title:query} : {}),...(startDate ? {startDate} : {}),...(endDate ? {endDate} : {})}).toString();
  try {
    const response = await fetch(url,{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(8000)});
    if (!response.ok) return {source,status:'upstream_http_error',httpStatus:response.status};
    // Two providers (Juso and KTV) share this path with different shapes; fields are checked below.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload = await response.json() as any;
    const root = payload.response ?? payload;
    const code = english ? root.results?.common?.errorCode : root.header?.resultCode;
    if (code === undefined) return {source,status:'unexpected_response'};
    if (!['0','00','0000'].includes(String(code))) return {source,status:'upstream_rejected'};
    const records = english ? root.results?.juso : root.body;
    const safe = JSON.stringify(records ?? null).split(key).join('[redacted]').split(encodeURIComponent(key)).join('[redacted]');
    return {source,status:'ok',records:JSON.parse(safe)};
  } catch {
    return {source,status:'upstream_unavailable'};
  }
}
