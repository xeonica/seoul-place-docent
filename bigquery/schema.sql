-- Create the dataset and choose its location in Google Cloud before applying this DDL.
-- BigQuery does not enforce primary/foreign keys; the ingestion pipeline validates them.
CREATE TABLE IF NOT EXISTS `{{project}}.{{dataset}}.historical_records` (
  record_id STRING NOT NULL,
  source_institution STRING NOT NULL,
  source_url STRING NOT NULL,
  record_title STRING NOT NULL,
  record_type STRING NOT NULL,
  created_year INT64,
  subject_start_year INT64,
  subject_end_year INT64,
  evidence_excerpt STRING,
  rights_status STRING NOT NULL,
  review_status STRING NOT NULL,
  newspaper_name STRING,
  published_date DATE,
  article_title STRING,
  historical_place_name STRING,
  event_type STRING,
  checked_date DATE,
  duplicate_status STRING,
  record_origin STRING,
  source_payload JSON NOT NULL,
  canonical_source_url STRING NOT NULL,
  ingested_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL,
  content_hash STRING NOT NULL,
  ingestion_run_id STRING NOT NULL
)
CLUSTER BY review_status, record_type, source_institution;

CREATE TABLE IF NOT EXISTS `{{project}}.{{dataset}}.places` (
  place_id STRING NOT NULL,
  place_name STRING NOT NULL,
  current_address STRING,
  district STRING,
  legal_dong STRING,
  legal_dong_code STRING,
  historical_names STRING,
  historical_period STRING,
  location_review_status STRING NOT NULL,
  notes STRING,
  source_payload JSON NOT NULL,
  updated_at TIMESTAMP NOT NULL,
  content_hash STRING NOT NULL,
  ingestion_run_id STRING NOT NULL
)
CLUSTER BY district, legal_dong, location_review_status;

CREATE TABLE IF NOT EXISTS `{{project}}.{{dataset}}.record_place_links` (
  record_id STRING NOT NULL,
  place_id STRING,
  relation_type STRING NOT NULL,
  relation_evidence STRING,
  link_review_status STRING NOT NULL,
  source_payload JSON NOT NULL,
  updated_at TIMESTAMP NOT NULL,
  content_hash STRING NOT NULL,
  ingestion_run_id STRING NOT NULL
)
CLUSTER BY link_review_status, place_id, record_id;

-- This append-only operational log is partitioned by run date for inexpensive history queries.
CREATE TABLE IF NOT EXISTS `{{project}}.{{dataset}}.ingestion_runs` (
  run_id STRING NOT NULL,
  started_at TIMESTAMP NOT NULL,
  finished_at TIMESTAMP,
  source_name STRING NOT NULL,
  attempted_count INT64 NOT NULL,
  inserted_count INT64 NOT NULL,
  updated_count INT64 NOT NULL,
  duplicate_count INT64 NOT NULL,
  rejected_count INT64 NOT NULL,
  status STRING NOT NULL,
  error_summary STRING,
  source_hash STRING,
  record_limit INT64,
  resume_cursor STRING
)
PARTITION BY DATE(started_at)
CLUSTER BY source_name, status;

-- Per-file progress supports partial failures in the three independent CSV inputs.
CREATE TABLE IF NOT EXISTS `{{project}}.{{dataset}}.ingestion_run_sources` (
  run_id STRING NOT NULL,
  source_name STRING NOT NULL,
  source_hash STRING NOT NULL,
  attempted_count INT64 NOT NULL,
  inserted_count INT64 NOT NULL,
  updated_count INT64 NOT NULL,
  duplicate_count INT64 NOT NULL,
  rejected_count INT64 NOT NULL,
  status STRING NOT NULL,
  resume_cursor STRING,
  error_summary STRING,
  updated_at TIMESTAMP NOT NULL
)
PARTITION BY DATE(updated_at)
CLUSTER BY source_name, status;
