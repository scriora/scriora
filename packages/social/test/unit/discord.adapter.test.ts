import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DiscordAdapter } from '../../src/platforms/discord/discord.adapter.js';
import { MockDiscordAdapter } from '../../src/platforms/discord/mock.adapter.js';

vi.mock('axios');
const mockedAxios = vi.mocked(axios, true);

describe('DiscordAdapter Unit Tests', () => {
  let adapter: DiscordAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new DiscordAdapter();
  });

  describe('Capabilities', () => {
    it('declares Discord capabilities', () => {
      const caps = adapter.getCapabilities();
      expect(caps.supportsText).toBe(true);
      expect(caps.supportsImage).toBe(true);
      expect(caps.supportsVideo).toBe(true);
      expect(caps.supportsWebhooks).toBe(true);
      expect(caps.supportsScheduling).toBe(true);
      expect(caps.maxTextLength).toBe(2000);
    });
  });

  describe('Validation & Credentials', () => {
    it('throws MISSING_DISCORD_CREDENTIALS if neither webhook nor botToken is provided', async () => {
      await expect(
        adapter.publish({
          workspaceId: '550e8400-e29b-41d4-a716-446655440000',
          accountId: 'discord-channel-1',
          text: 'Hello Discord!',
          mediaUrls: [],
          idempotencyKey: 'idem-1',
          fingerprint: 'a'.repeat(64),
          metadata: {},
        })
      ).rejects.toThrow('Missing Discord destination');
    });

    it('throws EMPTY_DISCORD_PAYLOAD if text and media/embeds are empty', async () => {
      await expect(
        adapter.publish({
          workspaceId: '550e8400-e29b-41d4-a716-446655440000',
          accountId: 'channel-1',
          text: '',
          mediaUrls: [],
          idempotencyKey: 'idem-2',
          fingerprint: 'b'.repeat(64),
          metadata: {
            webhookUrl: 'https://discord.com/api/webhooks/123/abc',
          },
        })
      ).rejects.toThrow('Discord message must have either text content');
    });
  });

  describe('Webhook Publishing', () => {
    it('publishes a text message via webhook URL successfully', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          id: '123456789012345678',
          channel_id: '987654321098765432',
          content: 'Hello via Webhook!',
        },
      });

      const res = await adapter.publish({
        workspaceId: '550e8400-e29b-41d4-a716-446655440000',
        accountId: 'acc-1',
        text: 'Hello via Webhook!',
        mediaUrls: [],
        idempotencyKey: 'idem-3',
        fingerprint: 'c'.repeat(64),
        metadata: {
          webhookUrl: 'https://discord.com/api/webhooks/123/token_abc',
          username: 'Scriora Announcer',
          avatarUrl: 'https://example.com/avatar.png',
        },
      });

      expect(res.status).toBe('SUCCEEDED');
      expect(res.externalPostId).toBe('123456789012345678');
      expect(res.externalPostUrl).toContain('987654321098765432/123456789012345678');
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://discord.com/api/webhooks/123/token_abc?wait=true',
        expect.objectContaining({
          content: 'Hello via Webhook!',
          username: 'Scriora Announcer',
          avatar_url: 'https://example.com/avatar.png',
        }),
        expect.any(Object)
      );
    });

    it('publishes rich embed with custom color and image', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          id: '998877665544332211',
          channel_id: '112233445566778899',
        },
      });

      const res = await adapter.publish({
        workspaceId: '550e8400-e29b-41d4-a716-446655440000',
        accountId: 'acc-2',
        text: 'Check this update!',
        mediaUrls: ['https://example.com/cover.png'],
        idempotencyKey: 'idem-4',
        fingerprint: 'd'.repeat(64),
        metadata: {
          webhookUrl: 'https://discord.com/api/webhooks/123/token_abc',
          embedTitle: '🚀 Product Launch Announcement',
          embedDescription: 'We are thrilled to launch Scriora v1.0!',
          embedColor: '#5865F2',
          embedFooter: 'Scriora Multi-Platform Dispatcher',
        },
      });

      expect(res.status).toBe('SUCCEEDED');
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://discord.com/api/webhooks/123/token_abc?wait=true',
        expect.objectContaining({
          content: 'Check this update!',
          embeds: expect.arrayContaining([
            expect.objectContaining({
              title: '🚀 Product Launch Announcement',
              description: 'We are thrilled to launch Scriora v1.0!',
              color: 0x5865f2,
              footer: { text: 'Scriora Multi-Platform Dispatcher' },
              image: { url: 'https://example.com/cover.png' },
            }),
          ]),
        }),
        expect.any(Object)
      );
    });
  });

  describe('Bot API Publishing', () => {
    it('publishes to Discord channel using Bot Token', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          id: '555666777888999000',
          guild_id: '111222333444555666',
        },
      });

      const res = await adapter.publish({
        workspaceId: '550e8400-e29b-41d4-a716-446655440000',
        accountId: 'channel-999',
        text: 'Automated notification via Discord Bot',
        mediaUrls: [],
        idempotencyKey: 'idem-5',
        fingerprint: 'e'.repeat(64),
        metadata: {
          botToken: 'bot_secret_token_123',
          channelId: 'channel-999',
        },
      });

      expect(res.status).toBe('SUCCEEDED');
      expect(res.externalPostId).toBe('555666777888999000');
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://discord.com/api/v10/channels/channel-999/messages',
        expect.objectContaining({
          content: 'Automated notification via Discord Bot',
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bot bot_secret_token_123',
          }),
        })
      );
    });
  });

  describe('Error Mapping', () => {
    it('handles 429 Rate Limit with retryAfterMs', async () => {
      mockedAxios.isAxiosError.mockReturnValue(true);
      mockedAxios.post.mockRejectedValueOnce({
        isAxiosError: true,
        response: {
          status: 429,
          data: { message: 'You are being rate limited.', retry_after: 2.5 },
        },
      });

      await expect(
        adapter.publish({
          workspaceId: '550e8400-e29b-41d4-a716-446655440000',
          accountId: 'channel-1',
          text: 'Rate limited message',
          mediaUrls: [],
          idempotencyKey: 'idem-6',
          fingerprint: 'f'.repeat(64),
          metadata: { webhookUrl: 'https://discord.com/api/webhooks/1/2' },
        })
      ).rejects.toMatchObject({
        code: 'DISCORD_RATE_LIMITED',
        retryable: true,
        retryAfterMs: 2500,
      });
    });

    it('handles 401/403 Authentication failure', async () => {
      mockedAxios.isAxiosError.mockReturnValue(true);
      mockedAxios.post.mockRejectedValueOnce({
        isAxiosError: true,
        response: {
          status: 401,
          data: { message: 'Invalid Bot Token' },
        },
      });

      await expect(
        adapter.publish({
          workspaceId: '550e8400-e29b-41d4-a716-446655440000',
          accountId: 'ch-1',
          text: 'Auth failure test',
          mediaUrls: [],
          idempotencyKey: 'idem-7',
          fingerprint: '1'.repeat(64),
          metadata: { botToken: 'invalid', channelId: 'ch-1' },
        })
      ).rejects.toMatchObject({
        code: 'DISCORD_AUTH_ERROR',
        retryable: false,
      });
    });

    it('handles 403 Missing Permissions error with DISCORD_MISSING_PERMISSIONS', async () => {
      mockedAxios.isAxiosError.mockReturnValue(true);
      mockedAxios.post.mockRejectedValueOnce({
        isAxiosError: true,
        response: {
          status: 403,
          data: { code: 50013, message: 'Missing Permissions' },
        },
      });

      await expect(
        adapter.publish({
          workspaceId: '550e8400-e29b-41d4-a716-446655440000',
          accountId: 'ch-1',
          text: 'Permission test',
          mediaUrls: [],
          idempotencyKey: 'idem-8',
          fingerprint: '2'.repeat(64),
          metadata: { botToken: 'token', channelId: 'ch-1' },
        })
      ).rejects.toMatchObject({
        code: 'DISCORD_MISSING_PERMISSIONS',
        category: 'AUTHORIZATION',
        retryable: false,
      });
    });
  });

  describe('Power Features (Auto-Pin, Auto-Reactions, Threads)', () => {
    it('executes auto-pin and auto-reactions when publishing with Bot credentials', async () => {
      // 1. Publish message response
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          id: 'msg-999',
          channel_id: 'chan-111',
          guild_id: 'guild-222',
        },
      });
      // 2. Auto-pin PUT response
      mockedAxios.put.mockResolvedValueOnce({ status: 204 });
      // 3. Auto-reaction 1 PUT response
      mockedAxios.put.mockResolvedValueOnce({ status: 204 });
      // 4. Auto-reaction 2 PUT response
      mockedAxios.put.mockResolvedValueOnce({ status: 204 });

      const res = await adapter.publish({
        workspaceId: '550e8400-e29b-41d4-a716-446655440000',
        accountId: 'chan-111',
        text: 'Announcement with reactions and pin!',
        mediaUrls: [],
        idempotencyKey: 'idem-power-1',
        fingerprint: '3'.repeat(64),
        metadata: {
          botToken: 'bot-secret-token',
          channelId: 'chan-111',
          pinMessage: true,
          autoReactions: ['🔥', '🚀'],
        },
      });

      expect(res.status).toBe('SUCCEEDED');
      expect(res.platformMetadata?.pinned).toBe(true);
      expect(res.platformMetadata?.reactions).toEqual(['🔥', '🚀']);

      // Verify pin call
      expect(mockedAxios.put).toHaveBeenCalledWith(
        'https://discord.com/api/v10/channels/chan-111/pins/msg-999',
        {},
        expect.objectContaining({
          headers: { Authorization: 'Bot bot-secret-token' },
        })
      );

      // Verify reactions call
      expect(mockedAxios.put).toHaveBeenCalledWith(
        `https://discord.com/api/v10/channels/chan-111/messages/msg-999/reactions/${encodeURIComponent('🔥')}/@me`,
        {},
        expect.any(Object)
      );
      expect(mockedAxios.put).toHaveBeenCalledWith(
        `https://discord.com/api/v10/channels/chan-111/messages/msg-999/reactions/${encodeURIComponent('🚀')}/@me`,
        {},
        expect.any(Object)
      );
    });

    it('gracefully degrades if pin or reaction fails due to missing permissions', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          id: 'msg-1000',
          channel_id: 'chan-111',
        },
      });
      // Pin fails with 403
      mockedAxios.put.mockRejectedValueOnce(new Error('Discord 403 Missing Permissions'));

      const res = await adapter.publish({
        workspaceId: '550e8400-e29b-41d4-a716-446655440000',
        accountId: 'chan-111',
        text: 'Announcement with failing pin permission',
        mediaUrls: [],
        idempotencyKey: 'idem-power-2',
        fingerprint: '4'.repeat(64),
        metadata: {
          botToken: 'bot-secret-token',
          channelId: 'chan-111',
          pinMessage: true,
        },
      });

      expect(res.status).toBe('SUCCEEDED');
      expect(res.platformMetadata?.pinned).toBe(false);
    });
  });

  describe('Deletion & Verification', () => {
    it('deletes message via webhook delete endpoint', async () => {
      mockedAxios.delete.mockResolvedValueOnce({ status: 204 });

      const deleted = await adapter.deletePost(
        'msg-12345',
        'https://discord.com/api/webhooks/123/token'
      );
      expect(deleted).toBe(true);
      expect(mockedAxios.delete).toHaveBeenCalledWith(
        'https://discord.com/api/webhooks/123/token/messages/msg-12345',
        expect.any(Object)
      );
    });

    it('verifies non-empty externalPostId', async () => {
      expect(await adapter.verify('123456789012345678')).toBe(true);
      expect(await adapter.verify('')).toBe(false);
    });
  });

  describe('MockDiscordAdapter', () => {
    it('publishes successfully without network calls in mock mode', async () => {
      const mockAdapter = new MockDiscordAdapter();
      const res = await mockAdapter.publish({
        workspaceId: '550e8400-e29b-41d4-a716-446655440000',
        accountId: 'mock-channel',
        text: 'Mock publish',
        mediaUrls: [],
        idempotencyKey: 'idem-mock',
        fingerprint: '2'.repeat(64),
        metadata: { webhookUrl: 'https://discord.com/api/webhooks/mock/token' },
      });

      expect(res.status).toBe('SUCCEEDED');
      expect(res.externalPostId).toBeDefined();
      expect(res.externalPostUrl).toContain('mock-channel');
      expect(await mockAdapter.verify(res.externalPostId || '')).toBe(true);
      expect(await mockAdapter.deletePost(res.externalPostId || '', '')).toBe(true);
    });
  });
});
