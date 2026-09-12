import crypto from 'node:crypto';

export type MetaSignedRequestPayload = {
  user_id?: string;
  issued_at?: number;
  [key: string]: unknown;
};

function resolveMetaAppSecret(env: NodeJS.ProcessEnv = process.env): string | null {
  const secret =
    env.META_APP_SECRET?.trim() ||
    env.FACEBOOK_APP_SECRET?.trim() ||
    env.INSTAGRAM_APP_SECRET?.trim();
  return secret || null;
}

function decodeBase64Url(input: string): Buffer {
  return Buffer.from(input, 'base64url');
}

/**
 * Verify a Meta `signed_request` (HMAC-SHA256 of the payload with the app secret).
 * Returns null when the secret is missing or the signature does not match.
 */
export function parseMetaSignedRequest(
  signedRequest: string,
  env: NodeJS.ProcessEnv = process.env
): MetaSignedRequestPayload | null {
  const appSecret = resolveMetaAppSecret(env);
  if (!appSecret) {
    return null;
  }
  const [encodedSig, encodedPayload] = signedRequest.split('.');
  if (!encodedSig || !encodedPayload) {
    return null;
  }

  const expected = crypto.createHmac('sha256', appSecret).update(encodedPayload).digest();
  const actual = decodeBase64Url(encodedSig);
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(decodeBase64Url(encodedPayload).toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    return parsed as MetaSignedRequestPayload;
  } catch {
    return null;
  }
}

export function buildMetaSignedRequestForTest(
  payload: MetaSignedRequestPayload,
  appSecret: string
): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const encodedSig = crypto
    .createHmac('sha256', appSecret)
    .update(encodedPayload)
    .digest('base64url');
  return `${encodedSig}.${encodedPayload}`;
}
