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
