import {readBigQueryConfig} from './config';
import {BigQueryError} from './errors';
import {runBigQuery} from './rest';
import type {BigQueryAudit, BigQueryEnv, BigQueryRecord} from './types';

function table(project: string, dataset: string, name: 'historical_records' | 'places' | 'record_place_links') {
  // All identifiers come from the validated server configuration or this fixed allowlist.
  return `\`${project}.${dataset}.${name}\``;
}

/**
 * Only rows explicitly approved under the D1 review vocabulary can become answer evidence.
 * Current research CSV candidates are all ineligible; ingestion alone never promotes them.
 */
export async function findVerifiedRecords(input: {
  env: BigQueryEnv;
  request?: Request;
  district: string;
  dong: string;
  audit: BigQueryAudit;
}) {
  if (input.env.BIGQUERY_ENABLED?.trim().toLowerCase() !== 'true') return [];
  input.audit.bigQueryAttempted = true;
  let config;
  try { config = readBigQueryConfig(input.env); }
  catch (error) {
    input.audit.bigQueryFallback = true;
    input.audit.bigQueryErrorCode = error instanceof BigQueryError ? error.code : 'BQ_CONFIG_MISSING';
    throw error;
  }
  const sql = `
    SELECT
      r.record_id, r.source_institution, r.source_url, r.record_title, r.record_type,
      r.created_year, r.subject_start_year, r.subject_end_year, r.evidence_excerpt,
      r.rights_status, r.review_status, r.historical_place_name, r.event_type,
      l.relation_type, l.relation_evidence, p.district, p.legal_dong
    FROM ${table(config.projectId, config.datasetId, 'historical_records')} AS r
    JOIN ${table(config.projectId, config.datasetId, 'record_place_links')} AS l
      ON l.record_id = r.record_id
    JOIN ${table(config.projectId, config.datasetId, 'places')} AS p
      ON p.place_id = l.place_id
    WHERE p.district = @district
      AND (p.legal_dong = @dong OR l.relation_type = 'DISTRICT_CONTEXT')
      AND LOWER(r.review_status) = 'content_checked'
      AND r.rights_status IN ('KOGL0', 'KOGL1', 'public_domain')
      AND LOWER(p.location_review_status) = 'verified'
      AND LOWER(l.link_review_status) = 'content_checked'
      AND l.relation_type IN ('EXACT_SITE', 'NEARBY', 'DISTRICT_CONTEXT')
      AND STARTS_WITH(LOWER(r.source_url), 'https://')
    ORDER BY COALESCE(r.subject_start_year, r.created_year) IS NULL,
      COALESCE(r.subject_start_year, r.created_year), r.record_id
    LIMIT @limit`;
  try {
    const result = await runBigQuery<Record<string, unknown>>(input.env, config, input.request, sql, [
      {name: 'district', type: 'STRING', value: input.district},
      {name: 'dong', type: 'STRING', value: input.dong},
      {name: 'limit', type: 'INT64', value: config.maxResults},
    ]);
    input.audit.dataSource = result.rows.length ? 'json+bigquery' : 'json';
    input.audit.bigQueryJobId = result.jobId;
    input.audit.bigQueryRecords = result.rows.length;
    input.audit.bigQueryMs = result.elapsedMs;
    input.audit.bigQueryCacheHit = result.cacheHit;
    return result.rows.map(mapRecord).filter((row): row is BigQueryRecord => !!row);
  } catch (error) {
    input.audit.bigQueryFallback = true;
    input.audit.bigQueryErrorCode = error instanceof BigQueryError ? error.code : 'BQ_QUERY_FAILED';
    input.audit.dataSource = 'json';
    throw error;
  }
}

function text(row: Record<string, unknown>, key: string) { return typeof row[key] === 'string' ? row[key] as string : ''; }
function year(row: Record<string, unknown>, key: string) {
  const value = row[key];
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 9999 ? number : null;
}
function mapRecord(row: Record<string, unknown>): BigQueryRecord | null {
  const required = ['record_id', 'source_institution', 'source_url', 'record_title', 'district', 'relation_type'];
  if (required.some(key => !text(row, key)) || !text(row, 'source_url').startsWith('https://')) return null;
  return {
    record_id: text(row, 'record_id'), source_institution: text(row, 'source_institution'),
    source_url: text(row, 'source_url'), record_title: text(row, 'record_title'),
    record_type: text(row, 'record_type'), created_year: year(row, 'created_year'),
    subject_start_year: year(row, 'subject_start_year'), subject_end_year: year(row, 'subject_end_year'),
    evidence_excerpt: text(row, 'evidence_excerpt'), rights_status: text(row, 'rights_status'),
    review_status: text(row, 'review_status'), historical_place_name: text(row, 'historical_place_name'),
    event_type: text(row, 'event_type'), relation_type: text(row, 'relation_type'),
    relation_evidence: text(row, 'relation_evidence'), district: text(row, 'district'), legal_dong: text(row, 'legal_dong'),
  };
}

export function toBigQueryScenes(rows: BigQueryRecord[]) {
  return rows.map(row => {
    const start = row.subject_start_year ?? row.created_year;
    const end = row.subject_end_year;
    const date = start === null ? '시기 미상' : end && end !== start ? `${start}~${end}년` : `${start}년`;
    const relationNote = row.relation_type === 'DISTRICT_CONTEXT'
      ? '자치구 맥락 자료입니다. 특정 동·건물과의 직접 관계로 단정하지 마세요.'
      : row.relation_type === 'NEARBY'
        ? '인근 자료입니다. 입력 장소와 같은 부지라고 단정하지 마세요.'
        : '검토된 자료이지만 특정 건물·필지의 동일성을 뜻하지 않습니다.';
    return {
      id: `bq:${row.record_id}`, kind: 'document' as const,
      date, year: start, order: start ?? Number.POSITIVE_INFINITY,
      title: row.record_title, text: row.evidence_excerpt, scope: row.relation_type === 'DISTRICT_CONTEXT' || !row.legal_dong ? 'district' as const : 'dong' as const,
      photos: [], cutCount: 0,
      evidence: [{title: row.record_title, url: row.source_url, institution: row.source_institution, note: relationNote}],
    };
  });
}

export function emptyBigQueryAudit(): BigQueryAudit {
  return {dataSource: 'json', bigQueryAttempted: false, bigQueryJobId: null, bigQueryRecords: 0, bigQueryMs: null, bigQueryCacheHit: null, bigQueryFallback: false, bigQueryErrorCode: null};
}
