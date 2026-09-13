-- Bind security-sensitive relationships to the same workspace at the database layer.
-- PostgreSQL will refuse this migration if existing rows violate these invariants.

-- Composite candidate keys used by tenant-aware foreign keys.
CREATE UNIQUE INDEX "social_accounts_workspace_id_id_key"
ON "social_accounts"("workspace_id", "id");

CREATE UNIQUE INDEX "contents_workspace_id_id_key"
ON "contents"("workspace_id", "id");

CREATE UNIQUE INDEX "content_variants_workspace_id_id_key"
ON "content_variants"("workspace_id", "id");

CREATE UNIQUE INDEX "publications_workspace_id_id_key"
ON "publications"("workspace_id", "id");

CREATE UNIQUE INDEX "publish_attempts_workspace_publication_id_id_key"
ON "publish_attempts"("workspace_id", "publication_id", "id");

CREATE UNIQUE INDEX "approvals_workspace_id_id_key"
ON "approvals"("workspace_id", "id");

-- One dispatch command is allowed for each immutable publish attempt.
CREATE UNIQUE INDEX "outbox_commands_publish_attempt_id_key"
ON "outbox_commands"("publish_attempt_id");

-- OAuth state rows must not outlive their initiating user or workspace.
ALTER TABLE "oauth_connect_nonces"
ADD CONSTRAINT "oauth_connect_nonces_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "oauth_connect_nonces"
ADD CONSTRAINT "oauth_connect_nonces_workspace_id_fkey"
FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- Content variants cannot point to content or accounts from another workspace.
ALTER TABLE "content_variants"
DROP CONSTRAINT "content_variants_content_id_fkey";

ALTER TABLE "content_variants"
ADD CONSTRAINT "content_variants_workspace_id_content_id_fkey"
FOREIGN KEY ("workspace_id", "content_id")
REFERENCES "contents"("workspace_id", "id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "content_variants"
DROP CONSTRAINT "content_variants_social_account_id_fkey";

ALTER TABLE "content_variants"
ADD CONSTRAINT "content_variants_workspace_id_social_account_id_fkey"
FOREIGN KEY ("workspace_id", "social_account_id")
REFERENCES "social_accounts"("workspace_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- Publications cannot mix variants or target accounts across workspaces.
ALTER TABLE "publications"
DROP CONSTRAINT "publications_content_variant_id_fkey";

ALTER TABLE "publications"
ADD CONSTRAINT "publications_workspace_id_content_variant_id_fkey"
FOREIGN KEY ("workspace_id", "content_variant_id")
REFERENCES "content_variants"("workspace_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "publications"
DROP CONSTRAINT "publications_social_account_id_fkey";

ALTER TABLE "publications"
ADD CONSTRAINT "publications_workspace_id_social_account_id_fkey"
FOREIGN KEY ("workspace_id", "social_account_id")
REFERENCES "social_accounts"("workspace_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- Attempts inherit the publication workspace.
ALTER TABLE "publish_attempts"
DROP CONSTRAINT "publish_attempts_publication_id_fkey";

ALTER TABLE "publish_attempts"
ADD CONSTRAINT "publish_attempts_workspace_id_publication_id_fkey"
FOREIGN KEY ("workspace_id", "publication_id")
REFERENCES "publications"("workspace_id", "id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- An outbox row must reference an attempt for the same publication and workspace.
ALTER TABLE "outbox_commands"
DROP CONSTRAINT "outbox_commands_publication_id_fkey";

ALTER TABLE "outbox_commands"
ADD CONSTRAINT "outbox_commands_workspace_id_publication_id_fkey"
FOREIGN KEY ("workspace_id", "publication_id")
REFERENCES "publications"("workspace_id", "id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "outbox_commands"
DROP CONSTRAINT "outbox_commands_publish_attempt_id_fkey";

ALTER TABLE "outbox_commands"
ADD CONSTRAINT "outbox_commands_workspace_publication_attempt_id_fkey"
FOREIGN KEY ("workspace_id", "publication_id", "publish_attempt_id")
REFERENCES "publish_attempts"("workspace_id", "publication_id", "id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- Approval tokens cannot be attached to an approval in a different workspace.
ALTER TABLE "approval_tokens"
DROP CONSTRAINT "approval_tokens_approval_id_fkey";

ALTER TABLE "approval_tokens"
ADD CONSTRAINT "approval_tokens_workspace_id_approval_id_fkey"
FOREIGN KEY ("workspace_id", "approval_id")
REFERENCES "approvals"("workspace_id", "id")
ON DELETE CASCADE ON UPDATE CASCADE;
