import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import {
  assertSafeRemoteUrl,
  coerceHostnameToIpv4,
  fetchSafeRemoteUrl,
  isBlockedIpAddress,
  readBoundedBuffer,
  resolveSafeRemoteUrl,
  UnsafeRemoteUrlError,
} from '../../src/security/safe-remote-url.js';

describe('safe-remote-url policy', () => {
  describe('assertSafeRemoteUrl', () => {
    it('allows https URLs with a public hostname', () => {
      const url = assertSafeRemoteUrl('https://cdn.example.com/media/photo.png');
      expect(url.protocol).toBe('https:');
      expect(url.hostname).toBe('cdn.example.com');
    });

    it('rejects file:// URLs', () => {
      expect(() => assertSafeRemoteUrl('file:///etc/passwd')).toThrow(UnsafeRemoteUrlError);
      expect(() => assertSafeRemoteUrl('file:///etc/passwd')).toThrow(/only https is permitted/);
    });

    it('rejects http:// and other non-https protocols', () => {
      expect(() => assertSafeRemoteUrl('http://cdn.example.com/img.png')).toThrow(
        /only https is permitted/
      );
      expect(() => assertSafeRemoteUrl('ftp://cdn.example.com/img.png')).toThrow(
        /only https is permitted/
      );
      expect(() => assertSafeRemoteUrl('gopher://cdn.example.com/1')).toThrow(
        /only https is permitted/
      );
    });

    it('rejects loopback, private, link-local, and metadata IPv4 literals', () => {
      const blocked = [
        'https://127.0.0.1/latest/meta-data',
        'https://10.0.0.5/secret',
        'https://192.168.1.10/admin',
        'https://172.16.0.2/internal',
        'https://169.254.169.254/latest/meta-data',
        'https://0.0.0.0/',
        'https://100.64.0.1/',
      ];

      for (const input of blocked) {
        expect(() => assertSafeRemoteUrl(input), input).toThrow(/blocked address/);
      }
    });

    it('rejects localhost and metadata hostnames', () => {
      expect(() => assertSafeRemoteUrl('https://localhost/admin')).toThrow(/hostname/);
      expect(() => assertSafeRemoteUrl('https://metadata.google.internal/')).toThrow(/hostname/);
      expect(() => assertSafeRemoteUrl('https://host.docker.internal/')).toThrow(/hostname/);
      expect(() => assertSafeRemoteUrl('https://something.local/img')).toThrow(/hostname/);
    });

    it('rejects IPv6 loopback and link-local literals', () => {
      expect(() => assertSafeRemoteUrl('https://[::1]/')).toThrow(/blocked address/);
      expect(() => assertSafeRemoteUrl('https://[fe80::1]/')).toThrow(/blocked address/);
    });

    it('rejects decimal and short-form IPv4 encodings of loopback', () => {
      expect(() => assertSafeRemoteUrl('https://2130706433/')).toThrow(/blocked address/);
      expect(() => assertSafeRemoteUrl('https://127.1/')).toThrow(/blocked address/);
    });

    it('rejects credentials and non-443 ports', () => {
      expect(() => assertSafeRemoteUrl('https://user:pass@cdn.example.com/img')).toThrow(
        /credentials/
      );
      expect(() => assertSafeRemoteUrl('https://cdn.example.com:8443/img')).toThrow(/port/);
    });

    it('rejects empty or invalid input', () => {
      expect(() => assertSafeRemoteUrl('')).toThrow(/required/);
      expect(() => assertSafeRemoteUrl('not a url')).toThrow(/valid absolute URL/);
    });
  });

  describe('isBlockedIpAddress / coerceHostnameToIpv4', () => {
    it('identifies private and metadata ranges', () => {
      expect(isBlockedIpAddress('127.0.0.1')).toBe(true);
      expect(isBlockedIpAddress('10.1.2.3')).toBe(true);
      expect(isBlockedIpAddress('169.254.169.254')).toBe(true);
      expect(isBlockedIpAddress('::1')).toBe(true);
      expect(isBlockedIpAddress('[::1]')).toBe(true);
      expect(isBlockedIpAddress('::ffff:127.0.0.1')).toBe(true);
      expect(isBlockedIpAddress('1.2.3.4')).toBe(false);
      expect(isBlockedIpAddress('8.8.8.8')).toBe(false);
    });

    it('coerces decimal and dotted SSRF encodings to IPv4', () => {
      expect(coerceHostnameToIpv4('2130706433')).toBe('127.0.0.1');
      expect(coerceHostnameToIpv4('127.1')).toBe('127.0.0.1');
      expect(coerceHostnameToIpv4('127.0.1')).toBe('127.0.0.1');
    });
  });

  describe('resolveSafeRemoteUrl', () => {
    it('fails closed when DNS resolves to a private or metadata address', async () => {
      await expect(
        resolveSafeRemoteUrl('https://evil.example.com/ssrf', {
          lookup: async () => [{ address: '169.254.169.254', family: 4 }],
        })
      ).rejects.toMatchObject({
        name: 'UnsafeRemoteUrlError',
        code: 'UNSAFE_REMOTE_URL',
      });

      await expect(
        resolveSafeRemoteUrl('https://evil.example.com/ssrf', {
          lookup: async () => [
            { address: '1.2.3.4', family: 4 },
            { address: '10.0.0.8', family: 4 },
          ],
        })
      ).rejects.toThrow(/blocked address/);
    });

    it('pins to a routable public address from DNS', async () => {
      const resolved = await resolveSafeRemoteUrl('https://cdn.example.com/img.png', {
        lookup: async () => [{ address: '1.2.3.4', family: 4 }],
      });

      expect(resolved.pinnedAddress).toBe('1.2.3.4');
      expect(resolved.addresses).toEqual(['1.2.3.4']);
      expect(resolved.url.hostname).toBe('cdn.example.com');
    });
  });

  describe('readBoundedBuffer', () => {
    it('rejects oversized Content-Length before reading', async () => {
      const source = Readable.from([Buffer.from('hello')]);
      await expect(
        readBoundedBuffer(source, { maxBytes: 4, timeoutMs: 1000, contentLength: 5 })
      ).rejects.toMatchObject({
        code: 'REMOTE_URL_TOO_LARGE',
      });
    });

    it('rejects a stream that exceeds maxBytes', async () => {
      const source = Readable.from([Buffer.from('abcd'), Buffer.from('efgh')]);
      await expect(
        readBoundedBuffer(source, { maxBytes: 6, timeoutMs: 1000 })
      ).rejects.toMatchObject({
        code: 'REMOTE_URL_TOO_LARGE',
      });
    });

    it('returns the concatenated buffer when within limits', async () => {
      const source = Readable.from([Buffer.from('ab'), Buffer.from('cd')]);
      const buffer = await readBoundedBuffer(source, { maxBytes: 16, timeoutMs: 1000 });
      expect(buffer.toString('utf8')).toBe('abcd');
    });

    it('times out when the stream stalls', async () => {
      const source = new Readable({
        read() {
          // never pushes data or ends
        },
      });

      await expect(
        readBoundedBuffer(source, { maxBytes: 1024, timeoutMs: 20 })
      ).rejects.toMatchObject({
        code: 'REMOTE_URL_TIMEOUT',
      });
    });
  });

  describe('fetchSafeRemoteUrl', () => {
    it('does not attempt a network fetch for file:// or private literals', async () => {
      await expect(fetchSafeRemoteUrl('file:///etc/passwd')).rejects.toMatchObject({
        code: 'UNSAFE_REMOTE_URL',
      });
      await expect(fetchSafeRemoteUrl('https://127.0.0.1/secrets')).rejects.toMatchObject({
        code: 'UNSAFE_REMOTE_URL',
      });
    });

    it('does not follow through when DNS is private even if a fetch is requested', async () => {
      await expect(
        fetchSafeRemoteUrl('https://cdn.example.com/img.png', {
          lookup: async () => [{ address: '192.168.0.5', family: 4 }],
        })
      ).rejects.toMatchObject({
        code: 'UNSAFE_REMOTE_URL',
      });
    });
  });
});
