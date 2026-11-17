-- Replace `PROJECT.DATASET` with the configured project and dataset.
-- These queries report collection/verification state. They do not claim that candidates are verified history.

-- Candidate counts by Seoul district and review state.
SELECT p.district, r.record_type, r.review_status, r.rights_status, COUNT(DISTINCT r.record_id) AS records
FROM `PROJECT.DATASET.historical_records` AS r
JOIN `PROJECT.DATASET.record_place_links` AS l USING (record_id)
JOIN `PROJECT.DATASET.places` AS p USING (place_id)
GROUP BY p.district, r.record_type, r.review_status, r.rights_status
ORDER BY p.district, r.record_type, r.review_status;

-- Candidate coverage by legal dong and evidence status.
SELECT p.district, p.legal_dong, r.record_type, COUNT(DISTINCT r.record_id) AS records
FROM `PROJECT.DATASET.places` AS p
LEFT JOIN `PROJECT.DATASET.record_place_links` AS l USING (place_id)
LEFT JOIN `PROJECT.DATASET.historical_records` AS r USING (record_id)
GROUP BY p.district, p.legal_dong, r.record_type
ORDER BY p.district, p.legal_dong, r.record_type;

-- Canonical source URL duplicates should be resolved before operating on the catalog.
SELECT canonical_source_url, COUNT(*) AS records, ARRAY_AGG(record_id ORDER BY record_id LIMIT 20) AS record_ids
FROM `PROJECT.DATASET.historical_records`
GROUP BY canonical_source_url
HAVING COUNT(*) > 1
ORDER BY records DESC;

-- Recent import outcomes (the table is partitioned by started_at date).
SELECT run_id, started_at, finished_at, source_name, attempted_count, inserted_count, updated_count,
       duplicate_count, rejected_count, status, error_summary
FROM `PROJECT.DATASET.ingestion_runs`
WHERE DATE(started_at) >= DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY)
ORDER BY started_at DESC;

-- Acquisition coverage by district and legal dong, including all candidate records.
SELECT p.district, p.legal_dong, COUNT(DISTINCT r.record_id) AS candidate_records,
       COUNT(DISTINCT IF(r.review_status = 'content_checked', r.record_id, NULL)) AS content_checked,
       COUNT(DISTINCT IF(r.rights_status IN ('KOGL0','KOGL1','public_domain'), r.record_id, NULL)) AS rights_cleared
FROM `PROJECT.DATASET.places` AS p
LEFT JOIN `PROJECT.DATASET.record_place_links` AS l ON l.place_id = p.place_id
LEFT JOIN `PROJECT.DATASET.historical_records` AS r ON r.record_id = l.record_id
GROUP BY p.district, p.legal_dong
ORDER BY p.district, p.legal_dong;

-- Coverage by historical period and media type.
SELECT r.record_type, COALESCE(CAST(r.subject_start_year AS STRING), '시기 미상') AS period_start,
       COUNT(*) AS records,
       COUNTIF(r.review_status != 'content_checked') AS pending_review,
       COUNTIF(r.rights_status NOT IN ('KOGL0','KOGL1','public_domain')) AS rights_unconfirmed
FROM `PROJECT.DATASET.historical_records` AS r
GROUP BY r.record_type, period_start
ORDER BY r.record_type, period_start;

-- Individual file progress for interrupted or failed imports.
SELECT run_id, source_name, attempted_count, inserted_count, updated_count, duplicate_count,
       rejected_count, status, resume_cursor, error_summary, updated_at
FROM `PROJECT.DATASET.ingestion_run_sources`
WHERE DATE(updated_at) >= DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY)
ORDER BY updated_at DESC, source_name;
