-- Run before merge-evidence-v2.sql. Additive, no replacement of legacy assets.
CREATE TABLE IF NOT EXISTS `seoul-docent-archive.docent_ingest.evidence_snapshots_v2` (
 import_row_id STRING, source_commit STRING, source_file STRING, source_file_sha256 STRING,
 source_line INT64, row_kind STRING, research_id STRING, original_record_id STRING,
 place_id STRING, source_url STRING, title STRING, media_type STRING, review_status STRING,
 rights_status STRING, usable_as_verified_evidence BOOL, original_values JSON, ingested_at TIMESTAMP
) PARTITION BY DATE(ingested_at) CLUSTER BY research_id, source_commit;

CREATE TABLE IF NOT EXISTS `seoul-docent-archive.docent_serving.places_v2` (
 place_id STRING, building_management_number STRING, pnu STRING, road_address STRING,
 jibun_address STRING, place_name STRING, district STRING, legal_dong STRING,
 administrative_dong STRING, latitude FLOAT64, longitude FLOAT64, revision INT64,
 relation_evidence_id STRING, reviewer_id STRING, reviewed_at TIMESTAMP, source_snapshot STRING
) CLUSTER BY district, legal_dong, building_management_number, pnu;

CREATE TABLE IF NOT EXISTS `seoul-docent-archive.docent_serving.place_alias_reviews_v2` (
 alias_id STRING, place_id STRING, alias_name STRING, valid_from STRING, valid_to STRING,
 evidence_id STRING, verification_status STRING, revision INT64, reviewed_at TIMESTAMP, reviewer_id STRING, source_snapshot STRING
) CLUSTER BY place_id;

CREATE TABLE IF NOT EXISTS `seoul-docent-archive.docent_serving.record_place_reviews_v2` (
 link_id STRING, record_id STRING, place_id STRING, relation_type STRING, relation_basis STRING,
 relation_evidence_id STRING, link_review_status STRING, revision INT64, reviewed_at TIMESTAMP, reviewer_id STRING, source_snapshot STRING
) CLUSTER BY place_id, record_id;

-- New version only. A v2 BQ approval string is NOT sufficient authorization for
-- an MCP claim. Current D1 source/passages + rights + append-only audit are checked
-- on every request, including revocations, independently of these candidate views.
CREATE VIEW IF NOT EXISTS `seoul-docent-archive.docent_serving.place_evidence_candidates_v2` AS
WITH current_records AS (
 SELECT * FROM `seoul-docent-archive.docent_ingest.evidence_snapshots_v2`
 WHERE row_kind IN ('research_observation','document_sources')
 QUALIFY ROW_NUMBER() OVER(PARTITION BY source_file,COALESCE(original_record_id,CONCAT(COALESCE(research_id,''),':',CAST(source_line AS STRING))) ORDER BY ingested_at DESC,source_commit DESC)=1
), places AS (
 SELECT * FROM `seoul-docent-archive.docent_serving.places_v2`
 QUALIFY ROW_NUMBER() OVER(PARTITION BY place_id ORDER BY revision DESC)=1
), links AS (
 SELECT * FROM `seoul-docent-archive.docent_serving.record_place_reviews_v2`
 QUALIFY ROW_NUMBER() OVER(PARTITION BY link_id ORDER BY revision DESC)=1
), aliases AS (
 SELECT * FROM `seoul-docent-archive.docent_serving.place_alias_reviews_v2`
 QUALIFY ROW_NUMBER() OVER(PARTITION BY alias_id ORDER BY revision DESC)=1
)
SELECT r.research_id AS record_id,r.original_record_id,r.import_row_id,r.title AS record_title,
 r.media_type,JSON_VALUE(r.original_values,'$.historical_period') AS historical_period_raw,
 COALESCE(JSON_VALUE(r.original_values,'$.source_institution'),JSON_VALUE(r.original_values,'$."신문사"')) AS source_institution,
 r.source_url,r.source_file,r.source_line,r.source_commit,
 COALESCE(l.relation_type,'uncertain') AS relation_type,
 COALESCE(l.link_review_status,'candidate') AS link_review_status,
 r.review_status,r.rights_status,FALSE AS usable_as_verified_evidence,
 p.place_id,p.building_management_number,p.pnu,p.road_address,p.jibun_address,p.place_name,
 COALESCE(p.district,JSON_VALUE(r.original_values,'$.district'),JSON_VALUE(r.original_values,'$."자치구"')) AS district,
 COALESCE(p.legal_dong,JSON_VALUE(r.original_values,'$.legal_dong')) AS legal_dong,
 p.administrative_dong,p.latitude,p.longitude,a.alias_name,
 a.verification_status='approved' AND a.evidence_id IS NOT NULL AND a.reviewer_id IS NOT NULL AS alias_verified,
 a.valid_from AS alias_valid_from,a.valid_to AS alias_valid_to,
 JSON_VALUE(r.original_values,'$."신문 발행일"') AS published_at,
 JSON_VALUE(r.original_values,'$.event_date') AS event_date,
 CASE WHEN l.place_id IS NULL THEN 'place_link_missing' ELSE 'd1_approval_required' END AS missing_reason
FROM current_records r LEFT JOIN links l ON (l.record_id=r.research_id OR l.record_id=r.original_record_id)
 LEFT JOIN places p ON p.place_id=COALESCE(l.place_id,r.place_id)
 LEFT JOIN aliases a ON a.place_id=p.place_id;
