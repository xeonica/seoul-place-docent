export type BigQueryErrorCode =
  | 'BQ_DISABLED'
  | 'BQ_CONFIG_MISSING'
  | 'BQ_AUTH_FAILED'
  | 'BQ_QUERY_TIMEOUT'
  | 'BQ_BUDGET_EXCEEDED'
  | 'BQ_QUERY_FAILED'
  | 'BQ_INGEST_VALIDATION_FAILED';

const messages: Record<BigQueryErrorCode, string> = {
  BQ_DISABLED: 'BigQuery 조회가 비활성화되어 있습니다.',
  BQ_CONFIG_MISSING: 'BigQuery 설정이 불완전합니다.',
  BQ_AUTH_FAILED: 'BigQuery 인증에 실패했습니다.',
  BQ_QUERY_TIMEOUT: 'BigQuery 조회 시간이 초과되었습니다.',
  BQ_BUDGET_EXCEEDED: 'BigQuery 조회 비용 상한을 초과할 수 있어 실행하지 않았습니다.',
  BQ_QUERY_FAILED: 'BigQuery 자료 조회에 실패했습니다.',
  BQ_INGEST_VALIDATION_FAILED: 'BigQuery 적재 전 CSV 검증에 실패했습니다.',
};

export class BigQueryError extends Error {
  constructor(public readonly code: BigQueryErrorCode) {
    super(messages[code]);
    this.name = 'BigQueryError';
  }
}
