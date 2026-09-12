-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "UserAuthProvider" AS ENUM ('LOCAL', 'GOOGLE', 'GITHUB', 'MAGIC_LINK');

-- CreateEnum
CREATE TYPE "WorkspacePurpose" AS ENUM ('PERSONAL', 'WORK', 'CLIENT', 'AGENT');

-- CreateEnum
CREATE TYPE "OperatingMode" AS ENUM ('MANUAL', 'HYBRID', 'AUTONOMOUS');

-- CreateEnum
CREATE TYPE "WorkspaceRole" AS ENUM ('OWNER', 'ADMIN', 'EDITOR', 'VIEWER', 'EXTERNAL_APPROVER');

-- CreateEnum
CREATE TYPE "SocialPlatform" AS ENUM ('LINKEDIN', 'X', 'INSTAGRAM', 'TIKTOK', 'YOUTUBE', 'THREADS', 'FACEBOOK', 'PINTEREST', 'BLUESKY', 'TELEGRAM', 'DISCORD');

-- CreateEnum
CREATE TYPE "SocialAccountStatus" AS ENUM ('PENDING_AUTH', 'CONNECTED', 'REFRESH_REQUIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('DRAFT', 'READY', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ContentVariantStatus" AS ENUM ('DRAFT', 'READY', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PublicationStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'READY', 'PROCESSING', 'PUBLISHED', 'FAILED', 'UNKNOWN_EXTERNAL_STATE', 'CANCELLED', 'REQUIRES_APPROVAL');

-- CreateEnum
CREATE TYPE "PublishAttemptStatus" AS ENUM ('RESERVED', 'DISPATCHING', 'PLATFORM_PENDING', 'SUCCEEDED', 'UNKNOWN_EXTERNAL_STATE', 'FAILED_PERMANENT');

-- CreateEnum
CREATE TYPE "OutboxCommandStatus" AS ENUM ('PENDING', 'PROCESSING', 'PUBLISHED', 'FAILED');

-- CreateEnum
CREATE TYPE "ApprovalResourceType" AS ENUM ('PUBLICATION', 'MISSION', 'CAMPAIGN');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('IMAGE', 'VIDEO', 'DOCUMENT', 'AUDIO');

-- CreateEnum
CREATE TYPE "MediaProcessingState" AS ENUM ('REGISTERED', 'UPLOADING', 'UPLOADED', 'VALIDATING', 'PROCESSING', 'READY', 'FAILED_RETRYABLE', 'FAILED_PERMANENT', 'EXPIRED', 'DELETED');

-- CreateEnum
CREATE TYPE "MediaSource" AS ENUM ('USER_UPLOAD', 'IMPORT', 'SOCIAL_PLATFORM', 'AI_GENERATED', 'TRANSFORMED', 'EXTERNAL_REFERENCE');

-- CreateEnum
CREATE TYPE "MissionStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "GoalStatus" AS ENUM ('IN_PROGRESS', 'ACHIEVED', 'MISSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StrategyStatus" AS ENUM ('ACTIVE', 'SUPERSEDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "HypothesisStatus" AS ENUM ('PROPOSED', 'TESTING', 'SUPPORTED', 'REFUTED', 'INCONCLUSIVE');

-- CreateEnum
CREATE TYPE "ExperimentStatus" AS ENUM ('PLANNED', 'RUNNING', 'CONCLUDED', 'ABORTED');

-- CreateEnum
CREATE TYPE "VariantRole" AS ENUM ('CONTROL', 'TREATMENT');

-- CreateEnum
CREATE TYPE "ObservationWindow" AS ENUM ('TWO_HOURS', 'SIX_HOURS', 'TWELVE_HOURS', 'TWENTY_FOUR_HOURS', 'FORTY_EIGHT_HOURS', 'SEVEN_DAYS');

-- CreateEnum
CREATE TYPE "MetricStatus" AS ENUM ('AVAILABLE', 'PERMISSION_DENIED', 'NOT_SUPPORTED', 'TEMPORARILY_UNAVAILABLE', 'ERROR');

-- CreateEnum
CREATE TYPE "InsightClassification" AS ENUM ('CORRELATED', 'CAUSAL');

-- CreateEnum
CREATE TYPE "InsightStatus" AS ENUM ('ACTIVE', 'SUPERSEDED', 'INVALIDATED');

-- CreateEnum
CREATE TYPE "DecisionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXECUTED');

-- CreateEnum
CREATE TYPE "AgentTaskStatus" AS ENUM ('PENDING', 'PLANNING', 'WAITING_APPROVAL', 'EXECUTING', 'SUCCEEDED', 'FAILED_PERMANENT', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SkillExecutionStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "MemoryTier" AS ENUM ('WORKING', 'EPHEMERAL', 'EPISODIC', 'SEMANTIC', 'PROCEDURAL', 'EVALUATIVE');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatar_url" TEXT,
    "auth_provider" "UserAuthProvider" NOT NULL DEFAULT 'LOCAL',
    "password_hash" TEXT,
    "magic_link_token_hash" VARCHAR(64),
    "magic_link_expires_at" TIMESTAMPTZ(6),
    "email_verified_at" TIMESTAMPTZ(6),
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspaces" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "purpose" "WorkspacePurpose" NOT NULL DEFAULT 'WORK',
    "default_operating_mode" "OperatingMode" NOT NULL DEFAULT 'MANUAL',
    "owner_user_id" UUID NOT NULL,
    "country" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "requires_approval" BOOLEAN NOT NULL DEFAULT false,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_members" (
    "workspace_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "workspace_role" "WorkspaceRole" NOT NULL,
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_members_pkey" PRIMARY KEY ("workspace_id","user_id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "key_hash" VARCHAR(64) NOT NULL,
    "key_prefix" VARCHAR(20) NOT NULL,
    "scopes" JSONB NOT NULL DEFAULT '[]',
    "last_used_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "platform" "SocialPlatform" NOT NULL,
    "external_account_id" VARCHAR(255) NOT NULL,
    "account_name" VARCHAR(255) NOT NULL,
    "status" "SocialAccountStatus" NOT NULL DEFAULT 'PENDING_AUTH',
    "capabilities" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "social_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "secret_envelopes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "social_account_id" UUID NOT NULL,
    "envelope_data" BYTEA NOT NULL,
    "key_id" VARCHAR(100) NOT NULL,
    "algorithm" VARCHAR(50) NOT NULL DEFAULT 'AES-256-GCM',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "secret_envelopes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "title" VARCHAR(255),
    "body" TEXT,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "contents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_variants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "content_id" UUID NOT NULL,
    "platform" "SocialPlatform",
    "social_account_id" UUID,
    "body" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "status" "ContentVariantStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "publications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "content_variant_id" UUID NOT NULL,
    "social_account_id" UUID NOT NULL,
    "status" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduled_at" TIMESTAMPTZ(6),
    "timezone" VARCHAR(50) NOT NULL DEFAULT 'UTC',
    "published_at" TIMESTAMPTZ(6),
    "external_post_id" VARCHAR(255),
    "external_post_url" TEXT,
    "idempotency_key" VARCHAR(255) NOT NULL,
    "fingerprint" CHAR(64) NOT NULL,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "publications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "publish_attempts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "publication_id" UUID NOT NULL,
    "attempt_number" INTEGER NOT NULL DEFAULT 1,
    "status" "PublishAttemptStatus" NOT NULL DEFAULT 'RESERVED',
    "idempotency_key" VARCHAR(255) NOT NULL,
    "fingerprint" CHAR(64) NOT NULL,
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "external_id" VARCHAR(255),
    "external_url" TEXT,
    "error_code" VARCHAR(100),
    "error_category" VARCHAR(50),
    "error_message" TEXT,
    "retryable" BOOLEAN NOT NULL DEFAULT false,
    "retry_after" TIMESTAMPTZ(6),
    "response_metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "publish_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_commands" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "publication_id" UUID NOT NULL,
    "publish_attempt_id" UUID NOT NULL,
    "command_type" VARCHAR(100) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxCommandStatus" NOT NULL DEFAULT 'PENDING',
    "available_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimed_at" TIMESTAMPTZ(6),
    "processed_at" TIMESTAMPTZ(6),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" JSONB DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_commands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approvals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "resource_type" "ApprovalResourceType" NOT NULL,
    "resource_id" UUID NOT NULL,
    "resource_version" INTEGER NOT NULL DEFAULT 1,
    "requested_by_user_id" UUID,
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "decided_by_user_id" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "decision_note" TEXT,
    "required_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "approval_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "nonce" VARCHAR(64) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_assets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "type" "MediaType" NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "file_size_bytes" BIGINT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "duration_seconds" DOUBLE PRECISION,
    "storage_key" VARCHAR(500) NOT NULL,
    "processing_state" "MediaProcessingState" NOT NULL DEFAULT 'REGISTERED',
    "source" "MediaSource" NOT NULL DEFAULT 'USER_UPLOAD',
    "checksum_sha256" CHAR(64),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "missions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "status" "MissionStatus" NOT NULL DEFAULT 'DRAFT',
    "starts_at" TIMESTAMPTZ(6),
    "ends_at" TIMESTAMPTZ(6),
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "missions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "mission_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "metric_key" VARCHAR(100) NOT NULL,
    "baseline_value" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "target_value" DECIMAL(14,4) NOT NULL,
    "current_value" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "unit" VARCHAR(50) NOT NULL DEFAULT 'COUNT',
    "starts_at" TIMESTAMPTZ(6),
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "status" "GoalStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strategies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "mission_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT NOT NULL,
    "target_audience" JSONB NOT NULL DEFAULT '{}',
    "content_pillars" JSONB NOT NULL DEFAULT '[]',
    "tone_profile" JSONB NOT NULL DEFAULT '{}',
    "status" "StrategyStatus" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" VARCHAR(50) NOT NULL DEFAULT 'HUMAN',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "strategies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "growth_hypotheses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "mission_id" UUID NOT NULL,
    "strategy_id" UUID NOT NULL,
    "key" VARCHAR(50) NOT NULL,
    "statement" TEXT NOT NULL,
    "rationale" TEXT,
    "expected_outcome" TEXT,
    "success_metric_key" VARCHAR(100),
    "expected_effect" DECIMAL(8,4),
    "status" "HypothesisStatus" NOT NULL DEFAULT 'PROPOSED',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "growth_hypotheses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "experiments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "mission_id" UUID NOT NULL,
    "hypothesis_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "design" JSONB NOT NULL DEFAULT '{}',
    "status" "ExperimentStatus" NOT NULL DEFAULT 'PLANNED',
    "started_at" TIMESTAMPTZ(6),
    "ended_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "experiments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "experiment_content_variants" (
    "experiment_id" UUID NOT NULL,
    "content_variant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "variant_role" "VariantRole" NOT NULL,
    "cohort_tag" VARCHAR(50),
    "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "experiment_content_variants_pkey" PRIMARY KEY ("experiment_id","content_variant_id")
);

-- CreateTable
CREATE TABLE "analytics_snapshots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "social_account_id" UUID,
    "publication_id" UUID,
    "captured_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "observation_window" "ObservationWindow" NOT NULL,
    "source" VARCHAR(100) NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'COMPLETE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_metrics" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "snapshot_id" UUID NOT NULL,
    "metric_key" VARCHAR(100) NOT NULL,
    "value_numeric" DECIMAL(18,4),
    "value_text" TEXT,
    "status" "MetricStatus" NOT NULL DEFAULT 'AVAILABLE',
    "source_metric" VARCHAR(100),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "mission_id" UUID,
    "experiment_id" UUID,
    "publication_id" UUID,
    "metric_snapshot_id" UUID,
    "evidence_type" VARCHAR(50) NOT NULL,
    "value" JSONB NOT NULL,
    "captured_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" VARCHAR(100) NOT NULL,
    "confidence" DECIMAL(5,4) NOT NULL DEFAULT 1.0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidence_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insights" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "mission_id" UUID,
    "experiment_id" UUID,
    "title" VARCHAR(255) NOT NULL,
    "statement" TEXT NOT NULL,
    "evidence_summary" TEXT NOT NULL,
    "confidence" DECIMAL(5,4) NOT NULL,
    "classification" "InsightClassification" NOT NULL DEFAULT 'CORRELATED',
    "status" "InsightStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "insights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "decisions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "mission_id" UUID,
    "insight_id" UUID,
    "decision_type" VARCHAR(100) NOT NULL,
    "decision" JSONB NOT NULL,
    "rationale" TEXT NOT NULL,
    "confidence" DECIMAL(5,4) NOT NULL,
    "requires_approval" BOOLEAN NOT NULL DEFAULT false,
    "approval_id" UUID,
    "status" "DecisionStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "executed_at" TIMESTAMPTZ(6),

    CONSTRAINT "decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "mission_id" UUID,
    "tier" "MemoryTier" NOT NULL DEFAULT 'EPISODIC',
    "category" VARCHAR(50) NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" vector(1536),
    "source_type" VARCHAR(50) NOT NULL,
    "source_id" UUID,
    "confidence" DECIMAL(5,4) NOT NULL DEFAULT 1.0,
    "importance" DECIMAL(5,4) DEFAULT 0.5,
    "valid_from" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "valid_until" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_tasks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "mission_id" UUID,
    "task_type" VARCHAR(100) NOT NULL,
    "parameters" JSONB NOT NULL DEFAULT '{}',
    "status" "AgentTaskStatus" NOT NULL DEFAULT 'PENDING',
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "error_details" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skill_executions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "agent_task_id" UUID NOT NULL,
    "skill_name" VARCHAR(100) NOT NULL,
    "version" VARCHAR(50) NOT NULL,
    "status" "SkillExecutionStatus" NOT NULL DEFAULT 'PENDING',
    "input_ref" JSONB NOT NULL,
    "output_ref" JSONB,
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "error_details" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "skill_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "skill_execution_id" UUID NOT NULL,
    "provider" VARCHAR(50) NOT NULL,
    "model_id" VARCHAR(100) NOT NULL,
    "prompt_tokens" INTEGER NOT NULL DEFAULT 0,
    "completion_tokens" INTEGER NOT NULL DEFAULT 0,
    "cost_usd" DECIMAL(10,6) NOT NULL DEFAULT 0,
    "latency_ms" INTEGER NOT NULL,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_magic_link_token_hash_idx" ON "users"("magic_link_token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_slug_key" ON "workspaces"("slug");

-- CreateIndex
CREATE INDEX "workspaces_slug_idx" ON "workspaces"("slug");

-- CreateIndex
CREATE INDEX "workspace_members_user_id_idx" ON "workspace_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_key_hash_key" ON "api_keys"("key_hash");

-- CreateIndex
CREATE INDEX "api_keys_workspace_id_idx" ON "api_keys"("workspace_id");

-- CreateIndex
CREATE INDEX "api_keys_key_hash_idx" ON "api_keys"("key_hash");

-- CreateIndex
CREATE INDEX "social_accounts_workspace_id_status_idx" ON "social_accounts"("workspace_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "social_accounts_workspace_id_platform_external_account_id_key" ON "social_accounts"("workspace_id", "platform", "external_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "secret_envelopes_social_account_id_key" ON "secret_envelopes"("social_account_id");

-- CreateIndex
CREATE INDEX "contents_workspace_id_created_at_idx" ON "contents"("workspace_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "content_variants_content_id_idx" ON "content_variants"("content_id");

-- CreateIndex
CREATE INDEX "content_variants_workspace_id_created_at_idx" ON "content_variants"("workspace_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "publications_idempotency_key_key" ON "publications"("idempotency_key");

-- CreateIndex
CREATE INDEX "publications_workspace_id_scheduled_at_idx" ON "publications"("workspace_id", "scheduled_at");

-- CreateIndex
CREATE INDEX "publications_social_account_id_scheduled_at_idx" ON "publications"("social_account_id", "scheduled_at");

-- CreateIndex
CREATE INDEX "publications_workspace_id_status_idx" ON "publications"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "publish_attempts_publication_id_attempt_number_idx" ON "publish_attempts"("publication_id", "attempt_number");

-- CreateIndex
CREATE UNIQUE INDEX "publish_attempts_publication_id_attempt_number_key" ON "publish_attempts"("publication_id", "attempt_number");

-- CreateIndex
CREATE INDEX "outbox_commands_status_available_at_idx" ON "outbox_commands"("status", "available_at");

-- CreateIndex
CREATE INDEX "approvals_workspace_id_status_idx" ON "approvals"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "approvals_resource_type_resource_id_idx" ON "approvals"("resource_type", "resource_id");

-- CreateIndex
CREATE UNIQUE INDEX "approval_tokens_token_hash_key" ON "approval_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "approval_tokens_expires_at_idx" ON "approval_tokens"("expires_at");

-- CreateIndex
CREATE INDEX "media_assets_workspace_id_created_at_idx" ON "media_assets"("workspace_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "media_assets_storage_key_idx" ON "media_assets"("storage_key");

-- CreateIndex
CREATE INDEX "missions_workspace_id_status_idx" ON "missions"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "missions_workspace_id_ends_at_idx" ON "missions"("workspace_id", "ends_at");

-- CreateIndex
CREATE INDEX "goals_mission_id_idx" ON "goals"("mission_id");

-- CreateIndex
CREATE INDEX "goals_workspace_id_status_idx" ON "goals"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "strategies_mission_id_version_idx" ON "strategies"("mission_id", "version" DESC);

-- CreateIndex
CREATE INDEX "strategies_workspace_id_status_idx" ON "strategies"("workspace_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "strategies_mission_id_version_key" ON "strategies"("mission_id", "version");

-- CreateIndex
CREATE INDEX "growth_hypotheses_mission_id_status_idx" ON "growth_hypotheses"("mission_id", "status");

-- CreateIndex
CREATE INDEX "growth_hypotheses_strategy_id_idx" ON "growth_hypotheses"("strategy_id");

-- CreateIndex
CREATE UNIQUE INDEX "growth_hypotheses_mission_id_key_key" ON "growth_hypotheses"("mission_id", "key");

-- CreateIndex
CREATE INDEX "experiments_mission_id_status_idx" ON "experiments"("mission_id", "status");

-- CreateIndex
CREATE INDEX "experiments_hypothesis_id_idx" ON "experiments"("hypothesis_id");

-- CreateIndex
CREATE INDEX "experiments_started_at_idx" ON "experiments"("started_at" DESC);

-- CreateIndex
CREATE INDEX "analytics_snapshots_workspace_id_captured_at_idx" ON "analytics_snapshots"("workspace_id", "captured_at" DESC);

-- CreateIndex
CREATE INDEX "analytics_snapshots_publication_id_captured_at_idx" ON "analytics_snapshots"("publication_id", "captured_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "analytics_snapshots_publication_id_observation_window_key" ON "analytics_snapshots"("publication_id", "observation_window");

-- CreateIndex
CREATE UNIQUE INDEX "analytics_metrics_snapshot_id_metric_key_key" ON "analytics_metrics"("snapshot_id", "metric_key");

-- CreateIndex
CREATE INDEX "evidence_records_workspace_id_captured_at_idx" ON "evidence_records"("workspace_id", "captured_at" DESC);

-- CreateIndex
CREATE INDEX "evidence_records_experiment_id_captured_at_idx" ON "evidence_records"("experiment_id", "captured_at" DESC);

-- CreateIndex
CREATE INDEX "evidence_records_publication_id_captured_at_idx" ON "evidence_records"("publication_id", "captured_at" DESC);

-- CreateIndex
CREATE INDEX "insights_workspace_id_created_at_idx" ON "insights"("workspace_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "insights_mission_id_created_at_idx" ON "insights"("mission_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "decisions_workspace_id_created_at_idx" ON "decisions"("workspace_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "decisions_mission_id_created_at_idx" ON "decisions"("mission_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "decisions_status_idx" ON "decisions"("status");

-- CreateIndex
CREATE INDEX "memories_workspace_id_tier_idx" ON "memories"("workspace_id", "tier");

-- CreateIndex
CREATE INDEX "memories_workspace_id_category_idx" ON "memories"("workspace_id", "category");

-- CreateIndex
CREATE INDEX "memories_source_type_source_id_idx" ON "memories"("source_type", "source_id");

-- CreateIndex
CREATE INDEX "memories_workspace_id_valid_until_idx" ON "memories"("workspace_id", "valid_until");

-- CreateIndex
CREATE INDEX "agent_tasks_workspace_id_status_idx" ON "agent_tasks"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "agent_tasks_mission_id_idx" ON "agent_tasks"("mission_id");

-- CreateIndex
CREATE INDEX "skill_executions_agent_task_id_idx" ON "skill_executions"("agent_task_id");

-- CreateIndex
CREATE INDEX "skill_executions_skill_name_version_idx" ON "skill_executions"("skill_name", "version");

-- CreateIndex
CREATE INDEX "provider_runs_skill_execution_id_idx" ON "provider_runs"("skill_execution_id");

-- CreateIndex
CREATE INDEX "provider_runs_provider_model_id_idx" ON "provider_runs"("provider", "model_id");

-- AddForeignKey
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_accounts" ADD CONSTRAINT "social_accounts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "secret_envelopes" ADD CONSTRAINT "secret_envelopes_social_account_id_fkey" FOREIGN KEY ("social_account_id") REFERENCES "social_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contents" ADD CONSTRAINT "contents_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contents" ADD CONSTRAINT "contents_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_variants" ADD CONSTRAINT "content_variants_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_variants" ADD CONSTRAINT "content_variants_content_id_fkey" FOREIGN KEY ("content_id") REFERENCES "contents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_variants" ADD CONSTRAINT "content_variants_social_account_id_fkey" FOREIGN KEY ("social_account_id") REFERENCES "social_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publications" ADD CONSTRAINT "publications_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publications" ADD CONSTRAINT "publications_content_variant_id_fkey" FOREIGN KEY ("content_variant_id") REFERENCES "content_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publications" ADD CONSTRAINT "publications_social_account_id_fkey" FOREIGN KEY ("social_account_id") REFERENCES "social_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publications" ADD CONSTRAINT "publications_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publish_attempts" ADD CONSTRAINT "publish_attempts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publish_attempts" ADD CONSTRAINT "publish_attempts_publication_id_fkey" FOREIGN KEY ("publication_id") REFERENCES "publications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbox_commands" ADD CONSTRAINT "outbox_commands_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbox_commands" ADD CONSTRAINT "outbox_commands_publication_id_fkey" FOREIGN KEY ("publication_id") REFERENCES "publications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbox_commands" ADD CONSTRAINT "outbox_commands_publish_attempt_id_fkey" FOREIGN KEY ("publish_attempt_id") REFERENCES "publish_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_decided_by_user_id_fkey" FOREIGN KEY ("decided_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_tokens" ADD CONSTRAINT "approval_tokens_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_tokens" ADD CONSTRAINT "approval_tokens_approval_id_fkey" FOREIGN KEY ("approval_id") REFERENCES "approvals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "missions" ADD CONSTRAINT "missions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "missions" ADD CONSTRAINT "missions_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goals" ADD CONSTRAINT "goals_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goals" ADD CONSTRAINT "goals_mission_id_fkey" FOREIGN KEY ("mission_id") REFERENCES "missions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strategies" ADD CONSTRAINT "strategies_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strategies" ADD CONSTRAINT "strategies_mission_id_fkey" FOREIGN KEY ("mission_id") REFERENCES "missions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "growth_hypotheses" ADD CONSTRAINT "growth_hypotheses_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "growth_hypotheses" ADD CONSTRAINT "growth_hypotheses_mission_id_fkey" FOREIGN KEY ("mission_id") REFERENCES "missions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "growth_hypotheses" ADD CONSTRAINT "growth_hypotheses_strategy_id_fkey" FOREIGN KEY ("strategy_id") REFERENCES "strategies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiments" ADD CONSTRAINT "experiments_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiments" ADD CONSTRAINT "experiments_mission_id_fkey" FOREIGN KEY ("mission_id") REFERENCES "missions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiments" ADD CONSTRAINT "experiments_hypothesis_id_fkey" FOREIGN KEY ("hypothesis_id") REFERENCES "growth_hypotheses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiment_content_variants" ADD CONSTRAINT "experiment_content_variants_experiment_id_fkey" FOREIGN KEY ("experiment_id") REFERENCES "experiments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiment_content_variants" ADD CONSTRAINT "experiment_content_variants_content_variant_id_fkey" FOREIGN KEY ("content_variant_id") REFERENCES "content_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiment_content_variants" ADD CONSTRAINT "experiment_content_variants_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_snapshots" ADD CONSTRAINT "analytics_snapshots_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_snapshots" ADD CONSTRAINT "analytics_snapshots_social_account_id_fkey" FOREIGN KEY ("social_account_id") REFERENCES "social_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_snapshots" ADD CONSTRAINT "analytics_snapshots_publication_id_fkey" FOREIGN KEY ("publication_id") REFERENCES "publications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_metrics" ADD CONSTRAINT "analytics_metrics_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "analytics_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_records" ADD CONSTRAINT "evidence_records_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_records" ADD CONSTRAINT "evidence_records_mission_id_fkey" FOREIGN KEY ("mission_id") REFERENCES "missions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_records" ADD CONSTRAINT "evidence_records_experiment_id_fkey" FOREIGN KEY ("experiment_id") REFERENCES "experiments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_records" ADD CONSTRAINT "evidence_records_publication_id_fkey" FOREIGN KEY ("publication_id") REFERENCES "publications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_records" ADD CONSTRAINT "evidence_records_metric_snapshot_id_fkey" FOREIGN KEY ("metric_snapshot_id") REFERENCES "analytics_snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insights" ADD CONSTRAINT "insights_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insights" ADD CONSTRAINT "insights_mission_id_fkey" FOREIGN KEY ("mission_id") REFERENCES "missions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insights" ADD CONSTRAINT "insights_experiment_id_fkey" FOREIGN KEY ("experiment_id") REFERENCES "experiments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_mission_id_fkey" FOREIGN KEY ("mission_id") REFERENCES "missions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_insight_id_fkey" FOREIGN KEY ("insight_id") REFERENCES "insights"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_approval_id_fkey" FOREIGN KEY ("approval_id") REFERENCES "approvals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memories" ADD CONSTRAINT "memories_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memories" ADD CONSTRAINT "memories_mission_id_fkey" FOREIGN KEY ("mission_id") REFERENCES "missions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_tasks" ADD CONSTRAINT "agent_tasks_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_tasks" ADD CONSTRAINT "agent_tasks_mission_id_fkey" FOREIGN KEY ("mission_id") REFERENCES "missions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_executions" ADD CONSTRAINT "skill_executions_agent_task_id_fkey" FOREIGN KEY ("agent_task_id") REFERENCES "agent_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_runs" ADD CONSTRAINT "provider_runs_skill_execution_id_fkey" FOREIGN KEY ("skill_execution_id") REFERENCES "skill_executions"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Partial unique: at most one PENDING approval per workspace resource
CREATE UNIQUE INDEX "approvals_pending_resource_key"
ON "approvals" ("workspace_id", "resource_type", "resource_id")
WHERE "status" = 'PENDING';
