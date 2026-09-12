import { describe, expect, it } from 'vitest';
import {
  buildMetaSignedRequestForTest,
  parseMetaSignedRequest,
} from '../../src/lib/meta-signed-request.js';

describe('parseMetaSignedRequest', () => {
  const secret = 'meta-app-secret-for-tests';

  it('accepts a valid HMAC-SHA256 signed_request', () => {
    const signed = buildMetaSignedRequestForTest({ user_id: 'meta-user-1' }, secret);
    expect(parseMetaSignedRequest(signed, { META_APP_SECRET: secret })).toEqual({
      user_id: 'meta-user-1',
    });
  });

  it('rejects a tampered payload', () => {
    const signed = buildMetaSignedRequestForTest({ user_id: 'meta-user-1' }, secret);
    const tampered = `${signed.slice(0, 8)}xxxx${signed.slice(12)}`;
    expect(parseMetaSignedRequest(tampered, { META_APP_SECRET: secret })).toBeNull();
  });

  it('rejects when no app secret is configured', () => {
    const signed = buildMetaSignedRequestForTest({ user_id: 'meta-user-1' }, secret);
    expect(parseMetaSignedRequest(signed, {})).toBeNull();
  });
});
