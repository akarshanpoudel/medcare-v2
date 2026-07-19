CREATE TABLE `appointments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`reference` varchar(12) NOT NULL,
	`patient_id` int NOT NULL,
	`patient_name` varchar(255) NOT NULL,
	`patient_phone` varchar(20) NOT NULL,
	`patient_email` varchar(255),
	`doctor` varchar(255) NOT NULL,
	`department` varchar(255) NOT NULL,
	`appointment_date` date NOT NULL,
	`appointment_time` time NOT NULL,
	`notes` text,
	`status` enum('pending','confirmed','rejected','cancelled') NOT NULL DEFAULT 'pending',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `appointments_id` PRIMARY KEY(`id`),
	CONSTRAINT `appointments_reference_idx` UNIQUE(`reference`)
);
--> statement-breakpoint
CREATE TABLE `patients` (
	`id` int AUTO_INCREMENT NOT NULL,
	`full_name` varchar(255) NOT NULL,
	`phone` varchar(20) NOT NULL,
	`email` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `patients_id` PRIMARY KEY(`id`),
	CONSTRAINT `patients_phone_idx` UNIQUE(`phone`)
);
--> statement-breakpoint
CREATE TABLE `staff` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(255) NOT NULL,
	`password_hash` varchar(255) NOT NULL,
	`name` varchar(255) NOT NULL DEFAULT 'Staff',
	`role` enum('admin') NOT NULL DEFAULT 'admin',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `staff_id` PRIMARY KEY(`id`),
	CONSTRAINT `staff_email_idx` UNIQUE(`email`)
);
--> statement-breakpoint
ALTER TABLE `appointments` ADD CONSTRAINT `appointments_patient_id_patients_id_fk` FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `appointments_slot_idx` ON `appointments` (`doctor`,`appointment_date`,`appointment_time`);--> statement-breakpoint
CREATE INDEX `appointments_patient_idx` ON `appointments` (`patient_id`);--> statement-breakpoint
CREATE INDEX `appointments_status_idx` ON `appointments` (`status`);--> statement-breakpoint
CREATE INDEX `appointments_date_idx` ON `appointments` (`appointment_date`);