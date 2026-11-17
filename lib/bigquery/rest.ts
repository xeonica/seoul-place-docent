import {BigQueryError} from './errors';
import type {BigQueryConfig, BigQueryEnv, BigQueryQueryResult} from './types';

type QueryParameter = {name: string; type: 'STRING' | 'INT64'; value: string | number};
type QueryWire = {query: string; useLegacySql: false; location: string; timeoutMs: number; maximumBytesBilled: string; dryRun?: boolean; useQueryCache?: boolean; maxResults?: number; parameterMode?: 'NAMED'; queryParameters?: Array<{name: string; parameterType: {type: string}; parameterValue: {value: string}}>};

async function postJson(url: string, token: string, body: unknown, timeoutMs: number) {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json'},
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'error',
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') throw new BigQueryError('BQ_QUERY_TIMEOUT');
    throw new BigQueryError('BQ_QUERY_FAILED');
  }
  if (response.status === 401 || response.status === 403) throw new BigQueryError('BQ_AUTH_FAILED');
  if (!response.ok) {
    const raw = await response.text().catch(() => '');
    if (/bytesBilledLimitExceeded|maximumBytesBilled/i.test(raw)) throw new BigQueryError('BQ_BUDGET_EXCEEDED');
    throw new BigQueryError('BQ_QUERY_FAILED');
  }
  try { return await response.json() as Record<string, unknown>; }
  catch { throw new BigQueryError('BQ_QUERY_FAILED'); }
}

async function accessToken(env: BigQueryEnv, config: BigQueryConfig, request:Request|undefined, timeoutMs:number) {
  // Local ADC is converted to a short-lived token with `gcloud auth application-default print-access-token`.
  const local = env.BIGQUERY_ACCESS_TOKEN?.trim();
  if (local) return local;
  const subjectToken = request?.headers.get('x-vercel-oidc-token') || env.VERCEL_OIDC_TOKEN;
  const projectNumber = env.BIGQUERY_WIF_PROJECT_NUMBER?.trim();
  const pool = env.BIGQUERY_WIF_POOL_ID?.trim();
  const provider = env.BIGQUERY_WIF_PROVIDER_ID?.trim();
  const serviceAccount = env.BIGQUERY_SERVICE_ACCOUNT_EMAIL?.trim();
  if (!subjectToken || !projectNumber || !pool || !provider || !serviceAccount || !/^\d+$/.test(projectNumber) || !/^[A-Za-z0-9_-]+$/.test(pool) || !/^[A-Za-z0-9_-]+$/.test(provider) || !/^[^\s@]+@[^\s@]+\.iam\.gserviceaccount\.com$/.test(serviceAccount)) {
    throw new BigQueryError('BQ_AUTH_FAILED');
  }
  const audience = `//iam.googleapis.com/projects/${projectNumber}/locations/global/workloadIdentityPools/${pool}/providers/${provider}`;
  const exchange = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
    audience,
    requested_token_type: 'urn:ietf:params:oauth:token-type:access_token',
    subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
    subject_token: subjectToken,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
  });
  const sts = await fetch('https://sts.googleapis.com/v1/token', {
    method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body: exchange,
    signal: AbortSignal.timeout(timeoutMs), redirect: 'error',
  }).catch(() => { throw new BigQueryError('BQ_AUTH_FAILED'); });
  if (!sts.ok) throw new BigQueryError('BQ_AUTH_FAILED');
  const federated = await sts.json().catch(() => null) as {access_token?: string} | null;
  if (!federated?.access_token) throw new BigQueryError('BQ_AUTH_FAILED');
  const url = `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(serviceAccount)}:generateAccessToken`;
  const impersonated = await postJson(url, federated.access_token, {scope: ['https://www.googleapis.com/auth/cloud-platform'], lifetime: '3600s'}, timeoutMs);
  if (typeof impersonated.accessToken !== 'string' || !impersonated.accessToken) throw new BigQueryError('BQ_AUTH_FAILED');
  return impersonated.accessToken;
}

function wireParameters(parameters: QueryParameter[] = []) {
  return parameters.map(item => ({name: item.name, parameterType: {type: item.type}, parameterValue: {value: String(item.value)}}));
}

