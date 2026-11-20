-- Candidate geographic metadata only. Importing does not approve claims, aliases
-- or rights. Every imported version remains accessible in evidence_snapshots_v2.
MERGE `seoul-docent-archive.docent_serving.places_v2` t
USING (
 SELECT place_id,import_row_id AS source_snapshot,JSON_VALUE(original_values,'$.place_name') AS place_name,
 JSON_VALUE(original_values,'$.building_management_number') AS building_management_number,
 JSON_VALUE(original_values,'$.pnu') AS pnu,
 JSON_VALUE(original_values,'$.road_address') AS road_address,
 JSON_VALUE(original_values,'$.jibun_address') AS jibun_address,
 JSON_VALUE(original_values,'$.district') AS district,
 JSON_VALUE(original_values,'$.legal_dong') AS legal_dong,
 JSON_VALUE(original_values,'$.administrative_dong') AS administrative_dong,
 UNIX_MICROS(ingested_at) AS revision
 FROM `seoul-docent-archive.docent_ingest.evidence_snapshots_v2`
 WHERE row_kind='place' AND place_id IS NOT NULL
 QUALIFY ROW_NUMBER() OVER(PARTITION BY place_id,import_row_id ORDER BY ingested_at)=1
) s ON t.place_id=s.place_id AND t.source_snapshot=s.source_snapshot
WHEN NOT MATCHED THEN INSERT(place_id,place_name,building_management_number,pnu,road_address,jibun_address,district,legal_dong,administrative_dong,revision,source_snapshot)
VALUES(s.place_id,s.place_name,s.building_management_number,s.pnu,s.road_address,s.jibun_address,s.district,s.legal_dong,s.administrative_dong,s.revision,s.source_snapshot);

MERGE `seoul-docent-archive.docent_serving.record_place_reviews_v2` t
USING (
 SELECT TO_HEX(SHA256(CONCAT(JSON_VALUE(original_values,'$.record_id'),':',place_id))) AS link_id,
 import_row_id AS source_snapshot,JSON_VALUE(original_values,'$.record_id') AS record_id,place_id,
 CASE LOWER(JSON_VALUE(original_values,'$.relation_type')) WHEN 'exact_site' THEN 'historical_site'
 ELSE COALESCE(LOWER(JSON_VALUE(original_values,'$.relation_type')),'uncertain') END AS relation_type,
 JSON_VALUE(original_values,'$.relation_evidence') AS relation_basis,
 UNIX_MICROS(ingested_at) AS revision
 FROM `seoul-docent-archive.docent_ingest.evidence_snapshots_v2`
 WHERE row_kind='place_link' AND place_id IS NOT NULL AND JSON_VALUE(original_values,'$.record_id') IS NOT NULL
 QUALIFY ROW_NUMBER() OVER(PARTITION BY import_row_id ORDER BY ingested_at)=1
) s ON t.link_id=s.link_id AND t.source_snapshot=s.source_snapshot
WHEN NOT MATCHED THEN INSERT(link_id,record_id,place_id,relation_type,relation_basis,link_review_status,revision,source_snapshot)
VALUES(s.link_id,s.record_id,s.place_id,s.relation_type,s.relation_basis,'candidate',s.revision,s.source_snapshot);

-- Historical names are kept in raw snapshots. Only a separate audited review
-- may add an approved alias with validity dates and a supporting evidence ID.
