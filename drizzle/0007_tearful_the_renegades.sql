CREATE TABLE `archive_source_place_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`link_id` text NOT NULL,
	`revision` integer NOT NULL,
	`status` text NOT NULL,
	`relation` text NOT NULL,
	`original_checked` integer NOT NULL,
	`rights_status` text NOT NULL,
	`evidence` text NOT NULL,
	`actor` text NOT NULL,
	`checked_at` text NOT NULL,
	FOREIGN KEY (`link_id`) REFERENCES `archive_source_places`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `archive_source_place_review_revision` ON `archive_source_place_reviews` (`link_id`,`revision`);--> statement-breakpoint
CREATE INDEX `archive_source_place_review_status` ON `archive_source_place_reviews` (`status`);