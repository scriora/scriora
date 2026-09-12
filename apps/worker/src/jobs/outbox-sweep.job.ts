import { prisma } from 'scriora-core';
import { inngest } from '../inngest/client.js';
import { findActionableOutboxCommands } from '../lib/publication-dispatch-guard.js';

export const outboxSweepJob = inngest.createFunction(
  {
    id: 'outbox-sweep-job',
    name: 'Transactional Outbox Recovery Sweep',
    triggers: [{ cron: '*/5 * * * *' }],
  },
  async ({ step }) => {
    // Find actionable OutboxCommands:
    // 1. PENDING commands with availableAt <= now
    // 2. PROCESSING commands stuck for more than 10 minutes (updatedAt < tenMinutesAgo)
    // Never dispatch publications still awaiting §14 approval or already cancelled.
    const staleCommands = await step.run('find-stale-outbox-commands', async () => {
      return findActionableOutboxCommands(prisma);
    });

    if (staleCommands.length === 0) {
      return { recovered: 0 };
    }

    // Trigger publish job for each stale command
    const events = staleCommands.map((cmd: { id: string }) => ({
      name: 'scriora/publication.requested',
      data: { outboxCommandId: cmd.id },
    }));

    await step.sendEvent('dispatch-stale-commands', events);

    return { recovered: staleCommands.length };
  }
);
