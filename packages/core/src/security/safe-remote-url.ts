import { lookup as dnsLookup } from 'node:dns/promises';
import https from 'node:https';
import { BlockList, isIP, isIPv4, isIPv6 } from 'node:net';
import type { Readable } from 'node:stream';
import { URL } from 'node:url';

export const DEFAULT_SAFE_FETCH_TIMEOUT_MS = 10_000;
export const DEFAULT_SAFE_FETCH_MAX_BYTES = 25 * 1024 * 1024;

export type SafeRemoteUrlErrorCode =
  | 'UNSAFE_REMOTE_URL'
  | 'REMOTE_URL_TIMEOUT'
  | 'REMOTE_URL_TOO_LARGE'
  | 'REMOTE_URL_REDIRECT_BLOCKED'
  | 'REMOTE_URL_FETCH_FAILED';

export class UnsafeRemoteUrlError extends Error {
  public readonly code: SafeRemoteUrlErrorCode;

  constructor(message: string, code: SafeRemoteUrlErrorCode = 'UNSAFE_REMOTE_URL') {
    super(message);
    this.name = 'UnsafeRemoteUrlError';
    this.code = code;
  }
}

export type SafeDnsLookup = (
  hostname: string
) => Promise<ReadonlyArray<{ address: string; family: 4 | 6 }>>;

export interface SafeRemoteUrlPolicy {
  timeoutMs: number;
  maxBytes: number;
  lookup?: SafeDnsLookup | undefined;
}

export interface ResolvedSafeRemoteUrl {
  url: URL;
  pinnedAddress: string;
  addresses: string[];
}

export interface SafeRemoteFetchResult {
  buffer: Buffer;
  contentType: string | undefined;
  statusCode: number;
}

const PRIVATE_NETWORKS = new BlockList();
PRIVATE_NETWORKS.addSubnet('0.0.0.0', 8, 'ipv4');
PRIVATE_NETWORKS.addSubnet('10.0.0.0', 8, 'ipv4');
PRIVATE_NETWORKS.addSubnet('100.64.0.0', 10, 'ipv4');
PRIVATE_NETWORKS.addSubnet('127.0.0.0', 8, 'ipv4');
PRIVATE_NETWORKS.addSubnet('169.254.0.0', 16, 'ipv4');
PRIVATE_NETWORKS.addSubnet('172.16.0.0', 12, 'ipv4');
PRIVATE_NETWORKS.addSubnet('192.0.0.0', 24, 'ipv4');
PRIVATE_NETWORKS.addSubnet('192.0.2.0', 24, 'ipv4');
PRIVATE_NETWORKS.addSubnet('192.168.0.0', 16, 'ipv4');
PRIVATE_NETWORKS.addSubnet('198.18.0.0', 15, 'ipv4');
PRIVATE_NETWORKS.addSubnet('198.51.100.0', 24, 'ipv4');
PRIVATE_NETWORKS.addSubnet('203.0.113.0', 24, 'ipv4');
PRIVATE_NETWORKS.addSubnet('224.0.0.0', 4, 'ipv4');
PRIVATE_NETWORKS.addSubnet('240.0.0.0', 4, 'ipv4');
PRIVATE_NETWORKS.addAddress('255.255.255.255', 'ipv4');

PRIVATE_NETWORKS.addAddress('::', 'ipv6');
PRIVATE_NETWORKS.addAddress('::1', 'ipv6');
PRIVATE_NETWORKS.addSubnet('fc00::', 7, 'ipv6');
PRIVATE_NETWORKS.addSubnet('fe80::', 10, 'ipv6');
PRIVATE_NETWORKS.addSubnet('ff00::', 8, 'ipv6');
PRIVATE_NETWORKS.addSubnet('2001:db8::', 32, 'ipv6');

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
  'metadata',
  'metadata.google.internal',
  'metadata.goog',
  'host.docker.internal',
  'kubernetes.default',
  'kubernetes.default.svc',
  'kubernetes.default.svc.cluster.local',
]);

const BLOCKED_HOSTNAME_SUFFIXES = [
  '.localhost',
  '.local',
  '.internal',
  '.localdomain',
  '.corp',
  '.home',
  '.lan',
];

