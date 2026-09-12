import { Inngest } from 'inngest';

/**
 * Must match the worker Inngest app id so `scriora/publication.requested`
 * is delivered to publish.job. Safe to construct from the API: missing
 * production keys skip send rather than crashing the process.
 */
export const INNGEST_APP_ID = 'scriora-worker';

export function resolveInngestEventKey(env: NodeJS.ProcessEnv = process.env): string | null {
  const configured = env.INNGEST_EVENT_KEY?.trim();
  if (configured) {
    return configured;
  }
  if (env.NODE_ENV === 'production' || env.NODE_ENV === 'test') {
    return null;
  }
  return 'dev-local-key';
}

let clientInstance: Inngest | null | undefined;

export function getApiInngestClient(): Inngest | null {
  if (clientInstance !== undefined) {
    return clientInstance;
  }

  const eventKey = resolveInngestEventKey();
  if (!eventKey) {
    clientInstance = null;
    return null;
  }

  clientInstance = new Inngest({
    id: INNGEST_APP_ID,
    name: 'Scriora API',
    eventKey,
  });
  return clientInstance;
}

export function resetApiInngestClientForTests(): void {
  clientInstance = undefined;
}
