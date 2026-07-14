CREATE TABLE `customers` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text,
  `email` text,
  `phone` text,
  `preferences` text DEFAULT '[]' NOT NULL,
  `summary` text,
  `last_service` text,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `conversations` (
  `id` text PRIMARY KEY NOT NULL,
  `customer_id` text NOT NULL,
  `status` text DEFAULT 'open' NOT NULL,
  `handoff_reason` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `messages` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `conversation_id` text NOT NULL,
  `role` text NOT NULL,
  `content` text NOT NULL,
  `metadata` text,
  `created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `messages_conversation_idx` ON `messages` (`conversation_id`);
