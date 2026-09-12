/**
 * Verification CAS: never downgrade a successful PUBLISHED row to
 * UNKNOWN_EXTERNAL_STATE on a transient or unauthenticated probe failure.
 */

export type VerifyProbe =
  | { kind: 'live' }
  | { kind: 'not_live' }
  | { kind: 'transient'; reason: string };

export const STATUSES_ELIGIBLE_FOR_VERIFY_UNKNOWN = [
  'DRAFT',
  'SCHEDULED',
  'READY',
  'PROCESSING',
  'REQUIRES_APPROVAL',
] as const;

export type VerifyPublicationClient = {
  publication: {
    updateMany: (args: {
      where: {
        id: string;
        status?: { in: readonly string[] } | { not: string };
      };
      data: { status: string };
    }) => Promise<{ count: number }>;
  };
  publishAttempt: {
    update: (args: {
      where: { id: string };
      data: { status: string; completedAt: Date };
    }) => Promise<unknown>;
  };
  $transaction: (ops: unknown[]) => Promise<unknown>;
};

export type ApplyVerificationOutcome = {
  outcome: 'CONFIRMED_LIVE' | 'MARKED_UNKNOWN' | 'PRESERVED_PUBLISHED' | 'TRANSIENT_NOOP';
  publicationUpdated: boolean;
};

export async function probePublicationLive(input: {
  externalPostId: string;
  platform: string;
  accessToken?: string | undefined;
  hasAdapter: (platform: string) => boolean;
  getAdapter: (platform: string) => {
    verify: (externalPostId: string, accessToken?: string) => Promise<boolean>;
  };
}): Promise<VerifyProbe> {
  if (!input.hasAdapter(input.platform)) {
    return { kind: 'transient', reason: 'UNKNOWN_PLATFORM' };
  }

  try {
    const live = await input
      .getAdapter(input.platform)
      .verify(input.externalPostId, input.accessToken);
    return live ? { kind: 'live' } : { kind: 'not_live' };
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : 'VERIFY_FAILED';
    return { kind: 'transient', reason };
  }
}

export function resolveVerifyAccessToken(input: {
  envelopeData?: unknown;
  decrypt: (envelopeData: unknown) => { accessToken: string };
}): string | undefined {
  if (input.envelopeData === undefined || input.envelopeData === null) {
    return undefined;
  }
  try {
    const token = input.decrypt(input.envelopeData).accessToken;
    return token.trim() ? token : undefined;
  } catch {
    return undefined;
  }
}

export async function applyVerificationOutcome(
  db: VerifyPublicationClient,
  input: {
    publicationId: string;
    probe: VerifyProbe;
    latestAttemptId?: string | undefined;
  },
  now = new Date()
): Promise<ApplyVerificationOutcome> {
  if (input.probe.kind === 'transient') {
    return { outcome: 'TRANSIENT_NOOP', publicationUpdated: false };
  }

  if (input.probe.kind === 'live') {
    const ops: unknown[] = [
      db.publication.updateMany({
        where: { id: input.publicationId, status: { not: 'CANCELLED' } },
        data: { status: 'PUBLISHED' },
      }),
    ];
    if (input.latestAttemptId) {
      ops.push(
        db.publishAttempt.update({
          where: { id: input.latestAttemptId },
          data: { status: 'SUCCEEDED', completedAt: now },
        })
      );
    }
    await db.$transaction(ops);
    return { outcome: 'CONFIRMED_LIVE', publicationUpdated: true };
  }

  const unknownUpdate = db.publication.updateMany({
    where: {
      id: input.publicationId,
      status: { in: STATUSES_ELIGIBLE_FOR_VERIFY_UNKNOWN },
    },
    data: { status: 'UNKNOWN_EXTERNAL_STATE' },
  });

  const unknownResult = await unknownUpdate;
  if (unknownResult.count === 0) {
    return { outcome: 'PRESERVED_PUBLISHED', publicationUpdated: false };
  }

  if (input.latestAttemptId) {
    await db.publishAttempt.update({
      where: { id: input.latestAttemptId },
      data: { status: 'UNKNOWN_EXTERNAL_STATE', completedAt: now },
    });
  }

  return { outcome: 'MARKED_UNKNOWN', publicationUpdated: true };
}
