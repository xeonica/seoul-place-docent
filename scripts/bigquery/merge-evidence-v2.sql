-- __RUN_TABLE__ is replaced only with the numeric GitHub run ID + attempt.
-- Preserve every observed version, idempotently. No UPDATE or DELETE branch.
ASSERT (SELECT COUNT(*)=COUNT(DISTINCT import_row_id) AND COUNT(*)>0 FROM `seoul-docent-archive.docent_ingest.__RUN_TABLE__`) AS 'Unique nonempty import required';
MERGE `seoul-docent-archive.docent_ingest.evidence_snapshots_v2` t
USING `seoul-docent-archive.docent_ingest.__RUN_TABLE__` s
ON t.import_row_id=s.import_row_id AND t.source_commit=s.source_commit
WHEN NOT MATCHED THEN INSERT (import_row_id, source_commit, source_file, source_file_sha256, source_line, row_kind, research_id, original_record_id, place_id, source_url, title, media_type, review_status, rights_status, usable_as_verified_evidence, original_values, ingested_at)
VALUES (s.import_row_id, s.source_commit, s.source_file, s.source_file_sha256, s.source_line, s.row_kind, s.research_id, s.original_record_id, s.place_id, s.source_url, s.title, s.media_type, s.review_status, s.rights_status, s.usable_as_verified_evidence, s.original_values, CURRENT_TIMESTAMP());
