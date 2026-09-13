BEGIN;

INSERT INTO "users" ("id", "email", "name") VALUES
  ('10000000-0000-4000-8000-000000000001', 'owner@example.test', 'Owner');

INSERT INTO "workspaces" ("id", "name", "slug", "owner_user_id") VALUES
  ('20000000-0000-4000-8000-000000000001', 'Workspace A', 'tenant-test-a', '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000002', 'Workspace B', 'tenant-test-b', '10000000-0000-4000-8000-000000000001');

INSERT INTO "social_accounts" (
  "id", "workspace_id", "platform", "external_account_id", "account_name"
) VALUES
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'X', 'account-a', 'Account A'),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'X', 'account-b', 'Account B');

INSERT INTO "contents" ("id", "workspace_id", "body") VALUES
  ('40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Content A'),
  ('40000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'Content B');

INSERT INTO "missions" ("id", "workspace_id", "name") VALUES
  ('45000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'Mission B');

DO $$
BEGIN
  BEGIN
    INSERT INTO "contents" ("workspace_id", "mission_id", "body")
    VALUES (
      '20000000-0000-4000-8000-000000000001',
      '45000000-0000-4000-8000-000000000002',
      'Cross-tenant mission content'
    );
    RAISE EXCEPTION 'content accepted a mission from another workspace';
  EXCEPTION WHEN foreign_key_violation THEN
    NULL;
  END;
END $$;

INSERT INTO "content_variants" (
  "id", "workspace_id", "content_id", "social_account_id", "body"
) VALUES (
  '50000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  'Variant A'
);

DO $$
BEGIN
  BEGIN
    INSERT INTO "content_variants" ("workspace_id", "content_id", "body")
    VALUES (
      '20000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000002',
      'Cross-tenant content'
    );
    RAISE EXCEPTION 'cross-tenant content variant was accepted';
  EXCEPTION WHEN foreign_key_violation THEN
    NULL;
  END;
END $$;

DO $$
BEGIN
  BEGIN
    INSERT INTO "publications" (
      "workspace_id", "content_variant_id", "social_account_id", "idempotency_key", "fingerprint"
    ) VALUES (
      '20000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000002',
      'cross-tenant-publication',
      repeat('a', 64)
    );
    RAISE EXCEPTION 'cross-tenant publication account was accepted';
  EXCEPTION WHEN foreign_key_violation THEN
    NULL;
  END;
END $$;

INSERT INTO "publications" (
  "id", "workspace_id", "content_variant_id", "social_account_id", "idempotency_key", "fingerprint"
) VALUES
  (
    '60000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'publication-a-1',
    repeat('b', 64)
  ),
  (
    '60000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'publication-a-2',
    repeat('c', 64)
  );

INSERT INTO "publish_attempts" (
  "id", "workspace_id", "publication_id", "idempotency_key", "fingerprint"
) VALUES
  (
    '70000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '60000000-0000-4000-8000-000000000001',
    'attempt-a-1',
    repeat('d', 64)
  ),
  (
    '70000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000001',
    '60000000-0000-4000-8000-000000000002',
    'attempt-a-2',
    repeat('e', 64)
  );

DO $$
BEGIN
  BEGIN
    INSERT INTO "outbox_commands" (
      "workspace_id", "publication_id", "publish_attempt_id", "command_type", "payload"
    ) VALUES (
      '20000000-0000-4000-8000-000000000001',
      '60000000-0000-4000-8000-000000000001',
      '70000000-0000-4000-8000-000000000002',
      'SOCIAL_PUBLISH',
      '{}'
    );
    RAISE EXCEPTION 'outbox command accepted an attempt from another publication';
  EXCEPTION WHEN foreign_key_violation THEN
    NULL;
  END;
END $$;

INSERT INTO "outbox_commands" (
  "workspace_id", "publication_id", "publish_attempt_id", "command_type", "payload"
) VALUES (
  '20000000-0000-4000-8000-000000000001',
  '60000000-0000-4000-8000-000000000001',
  '70000000-0000-4000-8000-000000000001',
  'SOCIAL_PUBLISH',
  '{}'
);

DO $$
BEGIN
  BEGIN
    INSERT INTO "outbox_commands" (
      "workspace_id", "publication_id", "publish_attempt_id", "command_type", "payload"
    ) VALUES (
      '20000000-0000-4000-8000-000000000001',
      '60000000-0000-4000-8000-000000000001',
      '70000000-0000-4000-8000-000000000001',
      'SOCIAL_PUBLISH',
      '{}'
    );
    RAISE EXCEPTION 'duplicate outbox command was accepted';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;
END $$;

INSERT INTO "approvals" (
  "id", "workspace_id", "resource_type", "resource_id"
) VALUES (
  '80000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000002',
  'PUBLICATION',
  '60000000-0000-4000-8000-000000000001'
);

DO $$
BEGIN
  BEGIN
    INSERT INTO "approval_tokens" (
      "workspace_id", "approval_id", "token_hash", "expires_at", "nonce"
    ) VALUES (
      '20000000-0000-4000-8000-000000000001',
      '80000000-0000-4000-8000-000000000001',
      repeat('f', 64),
      now() + interval '1 hour',
      'cross-tenant-approval'
    );
    RAISE EXCEPTION 'cross-tenant approval token was accepted';
  EXCEPTION WHEN foreign_key_violation THEN
    NULL;
  END;
END $$;

DO $$
BEGIN
  BEGIN
    INSERT INTO "oauth_connect_nonces" (
      "nonce", "user_id", "workspace_id", "platform", "expires_at"
    ) VALUES (
      'orphan-user',
      '10000000-0000-4000-8000-000000000099',
      '20000000-0000-4000-8000-000000000001',
      'X',
      now() + interval '10 minutes'
    );
    RAISE EXCEPTION 'OAuth nonce with an orphan user was accepted';
  EXCEPTION WHEN foreign_key_violation THEN
    NULL;
  END;
END $$;

DO $$
BEGIN
  BEGIN
    INSERT INTO "goals" (
      "workspace_id", "mission_id", "name", "metric_key", "target_value", "ends_at"
    ) VALUES (
      '20000000-0000-4000-8000-000000000001',
      '45000000-0000-4000-8000-000000000002',
      'Cross-tenant goal',
      'followers',
      100,
      now() + interval '30 days'
    );
    RAISE EXCEPTION 'goal accepted a mission from another workspace';
  EXCEPTION WHEN foreign_key_violation THEN
    NULL;
  END;
END $$;

DO $$
DECLARE
  missing_constraints text;
BEGIN
  SELECT string_agg(expected.name, ', ' ORDER BY expected.name)
  INTO missing_constraints
  FROM (
    VALUES
      ('goals_workspace_id_mission_id_fkey'),
      ('strategies_workspace_id_mission_id_fkey'),
      ('growth_hypotheses_workspace_id_mission_id_fkey'),
      ('growth_hypotheses_workspace_id_strategy_id_fkey'),
      ('experiments_workspace_id_mission_id_fkey'),
      ('experiments_workspace_id_hypothesis_id_fkey'),
      ('experiment_content_variants_workspace_id_experiment_id_fkey'),
      ('experiment_content_variants_workspace_id_content_variant_i_fkey'),
      ('analytics_snapshots_workspace_id_social_account_id_fkey'),
      ('analytics_snapshots_workspace_id_publication_id_fkey'),
      ('evidence_records_workspace_id_mission_id_fkey'),
      ('evidence_records_workspace_id_experiment_id_fkey'),
      ('evidence_records_workspace_id_publication_id_fkey'),
      ('evidence_records_workspace_id_metric_snapshot_id_fkey'),
      ('insights_workspace_id_mission_id_fkey'),
      ('insights_workspace_id_experiment_id_fkey'),
      ('decisions_workspace_id_mission_id_fkey'),
      ('decisions_workspace_id_insight_id_fkey'),
      ('decisions_workspace_id_approval_id_fkey'),
      ('memories_workspace_id_mission_id_fkey'),
      ('agent_tasks_workspace_id_mission_id_fkey')
  ) AS expected(name)
  LEFT JOIN pg_constraint actual
    ON actual.conname = expected.name
   AND actual.contype = 'f'
  WHERE actual.oid IS NULL;

  IF missing_constraints IS NOT NULL THEN
    RAISE EXCEPTION 'missing tenant integrity constraints: %', missing_constraints;
  END IF;
END $$;

ROLLBACK;
