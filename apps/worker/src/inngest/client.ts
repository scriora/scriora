import { Inngest } from 'inngest';
import { resolveInngestKeys } from './keys.js';

const keys = resolveInngestKeys();

export const inngest = new Inngest({
  id: 'scriora-worker',
  name: 'Scriora Background Worker',
  eventKey: keys.eventKey,
  ...(keys.signingKey ? { signingKey: keys.signingKey } : {}),
});
