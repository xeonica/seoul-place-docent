CREATE TEMP TABLE candidates AS
SELECT import_row_id, research_id, source_url, source_commit, source_file, source_line,
  title, media_type, review_status, rights_status,
  COALESCE(NULLIF(TRIM(JSON_VALUE(original_values, '$."자치구"')), ''),
           NULLIF(TRIM(JSON_VALUE(original_values, '$.district')), '')) AS district,
  COALESCE(NULLIF(TRIM(JSON_VALUE(original_values, '$."원문장소표기"')), ''),
           NULLIF(TRIM(JSON_VALUE(original_values, '$."관련장소"')), ''),
           NULLIF(TRIM(JSON_VALUE(original_values, '$.place_name')), ''),
           NULLIF(TRIM(JSON_VALUE(original_values, '$.historical_place_name')), '')) AS location
FROM `seoul-docent-archive.docent_ingest.github_research_staging`
WHERE row_kind = 'research_observation' AND research_id IS NOT NULL
  AND REGEXP_CONTAINS(source_url, r'^https?://');

ASSERT (
  SELECT COUNT(*) > 0 AND COUNT(*) = COUNT(DISTINCT import_row_id)
  FROM candidates
) AS 'Serving candidates must be nonempty and have unique import IDs';

ASSERT EXISTS (
  SELECT 1 FROM candidates WHERE district = '종로구'
    AND source_url = 'https://archives.seoul.go.kr/photo/collection/detail/18'
) AS 'Expected Jongno Seun Sangga source missing';

CREATE OR REPLACE TABLE `seoul-docent-archive.docent_serving.github_research_candidates`
CLUSTER BY district, research_id AS SELECT * FROM candidates;

SELECT COUNT(*) AS observations, COUNT(DISTINCT research_id) AS sources
FROM `seoul-docent-archive.docent_serving.github_research_candidates`;
