import { getApiInngestClient } from './inngest-client.js';

export const PUBLICATION_REQUESTED_EVENT = 'scriora/publication.requested';

export type PublicationRequestedEvent = {
  name: typeof PUBLICATION_REQUESTED_EVENT;
  data: { outboxCommandId: string };
};

export type PublicationRequestedSender = (event: PublicationRequestedEvent) => Promise<unknown>;

export type ImmediateDispatchInput = {
  outboxCommandId: string | null;
  availableAt?: Date | null;
  status?: string | null;
};

export type ImmediateDispatchResult = {
  dispatched: boolean;
  reason: string;
};

export function shouldDispatchPublicationRequestedImmediately(
  input: ImmediateDispatchInput,
  now = new Date()
): { ok: true } | { ok: false; reason: string } {
  if (!input.outboxCommandId) {
    return { ok: false, reason: 'no-outbox' };
  }
  if (input.status && input.status !== 'PENDING') {
    return { ok: false, reason: `outbox-not-pending:${input.status}` };
  }
  if (input.availableAt && input.availableAt.getTime() > now.getTime()) {
    return { ok: false, reason: 'available-in-future' };
  }
  return { ok: true };
}

async function defaultSendPublicationRequested(event: PublicationRequestedEvent): Promise<unknown> {
  const client = getApiInngestClient();
  if (!client) {
    throw new Error('INNGEST_CLIENT_UNAVAILABLE');
  }
  return client.send(event);
}

/**
 * After APPROVED creates a PENDING outbox, fire `scriora/publication.requested`
 * immediately when the command is already available. Failures are swallowed so
 * the 5-minute outbox sweep remains the recovery path.
 */
export async function maybeDispatchPublicationRequested(
  input: ImmediateDispatchInput,
  deps: { send?: PublicationRequestedSender; now?: Date } = {}
): Promise<ImmediateDispatchResult> {
  const gate = shouldDispatchPublicationRequestedImmediately(input, deps.now ?? new Date());
  if (!gate.ok) {
    return { dispatched: false, reason: gate.reason };
  }

  const send = deps.send ?? defaultSendPublicationRequested;
  try {
    await send({
      name: PUBLICATION_REQUESTED_EVENT,
      data: { outboxCommandId: input.outboxCommandId as string },
    });
    return { dispatched: true, reason: 'sent' };
  } catch {
    return { dispatched: false, reason: 'send-failed' };
  }
}