function reject(message: string, code: SafeRemoteUrlErrorCode = 'UNSAFE_REMOTE_URL'): never {
  throw new UnsafeRemoteUrlError(message, code);
}

function parseIpv4Octet(part: string): number | null {
  if (!part) {
    return null;
  }
  if (/^0x[0-9a-f]+$/i.test(part)) {
    const value = Number.parseInt(part, 16);
    return Number.isFinite(value) ? value : null;
  }
  if (/^0[0-7]+$/.test(part)) {
    const value = Number.parseInt(part, 8);
    return Number.isFinite(value) ? value : null;
  }
  if (/^\d+$/.test(part)) {
    const value = Number.parseInt(part, 10);
    return Number.isFinite(value) ? value : null;
  }
  return null;
}

/**
 * Interprets decimal, dotted, octal, and hex IPv4 hostnames used in SSRF bypasses.
 * Returns a canonical dotted-quad or null when the hostname is not IPv4-shaped.
 */
export function coerceHostnameToIpv4(hostname: string): string | null {
  if (isIPv4(hostname)) {
    return hostname;
  }

  if (/^\d+$/.test(hostname)) {
    const n = Number(hostname);
    if (!Number.isSafeInteger(n) || n < 0 || n > 0xffffffff) {
      return null;
    }
    return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
  }

  if (!/^(?:0x[0-9a-f]+|\d+)(?:\.(?:0x[0-9a-f]+|\d+)){1,3}$/i.test(hostname)) {
    return null;
  }

  const parts = hostname.split('.');
  const nums = parts.map(parseIpv4Octet);
  if (nums.some((n) => n === null)) {
    return null;
  }

  const values = nums as number[];
  if (values.some((n) => n < 0)) {
    return null;
  }

  if (values.length === 2) {
    const [a, b] = values;
    if (a === undefined || b === undefined || a > 255 || b > 0xffffff) {
      return null;
    }
    return [a, (b >>> 16) & 255, (b >>> 8) & 255, b & 255].join('.');
  }

  if (values.length === 3) {
    const [a, b, c] = values;
    if (a === undefined || b === undefined || c === undefined || a > 255 || b > 255 || c > 0xffff) {
      return null;
    }
    return [a, b, (c >>> 8) & 255, c & 255].join('.');
  }

  if (values.length === 4) {
    if (values.some((n) => n > 255)) {
      return null;
    }
    return values.join('.');
  }

  return null;
}

export function unwrapIpv6Hostname(hostname: string): string {
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    return hostname.slice(1, -1);
  }
  return hostname;
}

export function isBlockedIpAddress(address: string): boolean {
  const normalized = unwrapIpv6Hostname(address.trim().toLowerCase());
  if (!normalized) {
    return true;
  }

  if (isIPv4(normalized)) {
    return PRIVATE_NETWORKS.check(normalized, 'ipv4');
  }

  if (isIPv6(normalized)) {
    const mapped = normalized.match(/^:?:ffff:(\d+\.\d+\.\d+\.\d+)$/i);
    if (mapped?.[1] && isBlockedIpAddress(mapped[1])) {
      return true;
    }
    const mappedHex = normalized.match(/^:?:ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
    if (mappedHex?.[1] && mappedHex[2]) {
      const hi = Number.parseInt(mappedHex[1], 16);
      const lo = Number.parseInt(mappedHex[2], 16);
      const v4 = `${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`;
      if (isBlockedIpAddress(v4)) {
        return true;
      }
    }
    return PRIVATE_NETWORKS.check(normalized, 'ipv6');
  }

  const coerced = coerceHostnameToIpv4(normalized);
  if (coerced) {
    return isBlockedIpAddress(coerced);
  }

  return true;
}

function isBlockedHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/, '');
  if (!host || BLOCKED_HOSTNAMES.has(host)) {
    return true;
  }
  return BLOCKED_HOSTNAME_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

