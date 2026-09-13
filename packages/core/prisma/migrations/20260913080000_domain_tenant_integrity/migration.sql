-- DropForeignKey
ALTER TABLE "agent_tasks" DROP CONSTRAINT "agent_tasks_mission_id_fkey";

-- DropForeignKey
ALTER TABLE "analytics_snapshots" DROP CONSTRAINT "analytics_snapshots_publication_id_fkey";

-- DropForeignKey
ALTER TABLE "analytics_snapshots" DROP CONSTRAINT "analytics_snapshots_social_account_id_fkey";

-- DropForeignKey
ALTER TABLE "decisions" DROP CONSTRAINT "decisions_approval_id_fkey";

-- DropForeignKey
ALTER TABLE "decisions" DROP CONSTRAINT "decisions_insight_id_fkey";

-- DropForeignKey
ALTER TABLE "decisions" DROP CONSTRAINT "decisions_mission_id_fkey";

-- DropForeignKey
ALTER TABLE "evidence_records" DROP CONSTRAINT "evidence_records_experiment_id_fkey";

-- DropForeignKey
ALTER TABLE "evidence_records" DROP CONSTRAINT "evidence_records_metric_snapshot_id_fkey";

-- DropForeignKey
ALTER TABLE "evidence_records" DROP CONSTRAINT "evidence_records_mission_id_fkey";

-- DropForeignKey
ALTER TABLE "evidence_records" DROP CONSTRAINT "evidence_records_publication_id_fkey";

-- DropForeignKey
ALTER TABLE "experiment_content_variants" DROP CONSTRAINT "experiment_content_variants_content_variant_id_fkey";

-- DropForeignKey
ALTER TABLE "experiment_content_variants" DROP CONSTRAINT "experiment_content_variants_experiment_id_fkey";

-- DropForeignKey
ALTER TABLE "experiments" DROP CONSTRAINT "experiments_hypothesis_id_fkey";

-- DropForeignKey
ALTER TABLE "experiments" DROP CONSTRAINT "experiments_mission_id_fkey";

-- DropForeignKey
ALTER TABLE "goals" DROP CONSTRAINT "goals_mission_id_fkey";

-- DropForeignKey
ALTER TABLE "growth_hypotheses" DROP CONSTRAINT "growth_hypotheses_mission_id_fkey";

-- DropForeignKey
ALTER TABLE "growth_hypotheses" DROP CONSTRAINT "growth_hypotheses_strategy_id_fkey";

-- DropForeignKey
ALTER TABLE "insights" DROP CONSTRAINT "insights_experiment_id_fkey";

-- DropForeignKey
ALTER TABLE "insights" DROP CONSTRAINT "insights_mission_id_fkey";

-- DropForeignKey
ALTER TABLE "memories" DROP CONSTRAINT "memories_mission_id_fkey";

-- DropForeignKey
ALTER TABLE "strategies" DROP CONSTRAINT "strategies_mission_id_fkey";

-- CreateIndex
CREATE UNIQUE INDEX "analytics_snapshots_workspace_id_id_key" ON "analytics_snapshots"("workspace_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "experiments_workspace_id_id_key" ON "experiments"("workspace_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "growth_hypotheses_workspace_id_id_key" ON "growth_hypotheses"("workspace_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "insights_workspace_id_id_key" ON "insights"("workspace_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "strategies_workspace_id_id_key" ON "strategies"("workspace_id", "id");

-- AddForeignKey
ALTER TABLE "goals" ADD CONSTRAINT "goals_workspace_id_mission_id_fkey" FOREIGN KEY ("workspace_id", "mission_id") REFERENCES "missions"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strategies" ADD CONSTRAINT "strategies_workspace_id_mission_id_fkey" FOREIGN KEY ("workspace_id", "mission_id") REFERENCES "missions"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "growth_hypotheses" ADD CONSTRAINT "growth_hypotheses_workspace_id_mission_id_fkey" FOREIGN KEY ("workspace_id", "mission_id") REFERENCES "missions"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "growth_hypotheses" ADD CONSTRAINT "growth_hypotheses_workspace_id_strategy_id_fkey" FOREIGN KEY ("workspace_id", "strategy_id") REFERENCES "strategies"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiments" ADD CONSTRAINT "experiments_workspace_id_mission_id_fkey" FOREIGN KEY ("workspace_id", "mission_id") REFERENCES "missions"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiments" ADD CONSTRAINT "experiments_workspace_id_hypothesis_id_fkey" FOREIGN KEY ("workspace_id", "hypothesis_id") REFERENCES "growth_hypotheses"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiment_content_variants" ADD CONSTRAINT "experiment_content_variants_workspace_id_experiment_id_fkey" FOREIGN KEY ("workspace_id", "experiment_id") REFERENCES "experiments"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiment_content_variants" ADD CONSTRAINT "experiment_content_variants_workspace_id_content_variant_i_fkey" FOREIGN KEY ("workspace_id", "content_variant_id") REFERENCES "content_variants"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_snapshots" ADD CONSTRAINT "analytics_snapshots_workspace_id_social_account_id_fkey" FOREIGN KEY ("workspace_id", "social_account_id") REFERENCES "social_accounts"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_snapshots" ADD CONSTRAINT "analytics_snapshots_workspace_id_publication_id_fkey" FOREIGN KEY ("workspace_id", "publication_id") REFERENCES "publications"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_records" ADD CONSTRAINT "evidence_records_workspace_id_mission_id_fkey" FOREIGN KEY ("workspace_id", "mission_id") REFERENCES "missions"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_records" ADD CONSTRAINT "evidence_records_workspace_id_experiment_id_fkey" FOREIGN KEY ("workspace_id", "experiment_id") REFERENCES "experiments"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_records" ADD CONSTRAINT "evidence_records_workspace_id_publication_id_fkey" FOREIGN KEY ("workspace_id", "publication_id") REFERENCES "publications"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_records" ADD CONSTRAINT "evidence_records_workspace_id_metric_snapshot_id_fkey" FOREIGN KEY ("workspace_id", "metric_snapshot_id") REFERENCES "analytics_snapshots"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insights" ADD CONSTRAINT "insights_workspace_id_mission_id_fkey" FOREIGN KEY ("workspace_id", "mission_id") REFERENCES "missions"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insights" ADD CONSTRAINT "insights_workspace_id_experiment_id_fkey" FOREIGN KEY ("workspace_id", "experiment_id") REFERENCES "experiments"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_workspace_id_mission_id_fkey" FOREIGN KEY ("workspace_id", "mission_id") REFERENCES "missions"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_workspace_id_insight_id_fkey" FOREIGN KEY ("workspace_id", "insight_id") REFERENCES "insights"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_workspace_id_approval_id_fkey" FOREIGN KEY ("workspace_id", "approval_id") REFERENCES "approvals"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memories" ADD CONSTRAINT "memories_workspace_id_mission_id_fkey" FOREIGN KEY ("workspace_id", "mission_id") REFERENCES "missions"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_tasks" ADD CONSTRAINT "agent_tasks_workspace_id_mission_id_fkey" FOREIGN KEY ("workspace_id", "mission_id") REFERENCES "missions"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
