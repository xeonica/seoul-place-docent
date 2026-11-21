CREATE TABLE `archive_place_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`place_id` text NOT NULL,
	`revision` integer NOT NULL,
	`status` text NOT NULL,
	`source_url` text NOT NULL,
	`evidence` text NOT NULL,
	`actor` text NOT NULL,
	`checked_at` text NOT NULL,
	FOREIGN KEY (`place_id`) REFERENCES `archive_places`(`place_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `archive_place_review_revision` ON `archive_place_reviews` (`place_id`,`revision`);--> statement-breakpoint
CREATE INDEX `archive_place_review_status` ON `archive_place_reviews` (`status`);
