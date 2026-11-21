import {sqliteTable,text,integer,index,uniqueIndex} from 'drizzle-orm/sqlite-core';
export const archiveRegions=sqliteTable('archive_regions',{
 id:text('id').primaryKey(),parentId:text('parent_id'),name:text('name').notNull(),level:text('level').notNull(),officialCode:text('official_code'),aliases:text('aliases').notNull().default('[]'),sourceUrl:text('source_url').notNull(),sourceNote:text('source_note').notNull().default(''),asOf:text('as_of').notNull(),createdAt:text('created_at').notNull()
},t=>[index('archive_region_parent').on(t.parentId),uniqueIndex('archive_region_identity').on(t.parentId,t.name,t.level)]);
export const archiveSources=sqliteTable('archive_sources',{
 id:text('id').primaryKey(),providerId:text('provider_id'),institution:text('institution').notNull(),title:text('title').notNull(),url:text('url').notNull(),kind:text('kind').notNull(),summary:text('summary').notNull().default(''),publicationDate:text('publication_date'),subjectPeriod:text('subject_period').notNull().default(''),rights:text('rights').notNull().default('unknown'),rightsUrl:text('rights_url').notNull().default(''),rightsNote:text('rights_note').notNull().default(''),storageAllowed:integer('storage_allowed',{mode:'boolean'}).notNull().default(false),reuseAllowed:integer('reuse_allowed',{mode:'boolean'}).notNull().default(false),reviewStatus:text('review_status').notNull().default('pending'),searchText:text('search_text').notNull(),currentVersion:integer('current_version').notNull().default(1),createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull()
},t=>[uniqueIndex('archive_source_url').on(t.url),index('archive_source_review').on(t.reviewStatus),index('archive_source_kind').on(t.kind)]);
export const archiveSourceRegions=sqliteTable('archive_source_regions',{
 id:text('id').primaryKey(),sourceId:text('source_id').notNull().references(()=>archiveSources.id),regionId:text('region_id').notNull().references(()=>archiveRegions.id),relation:text('relation').notNull().default('catalog_tag')
},t=>[uniqueIndex('archive_source_region_pair').on(t.sourceId,t.regionId),index('archive_source_region_lookup').on(t.regionId)]);
export const archiveVersions=sqliteTable('archive_versions',{
 id:text('id').primaryKey(),sourceId:text('source_id').notNull().references(()=>archiveSources.id),version:integer('version').notNull(),representation:text('representation').notNull(),contentHash:text('content_hash').notNull(),payload:text('payload').notNull(),retrievedAt:text('retrieved_at').notNull(),createdAt:text('created_at').notNull(),actor:text('actor').notNull(),changeNote:text('change_note').notNull()
},t=>[uniqueIndex('archive_version_identity').on(t.sourceId,t.version)]);
export const archivePassages=sqliteTable('archive_passages',{
 id:text('id').primaryKey(),sourceId:text('source_id').notNull().references(()=>archiveSources.id),versionId:text('version_id').notNull().references(()=>archiveVersions.id),locator:text('locator').notNull(),text:text('text').notNull(),textKind:text('text_kind').notNull(),reviewStatus:text('review_status').notNull().default('pending'),createdAt:text('created_at').notNull()
},t=>[index('archive_passage_source').on(t.sourceId)]);
export const archiveFacts=sqliteTable('archive_facts',{
 id:text('id').primaryKey(),sourceId:text('source_id').notNull().references(()=>archiveSources.id),passageId:text('passage_id').notNull().references(()=>archivePassages.id),title:text('title').notNull(),description:text('description').notNull(),timeLabel:text('time_label').notNull(),startYear:integer('start_year'),endYear:integer('end_year'),scope:text('scope').notNull().default('neighborhood'),reviewStatus:text('review_status').notNull().default('pending'),createdAt:text('created_at').notNull()
},t=>[index('archive_fact_source').on(t.sourceId)]);
export const archiveAssets=sqliteTable('archive_assets',{
 id:text('id').primaryKey(),sourceId:text('source_id').notNull().references(()=>archiveSources.id),versionId:text('version_id').notNull().references(()=>archiveVersions.id),storageKey:text('storage_key').notNull(),filename:text('filename').notNull(),mimeType:text('mime_type').notNull(),size:integer('size').notNull(),sha256:text('sha256').notNull(),createdAt:text('created_at').notNull(),actor:text('actor').notNull()
},t=>[index('archive_asset_source').on(t.sourceId)]);
export const archiveAudit=sqliteTable('archive_audit',{
 id:text('id').primaryKey(),sourceId:text('source_id'),action:text('action').notNull(),actor:text('actor').notNull(),note:text('note').notNull(),createdAt:text('created_at').notNull()
});
export const archiveImports=sqliteTable('archive_imports',{
 id:text('id').primaryKey(),kind:text('kind').notNull(),sourceUrl:text('source_url').notNull(),status:text('status').notNull(),recordCount:integer('record_count').notNull(),note:text('note').notNull(),createdAt:text('created_at').notNull()
});
export const archiveCaptures=sqliteTable('archive_captures',{
 id:text('id').primaryKey(),sourceId:text('source_id').notNull().references(()=>archiveSources.id),versionId:text('version_id').notNull().references(()=>archiveVersions.id),batchId:text('batch_id').notNull(),fingerprint:text('fingerprint').notNull(),rawMetadata:text('raw_metadata').notNull(),sourceLocator:text('source_locator').notNull(),attribution:text('attribution').notNull(),rightsEvidence:text('rights_evidence').notNull(),periodLabel:text('period_label').notNull(),startYear:integer('start_year'),endYear:integer('end_year'),datePrecision:text('date_precision').notNull(),capturedAt:text('captured_at').notNull(),createdAt:text('created_at').notNull()
},t=>[uniqueIndex('archive_capture_fingerprint').on(t.sourceId,t.fingerprint),index('archive_capture_period').on(t.startYear,t.endYear)]);

