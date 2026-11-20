import {evidencePlace,normalizePlaceText,normalizeRelation} from './evidence-place';
import type {Address} from './providers';
const scope = 'https://www.googleapis.com/auth/cloud-platform';
const view = 'seoul-docent-archive.docent_serving.place_records';
const fields = ['record_id', 'record_title', 'media_type', 'historical_period_raw',
  'source_institution', 'source_url', 'relation_type', 'link_review_status', 'review_status', 'rights_status'];

async function post<T>(url: string, body: unknown, signal: AbortSignal, token?: string) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {'Content-Type': 'application/json', ...(token ? {Authorization: 'Bearer ' + token} : {})},
    body: JSON.stringify(body), signal,
  });
  if (!response.ok) throw new Error('Upstream HTTP ' + response.status);
  return await response.json() as T;
}

type QueryResult = {jobComplete: boolean; errors?: unknown[]; rows?: {f: {v: string | null}[]}[]};
type QueryParameter = {name: string; parameterType: {type: 'STRING' | 'INT64' | 'FLOAT64'}; parameterValue: {value: string}};
const parameter = (name: string, value: string | number): QueryParameter => ({
  name, parameterType: {type: typeof value === 'number' ? 'INT64' : 'STRING'}, parameterValue: {value: String(value)},
});

export async function queryBigQuery(request: Request, query: string, queryParameters: QueryParameter[]) {
  const settings = process.env;
  const subjectToken = request.headers.get('x-vercel-oidc-token');
  const {GCP_PROJECT_ID: project, GCP_PROJECT_NUMBER: number, GCP_WORKLOAD_IDENTITY_POOL_ID: pool,
    GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: provider, GCP_SERVICE_ACCOUNT_EMAIL: account,
    BIGQUERY_LOCATION: location} = settings;
  if (settings.VERCEL !== '1' || !subjectToken || !project || !number || !pool || !provider || !account || !location) return undefined;

  const signal = AbortSignal.timeout(5000);
  const federated = await post<{access_token: string}>('https://sts.googleapis.com/v1/token', {
      audience: '//iam.googleapis.com/projects/' + number + '/locations/global/workloadIdentityPools/' + pool + '/providers/' + provider,
      scope, subjectToken, subjectTokenType: 'urn:ietf:params:oauth:token-type:jwt',
      grantType: 'urn:ietf:params:oauth:grant-type:token-exchange',
      requestedTokenType: 'urn:ietf:params:oauth:token-type:access_token',
    }, signal);
  const service = await post<{accessToken: string}>(
      'https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/' + encodeURIComponent(account) + ':generateAccessToken',
      {scope: [scope]}, signal, federated.access_token);
  const result = await post<QueryResult>(
    'https://bigquery.googleapis.com/bigquery/v2/projects/' + encodeURIComponent(project) + '/queries',
    {query, parameterMode: 'NAMED', queryParameters, useLegacySql: false, location,
      timeoutMs: 3500, maximumBytesBilled: '1000000000'}, signal, service.accessToken,
  );
  if (!result.jobComplete || result.errors?.length) throw new Error('Query did not complete');
  return result.rows ?? [];
}

