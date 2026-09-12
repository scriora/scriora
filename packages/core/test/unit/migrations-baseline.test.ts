import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '../../prisma/migrations');

describe('prisma migrations baseline', () => {
  const sql = readFileSync(join(migrationsDir, '20260912130000_init/migration.sql'), 'utf8');

  it('uniques ApprovalToken.tokenHash and SecretEnvelope.socialAccountId', () => {
    expect(sql).toContain('CREATE UNIQUE INDEX "approval_tokens_token_hash_key"');
    expect(sql).toContain('CREATE UNIQUE INDEX "secret_envelopes_social_account_id_key"');
  });

  it('adds a PENDING-approval partial unique index', () => {
    expect(sql).toContain('CREATE UNIQUE INDEX "approvals_pending_resource_key"');
    expect(sql).toMatch(/WHERE\s+"status"\s*=\s*'PENDING'/);
  });
});
