ALTER TABLE `staff` ADD `failed_login_attempts` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `staff` ADD `locked_until` timestamp;--> statement-breakpoint
ALTER TABLE `staff` ADD `totp_pending_secret` varchar(64);--> statement-breakpoint
ALTER TABLE `staff` ADD `totp_secret` varchar(64);--> statement-breakpoint
ALTER TABLE `staff` ADD `totp_enabled` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `staff` ADD `totp_backup_codes` text;