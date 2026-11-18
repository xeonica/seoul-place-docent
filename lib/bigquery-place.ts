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

export async function bigQueryPlaceCandidates(request: Request, address: {roadAddr: string}, limit = 6, offset = 0) {
  const settings = process.env;
  const subjectToken = request.headers.get('x-vercel-oidc-token');
  const {GCP_PROJECT_ID: project, GCP_PROJECT_NUMBER: number, GCP_WORKLOAD_IDENTITY_POOL_ID: pool,
    GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: provider, GCP_SERVICE_ACCOUNT_EMAIL: account,
    BIGQUERY_LOCATION: location} = settings;
  if (settings.VERCEL !== '1' || !subjectToken || !project || !number || !pool || !provider || !account || !location) return undefined;

  const road = address.roadAddr.replace(/\s*\([^()]*\)\s*$/, '').replace(/\s+/g, '');
  if (!road) return undefined;
  const signal = AbortSignal.timeout(5000);
  try {
    const federated = await post<{access_token: string}>('https://sts.googleapis.com/v1/token', {
      audience: '//iam.googleapis.com/projects/' + number + '/locations/global/workloadIdentityPools/' + pool + '/providers/' + provider,
      scope, subjectToken, subjectTokenType: 'urn:ietf:params:oauth:token-type:jwt',
      grantType: 'urn:ietf:params:oauth:grant-type:token-exchange',
      requestedTokenType: 'urn:ietf:params:oauth:token-type:access_token',
    }, signal);
    const service = await post<{accessToken: string}>(
      'https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/' + encodeURIComponent(account) + ':generateAccessToken',
      {scope: [scope]}, signal, federated.access_token);
    const result = await post<{jobComplete: boolean; errors?: unknown[]; rows?: {f: {v: string | null}[]}[]}>('https://bigquery.googleapis.com/bigquery/v2/projects/' + encodeURIComponent(project) + '/queries', {
      query: 'SELECT ' + fields.join(', ') + ' FROM `' + view + '` ' +
        "WHERE REGEXP_REPLACE(road_address, r'\\s+', '') = @road AND STARTS_WITH(source_url, 'https://') " +
        'ORDER BY historical_period_raw, record_id, relation_type LIMIT @limit OFFSET @offset',
      parameterMode: 'NAMED',
      queryParameters: [
        {name: 'road', parameterType: {type: 'STRING'}, parameterValue: {value: road}},
        {name: 'limit', parameterType: {type: 'INT64'}, parameterValue: {value: String(limit + 1)}},
        {name: 'offset', parameterType: {type: 'INT64'}, parameterValue: {value: String(offset)}},
      ],
      useLegacySql: false, location, timeoutMs: 3500, maximumBytesBilled: '1000000000',
    }, signal, service.accessToken);
    if (!result.jobComplete || result.errors?.length) throw new Error('Query did not complete');
    const rows = result.rows ?? [];
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