// Explicit passage-level geographic cataloging; never a parcel match.
export const archivePassageRegions=sqliteTable('archive_passage_regions',{
 id:text('id').primaryKey(),passageId:text('passage_id').notNull().references(()=>archivePassages.id),regionId:text('region_id').notNull().references(()=>archiveRegions.id),label:text('label').notNull(),relation:text('relation').notNull(),basis:text('basis').notNull()
},t=>[uniqueIndex('archive_passage_region_pair').on(t.passageId,t.regionId),index('archive_passage_region_lookup').on(t.regionId)]);

// Append-only geographic verification. Address observations and official
// lifecycle snapshots are separate methods; neither identifies a historical parcel.
export const archiveRegionReviews=sqliteTable('archive_region_reviews',{
 id:text('id').primaryKey(),regionId:text('region_id').notNull().references(()=>archiveRegions.id),
 revision:integer('revision').notNull(),status:text('status').notNull(),method:text('method').notNull(),
 officialCode:text('official_code'),officialName:text('official_name'),
 evidence:text('evidence').notNull(),beforeState:text('before_state').notNull(),
 afterState:text('after_state').notNull(),actor:text('actor').notNull(),checkedAt:text('checked_at').notNull()
},t=>[uniqueIndex('archive_region_review_revision').on(t.regionId,t.revision),index('archive_region_review_status').on(t.status)]);

// Review evidence is append-only. A review never rewrites the captured text,
// source version, geographic mapping, reuse permission or historical facts.
export const archivePassageReviews=sqliteTable('archive_passage_reviews',{
 id:text('id').primaryKey(),passageId:text('passage_id').notNull().references(()=>archivePassages.id),
 versionId:text('version_id').notNull().references(()=>archiveVersions.id),sourceVersion:integer('source_version').notNull(),
 revision:integer('revision').notNull(),status:text('status').notNull(),contentHash:text('content_hash').notNull(),
 snapshotJson:text('snapshot_json').notNull(),evidence:text('evidence').notNull(),actor:text('actor').notNull(),checkedAt:text('checked_at').notNull()
},t=>[uniqueIndex('archive_passage_review_revision').on(t.passageId,t.revision),index('archive_passage_review_status').on(t.status)]);

// Editorial changes to short paraphrases retain the original passage and source
// version IDs. Both complete snapshots and the prior review remain immutable.
export const archivePassageCorrections=sqliteTable('archive_passage_corrections',{
 id:text('id').primaryKey(),passageId:text('passage_id').notNull().references(()=>archivePassages.id),
 versionId:text('version_id').notNull().references(()=>archiveVersions.id),sourceVersion:integer('source_version').notNull(),
 revision:integer('revision').notNull(),priorReviewId:text('prior_review_id').notNull().references(()=>archivePassageReviews.id),
 requestHash:text('request_hash').notNull(),beforeHash:text('before_hash').notNull(),afterHash:text('after_hash').notNull(),
 beforeSnapshot:text('before_snapshot').notNull(),afterSnapshot:text('after_snapshot').notNull(),
 reason:text('reason').notNull(),evidence:text('evidence').notNull(),actor:text('actor').notNull(),createdAt:text('created_at').notNull()
},t=>[uniqueIndex('archive_passage_correction_revision').on(t.passageId,t.revision)]);
