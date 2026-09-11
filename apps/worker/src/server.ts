// scriora-worker — Durable Job Executor (Inngest)
// Mandate: Execute scheduled publications, retries, media jobs,
//          analytics ingestion, and outbox consumption.
// INVARIANT: No domain ownership — delegates to scriora-core contracts
// Reference: scriora-docs/architecture/SCRIORA_REPOSITORY_SPECIFICATIONS.md

import { serve } from 'inngest/node';
import { LinkedInAdapter, XAdapter, platformRegistry } from 'scriora-social';
import { inngest } from './inngest.js';
import { outboxSweepJob } from './jobs/outbox-sweep.job.js';
import { publishJob } from './jobs/publish.job.js';
import { verifyJob } from './jobs/verify.job.js';

// Auto-register production platform adapters
if (!platformRegistry.has('LINKEDIN')) {
  try {
    platformRegistry.register(new LinkedInAdapter());
  } catch {}
}
if (!platformRegistry.has('X')) {
  try {
    platformRegistry.register(new XAdapter());
  } catch {}
}

const functions = [publishJob, verifyJob, outboxSweepJob];

const handler = serve({
  client: inngest,
  functions,
});

export default handler;