function rowsFromWire(schema: unknown, rows: unknown): Record<string, unknown>[] {
  if (!Array.isArray(rows) || !schema || typeof schema !== 'object' || !Array.isArray((schema as {fields?: unknown}).fields)) return [];
  const fields = (schema as {fields: Array<{name?: unknown}>}).fields;
  return rows.flatMap(row => {
    const cells = (row as {f?: unknown})?.f;
    if (!Array.isArray(cells)) return [];
    const result: Record<string, unknown> = {};
    fields.forEach((field, index) => { result[String(field.name)] = (cells[index] as {v?: unknown} | undefined)?.v ?? null; });
    return [result];
  });
}

export async function runBigQuery<T extends Record<string, unknown>>(
  env: BigQueryEnv,
  config: BigQueryConfig,
  request: Request | undefined,
  sql: string,
  parameters: QueryParameter[],
): Promise<BigQueryQueryResult<T>> {
  const startedAt = Date.now();
  const deadline = startedAt + config.timeoutMs;
  const remaining = () => {const value=deadline-Date.now();if(value<=0)throw new BigQueryError('BQ_QUERY_TIMEOUT');return value;};
  const token = await accessToken(env, config, request, remaining());
  const endpoint = `https://bigquery.googleapis.com/bigquery/v2/projects/${encodeURIComponent(config.projectId)}/queries`;
  const base: QueryWire = {
    query: sql, useLegacySql: false, location: config.location,
    timeoutMs: config.timeoutMs, maximumBytesBilled: config.maxBytesBilled,
    parameterMode: 'NAMED', queryParameters: wireParameters(parameters),
  };
  const estimate = await postJson(endpoint, token, {...base, timeoutMs:remaining(), dryRun: true}, remaining());
  const bytesProcessed = typeof estimate.totalBytesProcessed === 'string' ? estimate.totalBytesProcessed : null;
  if (bytesProcessed && BigInt(bytesProcessed) > BigInt(config.maxBytesBilled)) throw new BigQueryError('BQ_BUDGET_EXCEEDED');
  const result = await postJson(endpoint, token, {...base, timeoutMs:remaining(), useQueryCache: true, maxResults: config.maxResults}, remaining());
  if (Array.isArray(result.errors) && result.errors.length) throw new BigQueryError('BQ_QUERY_FAILED');
  const jobReference = result.jobReference as {jobId?: unknown; location?: unknown} | undefined;
  const jobId = typeof jobReference?.jobId === 'string' ? jobReference.jobId : null;
  let complete = result.jobComplete === true;
  let latest = result;
  while (!complete && jobId && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 150));
    const params = new URLSearchParams({location: config.location, maxResults: String(config.maxResults)});
    let response: Response;
    try {
      response = await fetch(`https://bigquery.googleapis.com/bigquery/v2/projects/${encodeURIComponent(config.projectId)}/queries/${encodeURIComponent(jobId)}?${params}`, {
        headers: {Authorization: `Bearer ${token}`}, signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())), redirect: 'error',
      });
    } catch { throw new BigQueryError('BQ_QUERY_TIMEOUT'); }
    if (response.status === 401 || response.status === 403) throw new BigQueryError('BQ_AUTH_FAILED');
    if (!response.ok) throw new BigQueryError('BQ_QUERY_FAILED');
    latest = await response.json().catch(() => null) as Record<string, unknown>;
    if (!latest) throw new BigQueryError('BQ_QUERY_FAILED');
    complete = latest.jobComplete === true;
  }
  if (!complete) throw new BigQueryError('BQ_QUERY_TIMEOUT');
  return {
    rows: rowsFromWire(latest.schema, latest.rows) as T[],
    jobId,
    bytesProcessed: typeof latest.totalBytesProcessed === 'string' ? latest.totalBytesProcessed : bytesProcessed,
    cacheHit: typeof latest.cacheHit === 'boolean' ? latest.cacheHit : null,
    elapsedMs: Math.max(0, Date.now() - startedAt),
  };
}
