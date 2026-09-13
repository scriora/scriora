/**
 * Magic-link delivery hook.
 *
 * Production must not return the raw token in the HTTP body. Set
 * MAGIC_LINK_MAILER_URL to a mailer/webhook that accepts JSON
 * `{ email, url, expiresAt }`. Failures are logged; the token is still
 * persisted so an operator can resend.
 */

export type MagicLinkDelivery = {
  email: string;
  url: string;
  expiresAt: Date;
};

export function buildMagicLinkVerifyUrl(
  token: string,
  env: NodeJS.ProcessEnv = process.env
): string {
  const configuredOrigin = env.API_URL?.trim();
  if (!configuredOrigin && env.NODE_ENV === 'production') {
    throw new Error('API_URL is required in production to generate magic links');
  }

  const rawOrigin = configuredOrigin || 'http://localhost:4000';
  let origin: URL;
  try {
    origin = new URL(rawOrigin);
  } catch {
    throw new Error('API_URL must be a valid absolute URL');
  }
  if (origin.protocol !== 'http:' && origin.protocol !== 'https:') {
    throw new Error('API_URL must use http or https');
  }

  const verifyUrl = new URL('/v1/auth/verify', origin);
  verifyUrl.searchParams.set('token', token);
  return verifyUrl.toString();
}

export async function deliverMagicLink(delivery: MagicLinkDelivery): Promise<'hook' | 'note'> {
  const hookUrl = process.env.MAGIC_LINK_MAILER_URL?.trim();
  if (!hookUrl) {
    // biome-ignore lint/suspicious/noConsole: explicit operator note when no mailer is configured
    console.info(
      `[auth] Magic link generated for ${delivery.email}. Set MAGIC_LINK_MAILER_URL to send it.`
    );
    return 'note';
  }

  try {
    const response = await fetch(hookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: delivery.email,
        url: delivery.url,
        expiresAt: delivery.expiresAt.toISOString(),
      }),
    });
    if (!response.ok) {
      // biome-ignore lint/suspicious/noConsole: mailer hook failure is operational
      console.warn(`[auth] MAGIC_LINK_MAILER_URL responded ${response.status}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.name : 'unknown';
    // biome-ignore lint/suspicious/noConsole: mailer hook failure is operational
    console.warn(`[auth] MAGIC_LINK_MAILER_URL request failed (${message})`);
  }
  return 'hook';
}
