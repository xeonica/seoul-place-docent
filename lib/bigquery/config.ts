import {BigQueryError} from './errors';
import type {BigQueryConfig, BigQueryEnv} from './types';

const identifier = /^[A-Za-z0-9_-]{1,1024}$/;
const projectId = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
function boundedInteger(value: string | undefined, fallback: number, min: number, max: number) {
  if (value === undefined || value.trim() === '') return fallback;
  if (!/^\d+$/.test(value)) throw new BigQueryError('BQ_CONFIG_MISSING');
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) throw new BigQueryError('BQ_CONFIG_MISSING');
  return parsed;
}

export function readBigQueryConfig(env: BigQueryEnv): BigQueryConfig {
  const enabled = env.BIGQUERY_ENABLED?.trim().toLowerCase() === 'true';
  if (!enabled) throw new BigQueryError('BQ_DISABLED');
  const id = env.BIGQUERY_PROJECT_ID?.trim() || '';
  const dataset = env.BIGQUERY_DATASET_ID?.trim() || '';
  const location = env.BIGQUERY_LOCATION?.trim() || '';
  if (!projectId.test(id) || !identifier.test(dataset) || !/^[A-Za-z0-9_-]{2,40}$/.test(location)) {
    throw new BigQueryError('BQ_CONFIG_MISSING');
  }
  const maxBytesBilled = env.BIGQUERY_MAX_BYTES_BILLED?.trim() || '104857600';
  if (!/^\d+$/.test(maxBytesBilled) || BigInt(maxBytesBilled) <= 0n) throw new BigQueryError('BQ_CONFIG_MISSING');
  return {
    enabled,
    projectId: id,
    datasetId: dataset,
    location,
    maxBytesBilled,
    timeoutMs: boundedInteger(env.BIGQUERY_QUERY_TIMEOUT_MS, 8000, 250, 30000),
    maxResults: boundedInteger(env.BIGQUERY_QUERY_MAX_RESULTS, 8, 1, 20),
  };
}
