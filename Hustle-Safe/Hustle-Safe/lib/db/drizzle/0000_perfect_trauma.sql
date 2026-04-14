CREATE TABLE "workers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"platform" text NOT NULL,
	"zone_id" text NOT NULL,
	"upi_id" text,
	"platform_rating" numeric(2, 1) DEFAULT '4.5' NOT NULL,
	"policy_tier" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"fraud_score" numeric(3, 2) DEFAULT '0.0' NOT NULL,
	"account_age_days" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workers_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "zones" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"city" text NOT NULL,
	"lat" numeric(9, 6),
	"lng" numeric(9, 6),
	"gds_score" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'normal' NOT NULL,
	"active_workers" integer DEFAULT 0 NOT NULL,
	"rainfall_mm" numeric(6, 2) DEFAULT '0' NOT NULL,
	"traffic_score" numeric(3, 1) DEFAULT '0' NOT NULL,
	"aqi" integer DEFAULT 50 NOT NULL,
	"demand_drop_pct" integer DEFAULT 0 NOT NULL,
	"govt_alert" boolean DEFAULT false NOT NULL,
	"last_updated" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"worker_id" uuid NOT NULL,
	"tier" text NOT NULL,
	"weekly_premium" numeric(8, 2) NOT NULL,
	"coverage_cap" numeric(10, 2) NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"activated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"zone_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"worker_id" uuid NOT NULL,
	"policy_id" uuid,
	"zone_id" text,
	"disruption_type" text,
	"disruption_start" timestamp with time zone,
	"disruption_end" timestamp with time zone,
	"hours_affected" numeric(4, 2),
	"hourly_rate" numeric(8, 2) DEFAULT '90' NOT NULL,
	"payout_amount" numeric(10, 2),
	"fraud_score" numeric(3, 2) DEFAULT '0.0' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"fraud_signals" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"resolution_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "disruption_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"zone_id" text,
	"event_type" text NOT NULL,
	"gds_target" integer,
	"duration_minutes" integer,
	"triggered_by" text DEFAULT 'simulator' NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "premium_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"worker_id" uuid NOT NULL,
	"week_start" date,
	"premium_amount" numeric(8, 2),
	"zone_risk_adjustment" numeric(8, 2),
	"worker_risk_adjustment" numeric(8, 2),
	"explanation" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallet_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet_id" uuid NOT NULL,
	"type" text NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"reference_type" text NOT NULL,
	"reference_id" text,
	"status" text DEFAULT 'completed' NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"worker_id" uuid NOT NULL,
	"balance" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallets_worker_id_unique" UNIQUE("worker_id")
);
--> statement-breakpoint
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_worker_id_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE cascade ON UPDATE no action;