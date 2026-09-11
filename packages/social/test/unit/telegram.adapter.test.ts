import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TelegramAdapter } from '../../src/platforms/telegram/telegram.adapter.js';

vi.mock('axios');
const mockedAxios = vi.mocked(axios, true);

describe('TelegramAdapter Unit Tests', () => {
  let adapter: TelegramAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new TelegramAdapter();
  });

  describe('Capabilities', () => {
    it('declares Telegram capabilities', () => {
      const caps = adapter.getCapabilities();
      expect(caps.supportsText).toBe(true);
      expect(caps.supportsImage).toBe(true);
      expect(caps.maxTextLength).toBe(4096);
    });
  });

  describe('Publishing', () => {
    it('throws if bot token is missing', async () => {
      await expect(
        adapter.publish({
          workspaceId: 'ws-1',
          accountId: '@mychannel',
          text: 'Hello Telegram',
          mediaUrls: [],
          idempotencyKey: 'k1',
          fingerprint: 'f1',
          metadata: {},
        })
      ).rejects.toThrow('Missing Telegram bot token');
    });

    it('publishes text message successfully', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          ok: true,
          result: {
            message_id: 101,
            chat: { id: -1001234567, username: 'testchannel' },
          },
        },
      });

      const res = await adapter.publish({
        workspaceId: 'ws-1',
        accountId: '@testchannel',
        text: '<b>Bold News</b> from Scriora!',
        mediaUrls: [],
        idempotencyKey: 'k2',
        fingerprint: 'f2',
        metadata: { botToken: 'test_token_123' },
      });

      expect(res.status).toBe('SUCCEEDED');
      expect(res.externalPostId).toBe('tg_@testchannel_101');
      expect(res.externalPostUrl).toBe('https://t.me/testchannel/101');
    });

    it('publishes single photo message', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          ok: true,
          result: {
            message_id: 102,
            chat: { id: 123456 },
          },
        },
      });

      const res = await adapter.publish({
        workspaceId: 'ws-1',
        accountId: '123456',
        text: 'Photo caption',
        mediaUrls: ['https://example.com/image.png'],
        idempotencyKey: 'k3',
        fingerprint: 'f3',
        metadata: { botToken: 'test_token_123' },
      });

      expect(res.status).toBe('SUCCEEDED');
      expect(res.externalPostId).toBe('tg_123456_102');
    });

    it('deletes message via deleteMessage endpoint', async () => {
      mockedAxios.post.mockResolvedValueOnce({ data: { ok: true, result: true } });
      const deleted = await adapter.deletePost('tg_@testchannel_101', 'test_token_123');
      expect(deleted).toBe(true);
    });
  });

  describe('Verification', () => {
    it('verifies valid telegram message ID', async () => {
      expect(await adapter.verify('tg_123_456')).toBe(true);
      expect(await adapter.verify('123456')).toBe(true);
      expect(await adapter.verify('')).toBe(false);
    });
  });
});
