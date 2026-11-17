export type BigQueryEnv = {
  BIGQUERY_ENABLED?: string;
  BIGQUERY_PROJECT_ID?: string;
  BIGQUERY_DATASET_ID?: string;
  BIGQUERY_LOCATION?: string;
  BIGQUERY_MAX_BYTES_BILLED?: string;
  BIGQUERY_QUERY_TIMEOUT_MS?: string;
  BIGQUERY_QUERY_MAX_RESULTS?: string;
  BIGQUERY_ACCESS_TOKEN?: string;
  BIGQUERY_WIF_PROJECT_NUMBER?: string;
  BIGQUERY_WIF_POOL_ID?: string;
  BIGQUERY_WIF_PROVIDER_ID?: string;
  BIGQUERY_SERVICE_ACCOUNT_EMAIL?: string;
  VERCEL_OIDC_TOKEN?: string;
};

export type BigQueryConfig = {
  enabled: boolean;
  projectId: string;
  datasetId: string;
  location: string;
  maxBytesBilled: string;
  timeoutMs: number;
  maxResults: number;
};

export type BigQueryRecord = {
  record_id: string;
  source_institution: string;
  source_url: string;
  record_title: string;
  record_type: string;
  created_year: number | null;
  subject_start_year: number | null;
  subject_end_year: number | null;
  evidence_excerpt: string;
  rights_status: string;
  review_status: string;
  historical_place_name: string;
  event_type: string;
  relation_type: string;
  relation_evidence: string;
  district: string;
  legal_dong: string;
};

export type BigQueryQueryResult<T> = {
  rows: T[];
  jobId: string | null;
  bytesProcessed: string | null;
  cacheHit: boolean | null;
  elapsedMs: number;
};

export type BigQueryAudit = {
  dataSource: 'json' | 'json+bigquery';
  bigQueryAttempted: boolean;
  bigQueryJobId: string | null;
  bigQueryRecords: number;
  bigQueryMs: number | null;
  bigQueryCacheHit: boolean | null;
  bigQueryFallback: boolean;
  bigQueryErrorCode: string | null;
};
