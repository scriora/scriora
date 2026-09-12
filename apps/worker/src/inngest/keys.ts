export type InngestKeyResolution = {
  eventKey: string;
  signingKey: string | undefined;
};

export function resolveInngestKeys(env: NodeJS.ProcessEnv = process.env): InngestKeyResolution {
  const isProduction = env.NODE_ENV === 'production';
  const eventKey = env.INNGEST_EVENT_KEY;
  const signingKey = env.INNGEST_SIGNING_KEY;

  if (!eventKey) {
    if (isProduction) {
      throw new Error(
        'INNGEST_EVENT_KEY environment variable is required in production environment'
      );
    }
    // biome-ignore lint/suspicious/noConsole: development fallback warning required by specification
    console.warn(
      '[Inngest] WARNING: INNGEST_EVENT_KEY is missing. Falling back to development key "dev-local-key". Do NOT use in production.'
    );
  }

  if (!signingKey) {
    if (isProduction) {
      throw new Error(
        'INNGEST_SIGNING_KEY environment variable is required in production environment'
      );
    }
    // biome-ignore lint/suspicious/noConsole: development fallback warning
    console.warn(
      '[Inngest] WARNING: INNGEST_SIGNING_KEY is missing. Webhook signature verification is disabled. Do NOT use in production.'
    );
  }

  return {
    eventKey: eventKey ?? 'dev-local-key',
    signingKey: signingKey || undefined,
  };
}