export async function bigQueryPlaceCandidates(request: Request, address: Partial<Address>, limit = 6, offset = 0, aliases:string[] = [], point?:{latitude:number;longitude:number;radiusM?:number}) {
  const place=evidencePlace(address),road=normalizePlaceText(address.roadAddr),jibun=normalizePlaceText(address.jibunAddr);
  limit=Math.min(20,Math.max(1,Math.floor(limit)||6));offset=Math.min(1000,Math.max(0,Math.floor(offset)||0));
  const pointValid=!!point&&Number.isFinite(point.latitude)&&Number.isFinite(point.longitude)&&Math.abs(point.latitude)<=90&&Math.abs(point.longitude)<=180;
  const radius=Math.floor(Math.min(2000,Math.max(1,point?.radiusM||500)));
  const selected=process.env.BIGQUERY_PLACE_SERVING_VERSION==='v2'?'seoul-docent-archive.docent_serving.place_evidence_candidates_v2':view;
  // JSON field extraction is additive-compatible with the legacy serving view.
  const field=(name:string)=>`JSON_VALUE(TO_JSON_STRING(r), '$.${name}')`;
  const clean=(name:string)=>`REGEXP_REPLACE(NORMALIZE_AND_CASEFOLD(REGEXP_REPLACE(COALESCE(${field(name)}, ''), r'^서울\\s', '서울특별시 '), NFKC), r'\\s+', '')`;
  const near=`(@has_point='true' AND ST_DWITHIN(SAFE.ST_GEOGPOINT(SAFE_CAST(${field('longitude')} AS FLOAT64),SAFE_CAST(${field('latitude')} AS FLOAT64)),ST_GEOGPOINT(@longitude,@latitude),@radius))`;
  const match=`${near} OR (@building != '' AND ${field('building_management_number')}=@building) OR (@pnu != '' AND ${field('pnu')}=@pnu) OR (@road != '' AND ${clean('road_address')}=@road) OR (@jibun != '' AND ${clean('jibun_address')}=@jibun) OR (@district != '' AND ${field('district')}=@district AND ((@dong != '' AND ${field('legal_dong')}=@dong) OR (@name != '' AND ${clean('place_name')}=@name))) OR (@district != '' AND ${field('district')}=@district AND COALESCE(${field('legal_dong')},'')='' AND COALESCE(${field('place_id')},'')='') OR (@alias != '' AND ${field('alias_verified')}='true' AND STRPOS(@alias, CONCAT('|',${clean('alias_name')},'|'))>0)`;
  try {
    const rows = await queryBigQuery(request,
      'SELECT '+fields.map(field).join(', ')+', TO_JSON_STRING(r) FROM `'+selected+'` r WHERE ('+match+") AND STARTS_WITH(source_url, 'https://') ORDER BY CASE WHEN "+field('building_management_number')+"=@building AND @building!='' THEN 0 WHEN "+field('pnu')+"=@pnu AND @pnu!='' THEN 1 WHEN "+clean('road_address')+"=@road THEN 2 ELSE 3 END, record_id LIMIT @limit OFFSET @offset",
      [parameter('has_point',pointValid?'true':'false'),{name:'latitude',parameterType:{type:'FLOAT64'},parameterValue:{value:String(pointValid?point!.latitude:0)}},{name:'longitude',parameterType:{type:'FLOAT64'},parameterValue:{value:String(pointValid?point!.longitude:0)}},parameter('radius',radius),parameter('road',road),parameter('jibun',jibun),parameter('building',place.buildingManagementNumber||''),parameter('pnu',place.pnu||''),parameter('district',place.district||''),parameter('dong',place.legalDong||''),parameter('name',normalizePlaceText(place.placeName||'')),parameter('alias',aliases.slice(0,10).map(value=>'|'+normalizePlaceText(value)+'|').join('')),parameter('limit',limit+1),parameter('offset',offset)]);
    if (!rows) return {source:'bigquery',status:'unavailable',diagnosticStatus:'backend_unavailable',records:[],nextOffset:null,diagnostics:{backendStatus:'unavailable',candidateCount:0,placeLinkedCount:0,approvedCount:0,usableEvidenceCount:0,reasonCodes:['workload_identity_unconfigured']}};
    return {source:'bigquery',status:'ready',diagnosticStatus:rows.length?'candidates_unlinked':'no_candidates',nextOffset:rows.length>limit?offset+limit:null,
      note:'후보 검색 결과입니다. 문자열·식별자 일치만으로 승인되지 않습니다. D1의 현재 검토·권리 이력이 별도로 필요합니다.',
      records:rows.slice(0,limit).map(row=>{
        let detail:Record<string,unknown>={};try{detail=JSON.parse(row.f[fields.length]?.v||'{}');}catch{}
        return {...Object.fromEntries(fields.map((name,index)=>[name,row.f[index]?.v??null])),originalRecordId:typeof detail.original_record_id==='string'?detail.original_record_id:null,placeId:typeof detail.place_id==='string'?detail.place_id:null,relation_type:normalizeRelation(String(detail.relation_type||row.f[6]?.v||'uncertain')),usableAsVerifiedEvidence:false};
      }),diagnostics:{backendStatus:'ready',candidateCount:Math.min(rows.length,limit),placeLinkedCount:0,approvedCount:0,usableEvidenceCount:0,reasonCodes:rows.length?['candidate_approval_not_authoritative']:['no_matching_serving_rows']}};
  } catch {return {source:'bigquery',status:'unavailable',diagnosticStatus:'query_error',records:[],nextOffset:null,diagnostics:{backendStatus:'unavailable',candidateCount:0,placeLinkedCount:0,approvedCount:0,usableEvidenceCount:0,reasonCodes:['query_failed']}};}
}

const githubFields = ['research_id', 'title', 'source_url', 'media_type', 'district', 'location',
  'review_status', 'rights_status', 'source_commit', 'source_file', 'source_line', 'import_row_id'];

