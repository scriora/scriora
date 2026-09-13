-- Persist the optional mission supplied by the unified publishing contract.
CREATE UNIQUE INDEX "missions_workspace_id_id_key"
ON "missions"("workspace_id", "id");

ALTER TABLE "contents"
ADD COLUMN "mission_id" UUID;

CREATE INDEX "contents_workspace_id_mission_id_idx"
ON "contents"("workspace_id", "mission_id");

ALTER TABLE "contents"
ADD CONSTRAINT "contents_workspace_id_mission_id_fkey"
FOREIGN KEY ("workspace_id", "mission_id")
REFERENCES "missions"("workspace_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;
