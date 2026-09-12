import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { maybeSendTelegramApprovalRequests } from '../../src/lib/approval-delivery.js';

const { sendApprovalRequest } = vi.hoisted(() => ({
  sendApprovalRequest: vi.fn(),
}));

vi.mock('scriora-social', () => ({
  TelegramBotService: class MockTelegramBotService {
    sendApprovalRequest = sendApprovalRequest;
  },
}));

describe('maybeSendTelegramApprovalRequests', () => {
  const request = {
    approvalId: 'approval-1',
    token: 'a'.repeat(32),
    title: 'Needs review',
    body: 'Please approve this post',
    platform: 'LINKEDIN',
  };

  beforeEach(() => {
    sendApprovalRequest.mockReset();
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_ADMIN_CHAT_ID;
  });

  afterEach(() => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_ADMIN_CHAT_ID;
  });

  it('skips Telegram when bot credentials are missing', async () => {
    const result = await maybeSendTelegramApprovalRequests([request]);

    expect(result).toEqual({ attempted: false, delivered: 0 });
    expect(sendApprovalRequest).not.toHaveBeenCalled();
  });

  it('sends the raw token to Telegram and does not persist it', async () => {
    process.env.TELEGRAM_BOT_TOKEN = '123456:ABC';
    process.env.TELEGRAM_ADMIN_CHAT_ID = '987654321';
    sendApprovalRequest.mockResolvedValue(42);

    const result = await maybeSendTelegramApprovalRequests([request]);

    expect(result).toEqual({ attempted: true, delivered: 1 });
    expect(sendApprovalRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: '987654321',
        approvalId: 'approval-1',
        token: request.token,
        platform: 'LINKEDIN',
      })
    );
  });

  it('does not fail delivery when Telegram send returns null', async () => {
    process.env.TELEGRAM_BOT_TOKEN = '123456:ABC';
    process.env.TELEGRAM_ADMIN_CHAT_ID = '987654321';
    sendApprovalRequest.mockResolvedValue(null);

    const result = await maybeSendTelegramApprovalRequests([request]);

    expect(result).toEqual({ attempted: true, delivered: 0 });
  });
});