function parseHttpsUrl(input: string): URL {
  if (typeof input !== 'string' || input.trim().length === 0) {
    reject('Remote URL is required');
  }

  const trimmed = input.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    reject('Remote URL is not a valid absolute URL');
  }

  if (parsed.protocol !== 'https:') {
    reject(`Remote URL protocol '${parsed.protocol}' is not allowed; only https is permitted`);
  }

  if (parsed.username || parsed.password) {
    reject('Remote URL must not include credentials');
  }

  if (!parsed.hostname) {
    reject('Remote URL must include a hostname');
  }

  const port = parsed.port === '' ? 443 : Number.parseInt(parsed.port, 10);
  if (port !== 443) {
    reject(`Remote URL port ${port} is not allowed; only 443 is permitted`);
  }

  return parsed;
}

/**
 * Fail-closed syntactic allowlist. Does not resolve DNS.
 * Call resolveSafeRemoteUrl / fetchSafeRemoteUrl before performing I/O.
 */
export function assertSafeRemoteUrl(input: string): URL {
  const url = parseHttpsUrl(input);
  const hostname = unwrapIpv6Hostname(url.hostname);

  if (isBlockedHostname(hostname)) {
    reject(`Remote URL hostname '${hostname}' is not allowed`);
  }

  if (isIP(hostname) && isBlockedIpAddress(hostname)) {
    reject(`Remote URL resolves to a blocked address (${hostname})`);
  }

  const coercedIpv4 = coerceHostnameToIpv4(hostname);
  if (coercedIpv4 && isBlockedIpAddress(coercedIpv4)) {
    reject(`Remote URL resolves to a blocked address (${coercedIpv4})`);
  }

  return url;
}

async function defaultLookup(hostname: string): Promise<Array<{ address: string; family: 4 | 6 }>> {
  const records = await dnsLookup(hostname, { all: true, verbatim: true });
  return records.map((record) => ({
    address: record.address,
    family: record.family === 6 ? 6 : 4,
  }));
}

