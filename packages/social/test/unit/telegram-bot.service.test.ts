import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildTelegramApprovalCallbackData,
  formatTelegramCreatePostResult,
  TELEGRAM_CALLBACK_DATA_MAX_BYTES,
  TelegramBotService,
} from '../../src/platforms/telegram/telegram-bot.service.js';

vi.mock('axios');
const mockedAxios = vi.mocked(axios, true);

describe('TelegramBotService (C2 Admin & Interactive Governance)', () => {
  const botToken = '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11';
  const adminChatId = '987654321';
  let botService: TelegramBotService;

  beforeEach(() => {
    vi.clearAllMocks();
    botService = new TelegramBotService({
      botToken,
      adminChatId,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('correctly verifies authorized vs unauthorized sender IDs', () => {
    expect(botService.isAuthorized('987654321')).toBe(true);
    expect(botService.isAuthorized(987654321)).toBe(true);
    expect(botService.isAuthorized('9999999999')).toBe(false);
  });

  it('fails closed when adminChatId is unset', () => {
    const openBot = new TelegramBotService({ botToken });
    expect(openBot.adminChatId).toBeUndefined();
    expect(openBot.isAuthorized('987654321')).toBe(false);
    expect(openBot.isAuthorized(1)).toBe(false);
  });

  it('denies /post when adminChatId is unset', async () => {
    const openBot = new TelegramBotService({ botToken });
    mockedAxios.post.mockResolvedValueOnce({ data: { ok: true, result: { message_id: 1 } } });

    const mockContext = {
      getSystemStatus: vi.fn(),
      listAccounts: vi.fn(),
      createPost: vi.fn().mockResolvedValue({ publicationCount: 1 }),
      handleApprovalDecision: vi.fn(),
    };

    const result = await openBot.handleUpdate(
      {
        update_id: 99,
        message: {
          message_id: 99,
          from: { id: 987654321, is_bot: false, first_name: 'Anyone' },
          chat: { id: 987654321, type: 'private' },
          text: '/post this must not publish',
        },
      },
      mockContext
    );

    expect(result.handled).toBe(true);
    expect(result.action).toBe('unauthorized_sender');
    expect(mockContext.createPost).not.toHaveBeenCalled();
  });

  it('formats an approval-hold message instead of claiming the post was published', () => {
    expect(
      formatTelegramCreatePostResult({
        publicationCount: 2,
        requiresApproval: true,
        message: 'Submitted for approval',
      })
    ).toContain('تم الإرسال للاعتماد');
    expect(
      formatTelegramCreatePostResult({
        publicationCount: 2,
        requiresApproval: true,
        message: 'Submitted for approval',
      })
    ).not.toContain('تم النشر بنجاح');
  });

  it('rejects commands from unauthorized senders with zero-trust guardrail', async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: { ok: true, result: { message_id: 101 } } });

    const result = await botService.handleUpdate({
      update_id: 1,
      message: {
        message_id: 1,
        from: { id: 999999999, is_bot: false, first_name: 'Hacker' },
        chat: { id: 999999999, type: 'private' },
        text: '/status',
      },
    });

    expect(result.handled).toBe(true);
    expect(result.action).toBe('unauthorized_sender');
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining('/sendMessage'),
      expect.objectContaining({
        chat_id: 999999999,
        text: expect.stringContaining('وصول غير مصرح به'),
      })
    );
  });

  it('handles /start and /help commands from authorized admin', async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: { ok: true, result: { message_id: 102 } } });

    const result = await botService.handleUpdate({
      update_id: 2,
      message: {
        message_id: 2,
        from: { id: 987654321, is_bot: false, first_name: 'Ameer' },
        chat: { id: 987654321, type: 'private' },
        text: '/start',
      },
    });

    expect(result.handled).toBe(true);
    expect(result.action).toBe('help');
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining('/sendMessage'),
      expect.objectContaining({
        chat_id: 987654321,
        text: expect.stringContaining('لوحة تحكم Scriora C2'),
      })
    );
  });

  it('handles /status command by querying context.getSystemStatus', async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: { ok: true, result: { message_id: 103 } } });

    const mockContext = {
      getSystemStatus: vi.fn().mockResolvedValue({
        workspaceName: 'Scriora HQ',
        connectedAccounts: 3,
        pendingOutboxCount: 0,
        recentPublicationsCount: 15,
      }),
      listAccounts: vi.fn(),
      createPost: vi.fn(),
      handleApprovalDecision: vi.fn(),
    };

    const result = await botService.handleUpdate(
      {
        update_id: 3,
        message: {
          message_id: 3,
          from: { id: 987654321, is_bot: false, first_name: 'Ameer' },
          chat: { id: 987654321, type: 'private' },
          text: '/status',
        },
      },
      mockContext
    );

    expect(result.handled).toBe(true);
    expect(result.action).toBe('status');
    expect(mockContext.getSystemStatus).toHaveBeenCalled();
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining('/sendMessage'),
      expect.objectContaining({
        text: expect.stringContaining('Scriora HQ'),
      })
    );
  });

  it('handles /post command and calls context.createPost', async () => {
    mockedAxios.post
      .mockResolvedValueOnce({ data: { ok: true, result: { message_id: 104 } } }) // progress
      .mockResolvedValueOnce({ data: { ok: true, result: { message_id: 105 } } }); // done

    const mockContext = {
      getSystemStatus: vi.fn(),
      listAccounts: vi.fn(),
      createPost: vi.fn().mockResolvedValue({ publicationCount: 3 }),
      handleApprovalDecision: vi.fn(),
    };

    const result = await botService.handleUpdate(
      {
        update_id: 4,
        message: {
          message_id: 4,
          from: { id: 987654321, is_bot: false, first_name: 'Ameer' },
          chat: { id: 987654321, type: 'private' },
          text: '/post أهلاً بكم في الإطلاق الجديد!',
        },
      },
      mockContext
    );

    expect(result.handled).toBe(true);
    expect(result.action).toBe('post_created');
    expect(mockContext.createPost).toHaveBeenCalledWith({
      text: 'أهلاً بكم في الإطلاق الجديد!',
    });
  });

  it('reports approval hold after /post when createPost requires approval', async () => {
    mockedAxios.post
      .mockResolvedValueOnce({ data: { ok: true, result: { message_id: 106 } } })
      .mockResolvedValueOnce({ data: { ok: true, result: { message_id: 107 } } });

    const mockContext = {
      getSystemStatus: vi.fn(),
      listAccounts: vi.fn(),
      createPost: vi.fn().mockResolvedValue({
        publicationCount: 2,
        requiresApproval: true,
        message: 'Submitted for approval',
      }),
      handleApprovalDecision: vi.fn(),
    };

    const result = await botService.handleUpdate(
      {
        update_id: 14,
        message: {
          message_id: 14,
          from: { id: 987654321, is_bot: false, first_name: 'Ameer' },
          chat: { id: 987654321, type: 'private' },
          text: '/post يحتاج اعتماد',
        },
      },
      mockContext
    );

    expect(result.handled).toBe(true);
    expect(result.action).toBe('post_held_for_approval');
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining('/sendMessage'),
      expect.objectContaining({
        text: expect.stringContaining('تم الإرسال للاعتماد'),
      })
    );
  });

  it('handles inline button callback queries for interactive approvals', async () => {
    mockedAxios.post
      .mockResolvedValueOnce({ data: { ok: true } }) // answerCallbackQuery
      .mockResolvedValueOnce({ data: { ok: true } }); // editMessageText

    const mockContext = {
      getSystemStatus: vi.fn(),
      listAccounts: vi.fn(),
      createPost: vi.fn(),
      handleApprovalDecision: vi.fn().mockResolvedValue(true),
    };

    const result = await botService.handleUpdate(
      {
        update_id: 5,
        callback_query: {
          id: 'cb_123',
          from: { id: 987654321, first_name: 'Ameer', username: 'YourTelegramHandle' },
          message: {
            message_id: 200,
            chat: { id: 987654321 },
            text: 'طلب اعتماد منشور جديد',
          },
          data: 'approve:token_sample_xyz',
        },
      },
      mockContext
    );

    expect(result.handled).toBe(true);
    expect(result.action).toBe('decision_approve');
    expect(mockContext.handleApprovalDecision).toHaveBeenCalledWith('token_sample_xyz', 'APPROVED');
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining('/answerCallbackQuery'),
      expect.objectContaining({
        callback_query_id: 'cb_123',
        text: expect.stringContaining('تم الاعتماد'),
      })
    );
  });

  it('keeps approve/reject callback_data within Telegram 64-byte limit for 32-hex tokens', () => {
    const token = 'a'.repeat(32);
    const { approve, reject } = buildTelegramApprovalCallbackData(token);

    expect(Buffer.byteLength(approve, 'utf8')).toBeLessThanOrEqual(
      TELEGRAM_CALLBACK_DATA_MAX_BYTES
    );
    expect(Buffer.byteLength(reject, 'utf8')).toBeLessThanOrEqual(TELEGRAM_CALLBACK_DATA_MAX_BYTES);
    expect(approve).toBe(`approve:${token}`);
    expect(reject).toBe(`reject:${token}`);
  });

  it('rejects a 64-hex token that would overflow Telegram callback_data', () => {
    const legacyToken = 'ab'.repeat(32);
    expect(legacyToken).toHaveLength(64);
    expect(() => buildTelegramApprovalCallbackData(legacyToken)).toThrow(/callback_data exceeds/);
  });

  it('formats and sends approval request with inline action buttons', async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: { ok: true, result: { message_id: 300 } } });

    const messageId = await botService.sendApprovalRequest({
      chatId: 987654321,
      approvalId: 'app_1',
      token: 'tok_abc',
      title: 'إعلان الشراكة',
      body: 'نعلن اليوم عن شراكة استراتيجية كبرى.',
      platform: 'LINKEDIN',
    });

    expect(messageId).toBe(300);
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining('/sendMessage'),
      expect.objectContaining({
        chat_id: 987654321,
        text: expect.stringContaining('طلب اعتماد منشور جديد'),
        reply_markup: expect.objectContaining({
          inline_keyboard: [
            [
              expect.objectContaining({
                text: expect.stringContaining('اعتماد'),
                callback_data: 'approve:tok_abc',
              }),
              expect.objectContaining({
                text: expect.stringContaining('رفض'),
                callback_data: 'reject:tok_abc',
              }),
            ],
          ],
        }),
      })
    );
  });

  it('supports custom button texts and custom headers/templates for approval requests', async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: { ok: true, result: { message_id: 301 } } });

    const messageId = await botService.sendApprovalRequest({
      chatId: 987654321,
      approvalId: 'app_2',
      token: 'tok_custom_123',
      title: 'حملة العيد',
      body: 'كل عام وأنتم بخير!',
      platform: 'TELEGRAM',
      customHeader: '✨ <b>مراجعة منشور قبل النشر في قنوات الشركة:</b>',
      customFooter: 'يرجى اختيار الإجراء المناسب لفريق التسويق:',
      approveButtonText: '🚀 موافقة ونشر الآن',
      rejectButtonText: '🛑 إلغاء وتعديل لاحقاً',
    });

    expect(messageId).toBe(301);
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining('/sendMessage'),
      expect.objectContaining({
        chat_id: 987654321,
        text: expect.stringContaining('مراجعة منشور قبل النشر'),
        reply_markup: expect.objectContaining({
          inline_keyboard: [
            [
              expect.objectContaining({
                text: '🚀 موافقة ونشر الآن',
                callback_data: 'approve:tok_custom_123',
              }),
              expect.objectContaining({
                text: '🛑 إلغاء وتعديل لاحقاً',
                callback_data: 'reject:tok_custom_123',
              }),
            ],
          ],
        }),
      })
    );
  });

  it('handles 1-click deep-link account connection via /start connect_<token>', async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: { ok: true, result: { message_id: 302 } } });

    const mockContext = {
      getSystemStatus: vi.fn(),
      listAccounts: vi.fn(),
      createPost: vi.fn(),
      handleApprovalDecision: vi.fn(),
      handleAccountConnection: vi
        .fn()
        .mockResolvedValue({ success: true, workspaceName: 'Scriora Enterprise' }),
    };

    const result = await botService.handleUpdate(
      {
        update_id: 10,
        message: {
          message_id: 10,
          from: {
            id: 987654321,
            is_bot: false,
            first_name: 'Ameer',
            username: 'YourTelegramHandle',
          },
          chat: { id: 987654321, type: 'private' },
          text: '/start connect_nonce_secure_999',
        },
      },
      mockContext
    );

    expect(result.handled).toBe(true);
    expect(result.action).toBe('account_connected');
    expect(mockContext.handleAccountConnection).toHaveBeenCalledWith('connect_nonce_secure_999', {
      id: 987654321,
      username: 'YourTelegramHandle',
      firstName: 'Ameer',
    });
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining('/sendMessage'),
      expect.objectContaining({
        chat_id: 987654321,
        text: expect.stringContaining('تم ربط حسابك بنجاح كمدير للنظام'),
      })
    );
  });

  it('handles direct photo broadcast from mobile gallery with caption', async () => {
    mockedAxios.post
      .mockResolvedValueOnce({ data: { ok: true, result: { file_path: 'photos/file_99.jpg' } } }) // getFile
      .mockResolvedValueOnce({ data: { ok: true, result: { message_id: 303 } } }) // progress msg
      .mockResolvedValueOnce({ data: { ok: true, result: { message_id: 304 } } }); // done msg

    const mockContext = {
      getSystemStatus: vi.fn(),
      listAccounts: vi.fn(),
      createPost: vi.fn().mockResolvedValue({ publicationCount: 2 }),
      handleApprovalDecision: vi.fn(),
    };

    const result = await botService.handleUpdate(
      {
        update_id: 11,
        message: {
          message_id: 11,
          from: { id: 987654321, is_bot: false, first_name: 'Ameer' },
          chat: { id: 987654321, type: 'private' },
          caption: 'إطلاق ميزة النشر المرئي المباشر!',
          photo: [
            { file_id: 'small_id', width: 320, height: 240 },
            { file_id: 'large_id_99', width: 1280, height: 960 },
          ],
        },
      },
      mockContext
    );

    expect(result.handled).toBe(true);
    expect(result.action).toBe('photo_post_created');
    expect(mockContext.createPost).toHaveBeenCalledWith({
      text: 'إطلاق ميزة النشر المرئي المباشر!',
      mediaUrls: [expect.stringContaining('photos/file_99.jpg')],
    });
  });
});
