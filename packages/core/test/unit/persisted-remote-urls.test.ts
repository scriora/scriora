import { describe, expect, it } from 'vitest';
import { UnsafeRemoteUrlError } from '../../src/security/safe-remote-url.js';
import {
  assertSafePersistedRemoteUrls,
  collectRemoteUrlCandidates,
} from '../../src/security/persisted-remote-urls.js';

describe('assertSafePersistedRemoteUrls', () => {
  it('allows https media URLs and skips storage keys', () => {
    expect(() =>
      assertSafePersistedRemoteUrls({
        mediaUrls: ['https://cdn.example.com/a.png', 'media-asset-uuid'],
        platformOptions: { visibility: 'PUBLIC' },
      })
    ).not.toThrow();
  });

  it('collects nested platform option URLs', () => {
    expect(
      collectRemoteUrlCandidates({
        platform: 'YOUTUBE',
        options: { thumbnailUrl: 'https://cdn.example.com/thumb.jpg' },
      })
    ).toEqual(['https://cdn.example.com/thumb.jpg']);
  });

  it('rejects loopback and file URLs in platform options', () => {
    expect(() =>
      assertSafePersistedRemoteUrls({
        platformOptions: { thumbnailUrl: 'http://127.0.0.1/x' },
      })
    ).toThrow(UnsafeRemoteUrlError);
  });
});
