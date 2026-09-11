// scriora-worker — Durable Job Executor (Inngest)
// Mandate: Execute scheduled publications, retries, media jobs,
//          analytics ingestion, and outbox consumption.
// INVARIANT: No domain ownership — delegates to scriora-core contracts
// Reference: scriora-docs/architecture/SCRIORA_REPOSITORY_SPECIFICATIONS.md

import { serve } from 'inngest/node';
import { inngest } from './inngest.js';
import { outboxSweepJob } from './jobs/outbox-sweep.job.js';
import { publishJob } from './jobs/publish.job.js';
import { verifyJob } from './jobs/verify.job.js';

const functions = [publishJob, verifyJob, outboxSweepJob];

const handler = serve({
  client: inngest,
  functions,
});

export default handler;
