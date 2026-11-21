CREATE TABLE `archive_places` (
	`id` text PRIMARY KEY NOT NULL,
	`place_id` text NOT NULL,
	`place_type` text NOT NULL,
	`name` text NOT NULL,
	`road_address` text DEFAULT '' NOT NULL,
	`jibun_address` text DEFAULT '' NOT NULL,
	`district` text DEFAULT '' NOT NULL,
	`legal_dong` text DEFAULT '' NOT NULL,
	`building_management_number` text,
	`pnu` text,
	`latitude` real,
	`longitude` real,
	`coordinate_source` text DEFAULT '' NOT NULL,
	`identity_source_url` text DEFAULT '' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `archive_place_place_id` ON `archive_places` (`place_id`);--> statement-breakpoint
CREATE INDEX `archive_place_bmgt` ON `archive_places` (`building_management_number`);--> statement-breakpoint
CREATE INDEX `archive_place_pnu` ON `archive_places` (`pnu`);--> statement-breakpoint
CREATE INDEX `archive_place_district_dong` ON `archive_places` (`district`,`legal_dong`);--> statement-breakpoint
CREATE TABLE `archive_source_places` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`place_id` text NOT NULL,
	`relation` text NOT NULL,
	`match_method` text NOT NULL,
	`distance_meters` real,
	`evidence_id` text DEFAULT '' NOT NULL,
	`evidence` text NOT NULL,
	`source_url` text NOT NULL,
	`source_institution` text NOT NULL,
	`original_checked` integer DEFAULT false NOT NULL,
	`rights_status` text DEFAULT 'unknown' NOT NULL,
	`review_status` text DEFAULT 'pending' NOT NULL,
	`review_evidence` text DEFAULT '' NOT NULL,
	`actor` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `archive_sources`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`place_id`) REFERENCES `archive_places`(`place_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `archive_source_place_source` ON `archive_source_places` (`source_id`);--> statement-breakpoint
CREATE INDEX `archive_source_place_place` ON `archive_source_places` (`place_id`);--> statement-breakpoint
CREATE INDEX `archive_source_place_relation_status` ON `archive_source_places` (`relation`,`review_status`);
