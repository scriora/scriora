import { PlatformError } from 'scriora-social';

/**
 * Inngest v4 applies `createFunction({ retries })` independently to every
 * `step.run`. There is no per-step maxAttempts. `retries: 0` is one attempt.
 *
 * The platform mutation must not be replayed after a possible accept — rely
 * on adapter idempotencyKey / UNKNOWN_EXTERNAL_STATE when unsure.
 */
export const PLATFORM_MUTATION_MAX_ATTEMPTS = 1;
/** Inngest `retries` is additional attempts; 0 means maxAttempts=1. */
export const PUBLISH_JOB_RETRIES = 0;

export const PUBLISH_JOB_OPTIONS = {
  id: 'publish-social-post',
  name: 'Publish Social Post via Transactional Outbox',
  retries: 0,
} as const;

export const PUBLICATION_REQUESTED_EVENT = 'scriora/publication.requested';

/** Step ids used by publish.job. Decrypt is not a step — tokens must not be checkpointed. */
export const PUBLISH_STEP_IDS = [
  'fetch-outbox-record',
  'claim-outbox',
  'handle-invalid-account',
  'handle-missing-credentials',
  'dispatch-to-platform',
  'abort-blocked-dispatch',
  'record-success',
  'record-unknown-external-state',
  'record-failure',
  'wait-for-platform-ingest',
  'trigger-verification',
] as const;

export const SECRET_STEP_OUTPUT_KEYS = [
  'accessToken',
  'refreshToken',
  'access_token',
  'refresh_token',
  'botToken',
  'bot_token',
] as const;

export type PlatformDispatchStepResult =
  | { kind: 'aborted'; reason: string }
  | {
      kind: 'success';
      externalPostId: string;
      externalPostUrl?: string | null;
    }
  | {
      kind: 'unknown_external_state';
      reason: string;
      externalPostId: null;
      externalPostUrl?: string | null;
    }
  | {
      kind: 'failure';
      code: string;
      message: string;
      retryable: boolean;
      retryAfterMs?: number;
    };

export function shouldRetryPlatformMutation(attemptNumber: number): boolean {
  return attemptNumber < PLATFORM_MUTATION_MAX_ATTEMPTS;
}

export function hasExternalPostId(
  externalPostId: string | null | undefined
): externalPostId is string {
  return typeof externalPostId === 'string' && externalPostId.trim().length > 0;
}

export function classifyAdapterSuccess(result: {
  externalPostId?: string | null | undefined;
  externalPostUrl?: string | null | undefined;
}): Extract<PlatformDispatchStepResult, { kind: 'success' | 'unknown_external_state' }> {
  const externalPostId = result.externalPostId?.trim() || null;
  const externalPostUrl = result.externalPostUrl ?? null;

  if (!hasExternalPostId(externalPostId)) {
    return {
      kind: 'unknown_external_state',
      reason: 'Platform accepted the publish but returned no externalPostId',
      externalPostId: null,
      externalPostUrl,
    };
  }

  return {
    kind: 'success',
    externalPostId,
    externalPostUrl,
  };
}

export function shouldScheduleVerify(externalPostId: string | null | undefined): boolean {
  return hasExternalPostId(externalPostId);
}

export function stepOutputContainsPlaintextSecret(value: unknown): boolean {
  if (value == null) {
    return false;
  }
  if (Array.isArray(value)) {
    return value.some(stepOutputContainsPlaintextSecret);
  }
  if (typeof value !== 'object') {
    return false;
  }

  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if ((SECRET_STEP_OUTPUT_KEYS as readonly string[]).includes(key)) {
      return true;
    }
    if (stepOutputContainsPlaintextSecret(nested)) {
      return true;
    }
  }
  return false;
}

export type PlatformDispatchDeps<TRequest, TPublishResult> = {
  isBlocked: () => { reason: string } | null | Promise<{ reason: string } | null>;
  getAdapter: () => { publish: (request: TRequest) => Promise<TPublishResult> } | null;
  decryptCredentials: () => { accessToken: string };
  buildPublishRequest: (accessToken: string) => TRequest;
};

/**
 * Single-attempt platform mutation. Decrypts inside the call so the access
 * token is never returned (and therefore never persisted as Inngest step state).
 * Never throws after `adapter.publish` is invoked — unexpected errors become
 * UNKNOWN_EXTERNAL_STATE instead of a retriable step failure.
 */
export async function dispatchToPlatformOnce<
  TRequest,
  TPublishResult extends {
    externalPostId?: string | null | undefined;
    externalPostUrl?: string | null | undefined;
  },
>(deps: PlatformDispatchDeps<TRequest, TPublishResult>): Promise<PlatformDispatchStepResult> {
  const blocked = await deps.isBlocked();
  if (blocked) {
    return { kind: 'aborted', reason: blocked.reason };
  }

  const adapter = deps.getAdapter();
  if (!adapter) {
    return {
      kind: 'failure',
      code: 'NO_ADAPTER',
      message: 'No adapter registered for platform',
      retryable: false,
    };
  }

  let publishInvoked = false;
  try {
    const decrypted = deps.decryptCredentials();
    const request = deps.buildPublishRequest(decrypted.accessToken);
    publishInvoked = true;
    const result = await adapter.publish(request);
    return classifyAdapterSuccess(result);
  } catch (err: unknown) {
    if (!publishInvoked) {
      return {
        kind: 'failure',
        code: 'PRE_PUBLISH_FAILURE',
        message: err instanceof Error ? err.message : String(err),
        retryable: false,
      };
    }

    if (err instanceof PlatformError) {
      return {
        kind: 'failure',
        code: err.code,
        message: err.message,
        retryable: err.retryable,
        ...(err.retryAfterMs !== undefined ? { retryAfterMs: err.retryAfterMs } : {}),
      };
    }

    return {
      kind: 'unknown_external_state',
      reason: err instanceof Error ? err.message : String(err),
      externalPostId: null,
    };
  }
}