export async function resolveSafeRemoteUrl(
  input: string,
  policy: Partial<SafeRemoteUrlPolicy> = {}
): Promise<ResolvedSafeRemoteUrl> {
  const url = assertSafeRemoteUrl(input);
  const hostname = unwrapIpv6Hostname(url.hostname);

  if (isIP(hostname)) {
    if (isBlockedIpAddress(hostname)) {
      reject(`Remote URL resolves to a blocked address (${hostname})`);
    }
    return { url, pinnedAddress: hostname, addresses: [hostname] };
  }

  const coercedIpv4 = coerceHostnameToIpv4(hostname);
  if (coercedIpv4) {
    if (isBlockedIpAddress(coercedIpv4)) {
      reject(`Remote URL resolves to a blocked address (${coercedIpv4})`);
    }
    return { url, pinnedAddress: coercedIpv4, addresses: [coercedIpv4] };
  }

  let records: ReadonlyArray<{ address: string; family: 4 | 6 }>;
  try {
    records = await (policy.lookup ?? defaultLookup)(hostname);
  } catch (err: unknown) {
    reject(
      `Failed to resolve remote URL hostname '${hostname}': ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (!records || records.length === 0) {
    reject(`Remote URL hostname '${hostname}' did not resolve to any addresses`);
  }

  const addresses = records.map((record) => record.address);
  const blocked = addresses.filter((address) => isBlockedIpAddress(address));
  if (blocked.length > 0) {
    reject(`Remote URL hostname '${hostname}' resolved to a blocked address (${blocked[0]})`);
  }

  const pinnedAddress = addresses[0];
  if (!pinnedAddress) {
    reject(`Remote URL hostname '${hostname}' did not resolve to any addresses`);
  }

  return { url, pinnedAddress, addresses };
}

export async function readBoundedBuffer(
  source: Readable,
  options: {
    maxBytes: number;
    timeoutMs: number;
    contentLength?: number | undefined;
  }
): Promise<Buffer> {
  if (options.maxBytes <= 0) {
    source.destroy();
    throw new UnsafeRemoteUrlError(
      'Remote fetch maximum size must be positive',
      'REMOTE_URL_TOO_LARGE'
    );
  }

  if (
    options.contentLength !== undefined &&
    Number.isFinite(options.contentLength) &&
    options.contentLength > options.maxBytes
  ) {
    source.destroy();
    throw new UnsafeRemoteUrlError(
      `Remote response exceeds maximum size of ${options.maxBytes} bytes`,
      'REMOTE_URL_TOO_LARGE'
    );
  }

  return await new Promise<Buffer>((resolve, rejectPromise) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let settled = false;

    const finish = (error?: Error, result?: Buffer) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      source.removeAllListeners();
      if (error) {
        source.destroy();
        rejectPromise(error);
        return;
      }
      resolve(result ?? Buffer.alloc(0));
    };

    const timer = setTimeout(() => {
      finish(
        new UnsafeRemoteUrlError(
          `Remote fetch timed out after ${options.timeoutMs}ms`,
          'REMOTE_URL_TIMEOUT'
        )
      );
    }, options.timeoutMs);

    source.on('data', (chunk: Buffer | string) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buf.length;
      if (total > options.maxBytes) {
        finish(
          new UnsafeRemoteUrlError(
            `Remote response exceeds maximum size of ${options.maxBytes} bytes`,
            'REMOTE_URL_TOO_LARGE'
          )
        );
        return;
      }
      chunks.push(buf);
    });
    source.on('end', () => finish(undefined, Buffer.concat(chunks, total)));
    source.on('error', (err: Error) => {
      finish(
        err instanceof UnsafeRemoteUrlError
          ? err
          : new UnsafeRemoteUrlError(
              `Remote fetch failed: ${err.message}`,
              'REMOTE_URL_FETCH_FAILED'
            )
      );
    });
  });
}

function parseContentLength(header: string | string[] | undefined): number | undefined {
  if (typeof header !== 'string') {
    return undefined;
  }
  const value = Number.parseInt(header, 10);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

export async function fetchSafeRemoteUrl(
  input: string,
  policy: Partial<SafeRemoteUrlPolicy> = {}
): Promise<SafeRemoteFetchResult> {
  const timeoutMs = policy.timeoutMs ?? DEFAULT_SAFE_FETCH_TIMEOUT_MS;
  const maxBytes = policy.maxBytes ?? DEFAULT_SAFE_FETCH_MAX_BYTES;
  const resolved = await resolveSafeRemoteUrl(input, policy);

  return await new Promise<SafeRemoteFetchResult>((resolve, rejectPromise) => {
    const request = https.request(
      {
        protocol: 'https:',
        hostname: resolved.pinnedAddress,
        port: 443,
        path: `${resolved.url.pathname}${resolved.url.search}`,
        method: 'GET',
        headers: {
          Host: resolved.url.hostname,
          Accept: '*/*',
          'User-Agent': 'Scriora-SafeFetch/1.0',
        },
        servername: resolved.url.hostname,
        timeout: timeoutMs,
      },
      (response) => {
        const statusCode = response.statusCode ?? 0;
        if (statusCode >= 300 && statusCode < 400) {
          response.resume();
          rejectPromise(
            new UnsafeRemoteUrlError(
              'Remote fetch redirected; redirects are not followed',
              'REMOTE_URL_REDIRECT_BLOCKED'
            )
          );
          return;
        }

        if (statusCode < 200 || statusCode >= 300) {
          response.resume();
          rejectPromise(
            new UnsafeRemoteUrlError(
              `Remote fetch failed with HTTP ${statusCode}`,
              'REMOTE_URL_FETCH_FAILED'
            )
          );
          return;
        }

        const contentTypeHeader = response.headers['content-type'];
        const contentType = Array.isArray(contentTypeHeader)
          ? contentTypeHeader[0]
          : contentTypeHeader;

        void readBoundedBuffer(response, {
          maxBytes,
          timeoutMs,
          contentLength: parseContentLength(response.headers['content-length']),
        })
          .then((buffer) => {
            resolve({
              buffer,
              contentType,
              statusCode,
            });
          })
          .catch((err: unknown) => {
            rejectPromise(err instanceof Error ? err : new Error(String(err)));
          });
      }
    );

    request.on('timeout', () => {
      request.destroy(
        new UnsafeRemoteUrlError(
          `Remote fetch timed out after ${timeoutMs}ms`,
          'REMOTE_URL_TIMEOUT'
        )
      );
    });

    request.on('error', (err) => {
      if (err instanceof UnsafeRemoteUrlError) {
        rejectPromise(err);
        return;
      }
      rejectPromise(
        new UnsafeRemoteUrlError(`Remote fetch failed: ${err.message}`, 'REMOTE_URL_FETCH_FAILED')
      );
    });

    request.end();
  });
}
