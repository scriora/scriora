import { PlatformError } from 'scriora-social';
import { describe, expect, it, vi } from 'vitest';
import {
  PLATFORM_MUTATION_MAX_ATTEMPTS,
  PUBLISH_JOB_OPTIONS,
  PUBLISH_JOB_RETRIES,
  PUBLISH_STEP_IDS,
  classifyAdapterSuccess,
  dispatchToPlatformOnce,
  hasExternalPostId,
  shouldRetryPlatformMutation,
  shouldScheduleVerify,
  stepOutputContainsPlaintextSecret,
} from '../../src/lib/publish-mutation-policy.js';

describe('publish mutation retry / unknown-id / secret policy', () => {
  it('uses a single mutation attempt (Inngest retries: 0 ≡ maxAttempts=1)', () => {
    expect(PLATFORM_MUTATION_MAX_ATTEMPTS).toBe(1);
    expect(PUBLISH_JOB_RETRIES).toBe(0);
    expect(PUBLISH_JOB_OPTIONS.retries).toBe(0);
    expect(shouldRetryPlatformMutation(0)).toBe(true);
    expect(shouldRetryPlatformMutation(1)).toBe(false);
    expect(shouldRetryPlatformMutation(2)).toBe(false);
  });

  it('does not register decrypt-credentials as an Inngest step', () => {
    expect(PUBLISH_STEP_IDS).not.toContain('decrypt-credentials');
    expect(PUBLISH_STEP_IDS).toContain('dispatch-to-platform');
  });

  it('classifies adapter success without externalPostId as UNKNOWN_EXTERNAL_STATE', () => {
    expect(classifyAdapterSuccess({ externalPostId: undefined })).toEqual({
      kind: 'unknown_external_state',
      reason: 'Platform accepted the publish but returned no externalPostId',
      externalPostId: null,
      externalPostUrl: null,
    });
    expect(
      classifyAdapterSuccess({ externalPostId: '   ', externalPostUrl: 'https://x.test' })
    ).toEqual({
      kind: 'unknown_external_state',
      reason: 'Platform accepted the publish but returned no externalPostId',
      externalPostId: null,
      externalPostUrl: 'https://x.test',
    });
    expect(hasExternalPostId(null)).toBe(false);
    expect(shouldScheduleVerify(null)).toBe(false);
    expect(shouldScheduleVerify('')).toBe(false);
  });

  it('classifies adapter success with externalPostId as published and schedules verify', () => {
    expect(
      classifyAdapterSuccess({
        externalPostId: ' urn:li:share:1 ',
        externalPostUrl: 'https://linkedin.test/1',
      })
    ).toEqual({
      kind: 'success',
      externalPostId: 'urn:li:share:1',
      externalPostUrl: 'https://linkedin.test/1',
    });
    expect(shouldScheduleVerify('urn:li:share:1')).toBe(true);
  });

  it('never returns decrypted tokens from the mutation step result', async () => {
    const decrypt = vi.fn(() => ({
      accessToken: 'plaintext-oauth-token',
      refreshToken: 'plaintext-refresh',
    }));
    const publish = vi.fn().mockResolvedValue({
      status: 'SUCCEEDED',
      externalPostId: 'ext-1',
      externalPostUrl: 'https://example.test/p/1',
    });

    const result = await dispatchToPlatformOnce({
      isBlocked: () => null,
      getAdapter: () => ({ publish }),
      decryptCredentials: decrypt,
      buildPublishRequest: (accessToken) => ({
        idempotencyKey: 'outbox-1',
        metadata: { accessToken },
      }),
    });

    expect(decrypt).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      kind: 'success',
      externalPostId: 'ext-1',
      externalPostUrl: 'https://example.test/p/1',
    });
    expect(stepOutputContainsPlaintextSecret(result)).toBe(false);
    expect(result).not.toHaveProperty('accessToken');
    expect(result).not.toHaveProperty('refreshToken');
    expect(JSON.stringify(result)).not.toContain('plaintext-oauth-token');
  });

  it('does not retry adapter.publish after an unexpected error (unsure → UNKNOWN)', async () => {
    const publish = vi.fn().mockRejectedValue(new Error('socket hang up after accept'));

    const result = await dispatchToPlatformOnce({
      isBlocked: () => null,
      getAdapter: () => ({ publish }),
      decryptCredentials: () => ({ accessToken: 'tok' }),
      buildPublishRequest: (accessToken) => ({ metadata: { accessToken } }),
    });

    expect(publish).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      kind: 'unknown_external_state',
      reason: 'socket hang up after accept',
      externalPostId: null,
    });
    expect(shouldRetryPlatformMutation(1)).toBe(false);
  });

  it('returns typed PlatformError without throwing so Inngest will not replay the mutation', async () => {
    const publish = vi.fn().mockRejectedValue(
      new PlatformError({
        message: 'rate limited',
        code: 'RATE_LIMITED',
        retryable: true,
        retryAfterMs: 1000,
      })
    );

    const result = await dispatchToPlatformOnce({
      isBlocked: () => null,
      getAdapter: () => ({ publish }),
      decryptCredentials: () => ({ accessToken: 'tok' }),
      buildPublishRequest: (accessToken) => ({ metadata: { accessToken } }),
    });

    expect(result).toEqual({
      kind: 'failure',
      code: 'RATE_LIMITED',
      message: 'rate limited',
      retryable: true,
      retryAfterMs: 1000,
    });
    expect(stepOutputContainsPlaintextSecret(result)).toBe(false);
  });

  it('fails closed before publish is invoked (decrypt / missing adapter) without UNKNOWN', async () => {
    await expect(
      dispatchToPlatformOnce({
        isBlocked: () => null,
        getAdapter: () => null,
        decryptCredentials: () => ({ accessToken: 'tok' }),
        buildPublishRequest: (accessToken) => ({ metadata: { accessToken } }),
      })
    ).resolves.toEqual({
      kind: 'failure',
      code: 'NO_ADAPTER',
      message: 'No adapter registered for platform',
      retryable: false,
    });

    const decryptFailure = await dispatchToPlatformOnce({
      isBlocked: () => null,
      getAdapter: () => ({ publish: vi.fn() }),
      decryptCredentials: () => {
        throw new Error('bad envelope');
      },
      buildPublishRequest: (accessToken) => ({ metadata: { accessToken } }),
    });

    expect(decryptFailure).toEqual({
      kind: 'failure',
      code: 'PRE_PUBLISH_FAILURE',
      message: 'bad envelope',
      retryable: false,
    });
  });

  it('detects plaintext secret keys in step-shaped objects', () => {
    expect(stepOutputContainsPlaintextSecret({ kind: 'success', externalPostId: '1' })).toBe(false);
    expect(stepOutputContainsPlaintextSecret({ accessToken: 'secret' })).toBe(true);
    expect(stepOutputContainsPlaintextSecret({ metadata: { refreshToken: 'secret' } })).toBe(true);
  });
});