export async function bigQueryGitHubCandidates(request: Request, input: {
  query?: string; district?: string; dong?: string; placeName?: string; limit?: number; offset?: number;
}) {
  const normalized = (value?: string) => (value ?? '').normalize('NFKC').trim().toLowerCase().replace(/\s+/g, '');
  const {limit = 6, offset = 0} = input;
  const query = normalized(input.query);
  const dong = normalized(input.dong);
  const placeName = normalized(input.placeName);
  if (!query && !dong && !placeName) return undefined;

  try {
    const rows = await queryBigQuery(request, `
      WITH matches AS (
        SELECT *,
          REGEXP_REPLACE(NORMALIZE_AND_CASEFOLD(CONCAT(COALESCE(title, ''), ' ', COALESCE(location, '')), NFKC), r'\\s+', '') AS terms
        FROM \`seoul-docent-archive.docent_serving.github_research_candidates\`
        WHERE @district = '' OR district = @district
      )
      SELECT ${githubFields.join(', ')}
      FROM matches
      WHERE (@query = '' OR STRPOS(terms, @query) > 0)
        AND ((@dong = '' AND @place = '') OR (@dong != '' AND STRPOS(terms, @dong) > 0)
          OR (@place != '' AND STRPOS(terms, @place) > 0))
      QUALIFY ROW_NUMBER() OVER (PARTITION BY research_id ORDER BY source_file, source_line, import_row_id) = 1
      ORDER BY IF(@place != '' AND STRPOS(terms, @place) > 0, 0, 1), research_id
      LIMIT @limit OFFSET @offset`, [
      parameter('district', input.district ?? ''), parameter('query', query),
      parameter('dong', dong), parameter('place', placeName),
      parameter('limit', limit + 1), parameter('offset', offset),
    ]);
    if (!rows) return undefined;
    return {
      source: 'bigquery', status: 'ready', nextOffset: rows.length > limit ? offset + limit : null,
      records: rows.slice(0, limit).map(({f}) => ({
        ...Object.fromEntries(githubFields.map((field, index) => [field, f[index]?.v ?? null])),
        usableAsVerifiedEvidence: false, buildingMatch: 'unverified',
      })),
      note: 'GitHub 조사 후보의 원문 링크와 출처행입니다. 장소 일치 및 이미지·영상 사용 권한은 원문에서 확인하세요.',
    };
  } catch {
    return {source: 'bigquery', status: 'unavailable', records: [], nextOffset: null};
  }
}

const hansungFields = ['record_id', 'record_title', 'record_type', 'source_institution', 'source_url', 'created_date_raw'];

export async function bigQueryHansungArchive(request: Request, input: {
  query?: string; district?: string; roadAddr?: string; limit?: number; offset?: number;
}) {
  const normalize = (value: string) => value.normalize('NFKC').toLowerCase().replace(/\s+/g, '');
  const query = normalize(input.query ?? '');
  const campus = normalize((input.roadAddr ?? '').replace(/\s*\([^()]*\)\s*$/, ''));
  if (input.district && input.district !== '성북구') return undefined;
  if (input.roadAddr ? campus !== '서울특별시성북구삼선교로16길116' : !/한성대|hansunguniversity/.test(query)) return undefined;
  const term = query.replace(/한성대학교|한성대|hansunguniversity|아카이브|archives?/g, '');
  const {limit = 6, offset = 0} = input;
  try {
    const rows = await queryBigQuery(request, `
      SELECT ${hansungFields.join(', ')}
      FROM \`seoul-docent-archive.docent_raw.hansung-archive\`
      WHERE NULLIF(TRIM(record_title), '') IS NOT NULL
        AND REGEXP_CONTAINS(source_url, r'^https://archives[.]hansung[.]ac[.]kr/')
        AND (@term = '' OR STRPOS(REGEXP_REPLACE(NORMALIZE_AND_CASEFOLD(record_title, NFKC), r'\\s+', ''), @term) > 0)
      QUALIFY ROW_NUMBER() OVER (
        PARTITION BY COALESCE(NULLIF(TRIM(record_id), ''), source_url)
        ORDER BY source_url, record_title, record_type, source_institution, created_date_raw
      ) = 1
      ORDER BY IF(NULLIF(TRIM(created_date_raw), '') IS NULL, 1, 0), created_date_raw, record_title, record_id, source_url
      LIMIT @limit OFFSET @offset`, [
      parameter('term', term), parameter('limit', limit + 1), parameter('offset', offset),
    ]);
    if (!rows) return undefined;
    return {
      source: 'bigquery', status: 'ready', nextOffset: rows.length > limit ? offset + limit : null,
      records: rows.slice(0, limit).map(({f}) => ({
        ...Object.fromEntries(hansungFields.map((field, index) => [field, f[index]?.v ?? null])),
        usableAsVerifiedEvidence: false, buildingMatch: 'unverified',
      })),
      note: '한성대학교 공식 아카이브의 목록과 원문 링크입니다. 기록의 촬영 장소와 이용조건은 원문에서 확인하세요.',
    };
  } catch (error) {
    const reason = error instanceof Error && error.message === 'Upstream HTTP 403' ? 'access_denied' : 'query_failed';
    return {source: 'bigquery', status: 'unavailable', reason, records: [], nextOffset: null};
  }
}
