ALTER TABLE "organizations" ADD COLUMN "share_anonymized_stats" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "tools" ADD COLUMN "embedding" text;