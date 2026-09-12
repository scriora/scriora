import { assertSafeRemoteUrl } from './safe-remote-url.js';

const KNOWN_REMOTE_URL_KEYS = new Set([
  'articleUrl',
  'coverUrl',
  'linkAttachment',
  'avatarUrl',
  'link',
  'videoThumbnailUrl',
  'thumbnailUrl',
]);

function looksLikeRemoteUrl(value: string): boolean {
  return value.includes('://');
}

export function assertSafeOptionalRemoteUrl(value: string): void {
  if (!looksLikeRemoteUrl(value)) {
    return;
  }
  assertSafeRemoteUrl(value);
}

export function collectRemoteUrlCandidates(value: unknown, acc: string[] = []): string[] {
  if (typeof value === 'string') {
    if (looksLikeRemoteUrl(value)) {
      acc.push(value);
    }
    return acc;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectRemoteUrlCandidates(item, acc);
    }
    return acc;
  }
  if (!value || typeof value !== 'object') {
    return acc;
  }
  for (const [key, nested] of Object.entries(value)) {
    if (key === 'mediaUrls' || KNOWN_REMOTE_URL_KEYS.has(key)) {
      collectRemoteUrlCandidates(nested, acc);
      continue;
    }
    if (typeof nested === 'object' && nested !== null) {
      collectRemoteUrlCandidates(nested, acc);
    }
  }
  return acc;
}

export function assertSafePersistedRemoteUrls(input: {
  mediaUrls?: string[] | undefined;
  platformOptions?: unknown;
}): void {
  for (const url of input.mediaUrls ?? []) {
    assertSafeOptionalRemoteUrl(url);
  }
  for (const url of collectRemoteUrlCandidates(input.platformOptions)) {
    assertSafeRemoteUrl(url);
  }
}
