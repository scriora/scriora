import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  resetApiInngestClientForTests,
  resolveInngestEventKey,
} from '../../src/lib/inngest-client.js';
import {
  PUBLICATION_REQUESTED_EVENT,
  maybeDispatchPublicationRequested,
  shouldDispatchPublicationRequestedImmediately,
} from '../../src/lib/publication-requested.js';

describe('immediate scriora/publication.requested dispatch', () => {
  afterEach(() => {
    resetApiInngestClientForTests();
  });

  it('dispatches when APPROVED outbox is PENDING and available now', async () => {
    const send = vi.fn().mockResolvedValue({ ids: ['evt-1'] });

    const result = await maybeDispatchPublicationRequested(
      {
        outboxCommandId: 'outbox-after-approve',
        availableAt: new Date('2026-09-12T11:00:00.000Z'),
        status: 'PENDING',
      },
      { send, now: new Date('2026-09-12T11:00:01.000Z') }
    );

    expect(result).toEqual({ dispatched: true, reason: 'sent' });
    expect(send).toHaveBeenCalledWith({
      name: PUBLICATION_REQUESTED_EVENT,
      data: { outboxCommandId: 'outbox-after-approve' },
    });
  });

  it('does not dispatch a scheduled outbox still in the future', async () => {
    const send = vi.fn();
    const availableAt = new Date('2026-09-13T09:00:00.000Z');

    expect(
      shouldDispatchPublicationRequestedImmediately(
        { outboxCommandId: 'outbox-sched', availableAt, status: 'PENDING' },
        new Date('2026-09-12T11:00:00.000Z')
      )
    ).toEqual({ ok: false, reason: 'available-in-future' });

    const result = await maybeDispatchPublicationRequested(
      { outboxCommandId: 'outbox-sched', availableAt, status: 'PENDING' },
      { send, now: new Date('2026-09-12T11:00:00.000Z') }
    );

    expect(result).toEqual({ dispatched: false, reason: 'available-in-future' });
    expect(send).not.toHaveBeenCalled();
  });

  it('does not fail the caller when Inngest send throws (sweep remains the fallback)', async () => {
    const send = vi.fn().mockRejectedValue(new Error('inngest down'));

    const result = await maybeDispatchPublicationRequested(
      { outboxCommandId: 'outbox-1', status: 'PENDING', availableAt: new Date() },
      { send }
    );

    expect(result).toEqual({ dispatched: false, reason: 'send-failed' });
  });

  it('skips when there is no PENDING outbox', () => {
    expect(
      shouldDispatchPublicationRequestedImmediately({
        outboxCommandId: null,
        status: null,
        availableAt: null,
      })
    ).toEqual({ ok: false, reason: 'no-outbox' });
    expect(
      shouldDispatchPublicationRequestedImmediately({
        outboxCommandId: 'outbox-1',
        status: 'PROCESSING',
        availableAt: new Date(),
      })
    ).toEqual({ ok: false, reason: 'outbox-not-pending:PROCESSING' });
  });

  it('does not construct a production Inngest client without INNGEST_EVENT_KEY', () => {
    expect(resolveInngestEventKey({ NODE_ENV: 'production' })).toBeNull();
    expect(resolveInngestEventKey({ NODE_ENV: 'test' })).toBeNull();
    expect(resolveInngestEventKey({ NODE_ENV: 'development' })).toBe('dev-local-key');
    expect(
      resolveInngestEventKey({ NODE_ENV: 'production', INNGEST_EVENT_KEY: ' prod-key ' })
    ).toBe('prod-key');
  });
});
