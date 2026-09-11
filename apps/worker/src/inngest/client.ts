import { Inngest } from 'inngest';

const isProduction = process.env.NODE_ENV === 'production';
const eventKey = process.env.INNGEST_EVENT_KEY;

if (!eventKey) {
  if (isProduction) {
    throw new Error('INNGEST_EVENT_KEY environment variable is required in production environment');
  }
  // biome-ignore lint/suspicious/noConsole: development fallback warning required by specification
  console.warn(
    '[Inngest] WARNING: INNGEST_EVENT_KEY is missing. Falling back to development key "dev-local-key". Do NOT use in production.'
  );
}

export const inngest = new Inngest({
  id: 'scriora-worker',
  name: 'Scriora Background Worker',
  eventKey: eventKey ?? 'dev-local-key',
});
