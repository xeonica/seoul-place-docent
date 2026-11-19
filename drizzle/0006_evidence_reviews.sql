-- Additive approval ledger. Existing sources/passages/reviews remain authoritative.
CREATE TABLE IF NOT EXISTS docent_evidence_reviews (
 id TEXT PRIMARY KEY NOT NULL,
 evidence_id TEXT NOT NULL,
 record_id TEXT NOT NULL,
 passage_id TEXT NOT NULL REFERENCES archive_passages(id),
 place_key TEXT NOT NULL,
 media_type TEXT NOT NULL,
 relation_type TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('candidate','pending_review','approved','rejected','revoked')),
 revision INTEGER NOT NULL,
 content_review_key TEXT NOT NULL,
 snapshot_json TEXT NOT NULL,
 payload_json TEXT NOT NULL,
 actor TEXT NOT NULL,
 checked_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS docent_evidence_place ON docent_evidence_reviews(place_key,evidence_id,revision);

--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS docent_evidence_revision ON docent_evidence_reviews(evidence_id,revision);
