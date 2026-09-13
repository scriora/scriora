// scriora-worker — Durable Job Executor (Inngest)
// Mandate: Execute scheduled publications, retries, media jobs,
//          analytics ingestion, and outbox consumption.
// INVARIANT: No domain ownership — delegates to scriora-core contracts
// Reference: scriora-docs/architecture/SCRIORA_REPOSITORY_SPECIFICATIONS.md

import { pathToFileURL } from 'node:url';
import { serve } from 'inngest/node';
import {
  DiscordAdapter,
  FacebookAdapter,
  InstagramAdapter,
  LinkedInAdapter,
  platformRegistry,
  TelegramAdapter,
  ThreadsAdapter,
  XAdapter,
  YouTubeAdapter,
} from 'scriora-social';
import { inngest } from './inngest/client.js';
import { outboxSweepJob } from './jobs/outbox-sweep.job.js';
import { publishJob } from './jobs/publish.job.js';
import { verifyJob } from './jobs/verify.job.js';
import { createWorkerHttpServer } from './worker-http-server.js';

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
if (!platformRegistry.has('TELEGRAM')) {
  try {
    platformRegistry.register(new TelegramAdapter());
  } catch {}
}
if (!platformRegistry.has('DISCORD')) {
  try {
    platformRegistry.register(new DiscordAdapter());
  } catch {}
}
if (!platformRegistry.has('INSTAGRAM')) {
  try {
    platformRegistry.register(new InstagramAdapter());
  } catch {}
}
if (!platformRegistry.has('THREADS')) {
  try {
    platformRegistry.register(new ThreadsAdapter());
  } catch {}
}
if (!platformRegistry.has('FACEBOOK')) {
  try {
    platformRegistry.register(new FacebookAdapter());
  } catch {}
}
if (!platformRegistry.has('YOUTUBE')) {
  try {
    platformRegistry.register(new YouTubeAdapter());
  } catch {}
}

const functions = [publishJob, verifyJob, outboxSweepJob];

const handler = serve({
  client: inngest,
  functions,
});

export default handler;

export function startWorkerServer() {
  const server = createWorkerHttpServer(handler);
  const port = Number(process.env.PORT ?? 3001);

  server.listen(port, '0.0.0.0', () => {
    console.log(`scriora-worker listening on port ${port}`);
  });

  const shutdown = (signal: string) => {
    console.log(`Received ${signal}, closing worker server...`);
    server.close((error) => {
      if (error) {
        // biome-ignore lint/suspicious/noConsole: fatal shutdown error
        console.error(error);
        process.exit(1);
      }
      process.exit(0);
    });
  };

  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
  return server;
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  startWorkerServer();
}
