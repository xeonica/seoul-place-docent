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
type QueryParameter = {name: string; parameterType: {type: 'STRING' | 'INT64'}; parameterValue: {value: string}};
const parameter = (name: string, value: string | number): QueryParameter => ({
  name, parameterType: {type: typeof value === 'number' ? 'INT64' : 'STRING'}, parameterValue: {value: String(value)},
});

async function queryBigQuery(request: Request, query: string, queryParameters: QueryParameter[]) {
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

export async function bigQueryPlaceCandidates(request: Request, address: {roadAddr: string}, limit = 6, offset = 0) {
  const road = address.roadAddr.replace(/\s*\([^()]*\)\s*$/, '').replace(/\s+/g, '');
  if (!road) return undefined;
  try {
    const rows = await queryBigQuery(request,
      'SELECT ' + fields.join(', ') + ' FROM `' + view + '` ' +
      "WHERE REGEXP_REPLACE(road_address, r'\\s+', '') = @road AND STARTS_WITH(source_url, 'https://') " +
      'ORDER BY historical_period_raw, record_id, relation_type LIMIT @limit OFFSET @offset',
      [parameter('road', road), parameter('limit', limit + 1), parameter('offset', offset)]);
    if (!rows) return undefined;
    return {
      source: 'bigquery', status: 'ready', nextOffset: rows.length > limit ? offset + limit : null,
      note: '주소로 찾은 조사 후보입니다. 연결 검토 상태와 이용조건을 확인하고 확정 근거 또는 시각자료로 사용하지 마세요.',
      records: rows.slice(0, limit).map(row => ({
        ...Object.fromEntries(fields.map((field, index) => [field, row.f[index]?.v ?? null])),
        usableAsVerifiedEvidence: false,
      })),
    };
  } catch {
    return {source: 'bigquery', status: 'unavailable', records: [], nextOffset: null};
  }
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
