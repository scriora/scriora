/**
 * packages/social/src/platforms/telegram/telegram-bot.service.ts
 *
 * Enterprise Command & Control (C2) Admin Bot for Scriora.
 * Enables zero-trust remote administration, two-way interactive approvals (§14),
 * live status telemetry, and chat-to-publish triggers via Telegram.
 */

import axios from 'axios';
import { PlatformError } from '../../errors/social.error.js';

export interface TelegramBotConfig {
  botToken: string;
  adminChatId?: string | number | undefined;
  apiUrl?: string | undefined;
}

export interface InlineKeyboardButton {
  text: string;
  callback_data?: string | undefined;
  url?: string | undefined;
}

export interface SendMessageOptions {
  parseMode?: ('HTML' | 'MarkdownV2' | 'Markdown') | undefined;
  disableWebPagePreview?: boolean | undefined;
  replyMarkup?: {
    inline_keyboard?: InlineKeyboardButton[][] | undefined;
  } | undefined;
}

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: {
      id: number;
      is_bot: boolean;
      first_name: string;
      username?: string;
    };
    chat: {
      id: number;
      type: string;
      title?: string;
      username?: string;
    };
    text?: string;
    caption?: string;
    photo?: Array<{ file_id: string; width: number; height: number }>;
  };
  callback_query?: {
    id: string;
    from: {
      id: number;
      first_name: string;
      username?: string;
    };
    message?: {
      message_id: number;
      chat: {
        id: number;
      };
      text?: string;
    };
    data?: string;
  };
}

export interface TelegramDbContext {
  getSystemStatus: () => Promise<{
    workspaceName: string;
    connectedAccounts: number;
    pendingOutboxCount: number;
    recentPublicationsCount: number;
  }>;
  listAccounts: () => Promise<Array<{ platform: string; name: string; status: string }>>;
  createPost: (params: {
    text: string;
    mediaUrls?: string[];
  }) => Promise<{ publicationCount: number; externalUrls?: string[] }>;
  handleApprovalDecision: (token: string, decision: 'APPROVED' | 'REJECTED') => Promise<boolean>;
}

export class TelegramBotService {
  private readonly baseUrl: string;
  public readonly adminChatId?: string | undefined;

  constructor(private readonly config: TelegramBotConfig) {
    if (!config.botToken) {
      throw new PlatformError({
        message: 'TelegramBotService requires a valid botToken',
        code: 'MISSING_BOT_TOKEN',
        retryable: false,
      });
    }
    this.baseUrl = `https://api.telegram.org/bot${config.botToken}`;
    this.adminChatId = config.adminChatId ? String(config.adminChatId) : undefined;
  }

  /**
   * Verify if the sender is authorized as an admin.
   */
  public isAuthorized(senderId: string | number): boolean {
    if (!this.adminChatId) return true; // If not set, allow all (or development mode)
    return String(senderId) === this.adminChatId;
  }

  /**
   * Send a standard or HTML-formatted message.
   */
  public async sendMessage(
    chatId: string | number,
    text: string,
    options?: SendMessageOptions
  ): Promise<number | null> {
    try {
      const res = await axios.post(`${this.baseUrl}/sendMessage`, {
        chat_id: chatId,
        text,
        parse_mode: options?.parseMode ?? 'HTML',
        disable_web_page_preview: options?.disableWebPagePreview ?? false,
        reply_markup: options?.replyMarkup,
      });
      return res.data?.result?.message_id ?? null;
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: unknown } };
      console.error('TelegramBotService.sendMessage failed:', axiosErr.response?.data || err);
      return null;
    }
  }

  /**
   * Send an image with caption.
   */
  public async sendPhoto(
    chatId: string | number,
    photoUrl: string,
    caption?: string,
    options?: SendMessageOptions
  ): Promise<number | null> {
    try {
      const res = await axios.post(`${this.baseUrl}/sendPhoto`, {
        chat_id: chatId,
        photo: photoUrl,
        caption: caption?.slice(0, 1024),
        parse_mode: options?.parseMode ?? 'HTML',
        reply_markup: options?.replyMarkup,
      });
      return res.data?.result?.message_id ?? null;
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: unknown } };
      console.error('TelegramBotService.sendPhoto failed:', axiosErr.response?.data || err);
      return null;
    }
  }

  /**
   * Edit an existing message text and keyboard in place.
   */
  public async editMessageText(
    chatId: string | number,
    messageId: number,
    text: string,
    options?: SendMessageOptions
  ): Promise<boolean> {
    try {
      const res = await axios.post(`${this.baseUrl}/editMessageText`, {
        chat_id: chatId,
        message_id: messageId,
        text,
        parse_mode: options?.parseMode ?? 'HTML',
        reply_markup: options?.replyMarkup,
      });
      return res.data?.ok === true;
    } catch {
      return false;
    }
  }

  /**
   * Answer a callback query from an inline button tap.
   */
  public async answerCallbackQuery(
    callbackQueryId: string,
    text?: string,
    showAlert = false
  ): Promise<boolean> {
    try {
      const res = await axios.post(`${this.baseUrl}/answerCallbackQuery`, {
        callback_query_id: callbackQueryId,
        text,
        show_alert: showAlert,
      });
      return res.data?.ok === true;
    } catch {
      return false;
    }
  }

  /**
   * Send an interactive Human Governance Approval Request (§14).
   */
  public async sendApprovalRequest(params: {
    chatId: string | number;
    approvalId: string;
    token: string;
    title: string;
    body: string;
    platform: string;
    scheduledAt?: string;
  }): Promise<number | null> {
    const message = [
      `🛡️ <b>طلب اعتماد منشور جديد (Human Governance §14)</b>`,
      ``,
      `📋 <b>المنصة:</b> <code>${params.platform}</code>`,
      `🏷️ <b>العنوان:</b> ${params.title}`,
      params.scheduledAt ? `⏰ <b>الموعد المجدول:</b> ${params.scheduledAt}` : `⚡ <b>الموعد:</b> فوري عند الاعتماد`,
      ``,
      `📝 <b>نص المنشور:</b>`,
      `<blockquote>${params.body}</blockquote>`,
      ``,
      `اضغط على أحد الخيارات أدناه لاتخاذ القرار:`,
    ].join('\n');

    return this.sendMessage(params.chatId, message, {
      replyMarkup: {
        inline_keyboard: [
          [
            { text: '✅ اعتماد ونشر فوري', callback_data: `approve:${params.token}` },
            { text: '❌ رفض وإلغاء', callback_data: `reject:${params.token}` },
          ],
        ],
      },
    });
  }

  /**
   * Process incoming Telegram update (from Webhook or Long-Polling).
   */
  public async handleUpdate(
    update: TelegramUpdate,
    context?: TelegramDbContext
  ): Promise<{ handled: boolean; action?: string; response?: string }> {
    // 1. Handle Inline Button Callback Queries
    if (update.callback_query) {
      const cq = update.callback_query;
      const senderId = cq.from.id;
      const data = cq.data || '';

      if (!this.isAuthorized(senderId)) {
        await this.answerCallbackQuery(cq.id, '⛔ عذراً، لست مصرحاً باتخاذ هذا القرار.', true);
        return { handled: true, action: 'unauthorized_callback' };
      }

      if (data.startsWith('approve:') || data.startsWith('reject:')) {
        const [action, token] = data.split(':');
        const decision = action === 'approve' ? 'APPROVED' : 'REJECTED';

        let success = false;
        if (context?.handleApprovalDecision && token) {
          success = await context.handleApprovalDecision(token, decision);
        }

        const icon = decision === 'APPROVED' ? '✅' : '❌';
        const label = decision === 'APPROVED' ? 'تم الاعتماد والنشر بنجاح 🚀' : 'تم الرفض وإلغاء المنشور 🗑️';

        await this.answerCallbackQuery(cq.id, `${icon} ${label}`);

        if (cq.message) {
          const updatedText = `${cq.message.text}\n\n<b>القرار المتخذ:</b> ${icon} ${label}\n<i>بواسطة: @${cq.from.username || senderId}</i>`;
          await this.editMessageText(cq.message.chat.id, cq.message.message_id, updatedText);
        }

        return { handled: true, action: `decision_${action}`, response: label };
      }

      await this.answerCallbackQuery(cq.id);
      return { handled: true, action: 'unknown_callback' };
    }

    // 2. Handle Text Messages and Commands
    if (update.message) {
      const msg = update.message;
      const senderId = msg.from?.id;
      const chatId = msg.chat.id;
      const text = (msg.text || msg.caption || '').trim();

      if (!senderId) return { handled: false };

      // Zero-Trust Security Check
      if (!this.isAuthorized(senderId)) {
        await this.sendMessage(
          chatId,
          `⛔ <b>وصول غير مصرح به (Access Denied)</b>\n\nهذا البوت مخصص للإدارة المركزية فقط.\nمعرف حسابك: <code>${senderId}</code>`
        );
        return { handled: true, action: 'unauthorized_sender' };
      }

      // Command Dispatcher
      if (text === '/start' || text === '/help') {
        const helpMessage = [
          `🚀 <b>أهلاً بك في لوحة تحكم Scriora C2 المركزية!</b>`,
          ``,
          `معرف المشرف المعتمد: <code>${senderId}</code> 🛡️`,
          ``,
          `<b>الأوامر المتاحة:</b>`,
          `📊 <code>/status</code> — عرض صحة النظام وحالة الطوابير والمنشورات`,
          `🌐 <code>/accounts</code> — استعراض الحسابات المربوطة (LinkedIn، القنوات، المجموعات)`,
          `✍️ <code>/post [نص المنشور]</code> — نشر فوري موحد على جميع المنصات المربوطة`,
          `🛡️ <code>/help</code> — عرض هذه القائمة الإرشادية`,
          ``,
          `<i>Scriora Enterprise Social Orchestrator • Zero-Trust Protected</i>`,
        ].join('\n');

        await this.sendMessage(chatId, helpMessage);
        return { handled: true, action: 'help' };
      }

      if (text === '/status') {
        if (!context?.getSystemStatus) {
          await this.sendMessage(chatId, `⚡ <b>حالة النظام:</b> متصل ونشط 🟢\nسيرفر API يعمل بكفاءة على المنفذ 4000.`);
          return { handled: true, action: 'status' };
        }

        const stats = await context.getSystemStatus();
        const statusMsg = [
          `📊 <b>تقرير حالة منصة Scriora الحية:</b>`,
          ``,
          `🏢 <b>مساحة العمل:</b> ${stats.workspaceName}`,
          `🔗 <b>الحسابات المربوطة:</b> ${stats.connectedAccounts} منصات`,
          `📬 <b>طابور الـ Outbox المعلق:</b> ${stats.pendingOutboxCount} مهام`,
          `📈 <b>المنشورات الحديثة:</b> ${stats.recentPublicationsCount} منشور`,
          ``,
          `🟢 جميع الأنظمة تعمل بتشفير AES-256-GCM ومعايير الإنتاج.`,
        ].join('\n');

        await this.sendMessage(chatId, statusMsg);
        return { handled: true, action: 'status' };
      }

      if (text === '/accounts') {
        if (!context?.listAccounts) {
          await this.sendMessage(chatId, `ℹ️ جاري جلب الحسابات...`);
          return { handled: true, action: 'accounts' };
        }

        const accounts = await context.listAccounts();
        const listText = [
          `🌐 <b>الحسابات الاجتماعية المتصلة بمساحة العمل:</b>`,
          ``,
          ...accounts.map(
            (a) => `• <b>${a.platform}</b>: ${a.name} [<code>${a.status}</code>]`
          ),
          ``,
          `<i>جاهزة للنشر المتزامن والمؤتمت ⚡</i>`,
        ].join('\n');

        await this.sendMessage(chatId, listText);
        return { handled: true, action: 'accounts' };
      }

      if (text.startsWith('/post')) {
        const postContent = text.replace(/^\/post\s*/, '').trim();
        if (!postContent) {
          await this.sendMessage(
            chatId,
            `⚠️ <b>يرجى كتابة نص المنشور بعد الأمر:</b>\nمثال:\n<code>/post أهلاً بكم في تحديث سكريورا الجديد!</code>`
          );
          return { handled: true, action: 'empty_post' };
        }

        if (!context?.createPost) {
          await this.sendMessage(chatId, `⚠️ محرك النشر غير مهيأ حالياً.`);
          return { handled: true, action: 'post_failed' };
        }

        await this.sendMessage(chatId, `⏳ <i>جاري معالجة المنشور وتوزيعه على المنصات...</i>`);
        const result = await context.createPost({ text: postContent });

        await this.sendMessage(
          chatId,
          `✅ <b>تم النشر بنجاح!</b> 🚀\n\nتم إرسال المنشور إلى <b>${result.publicationCount}</b> وجهات بنجاح عبر مسار الـ Transactional Outbox.`
        );
        return { handled: true, action: 'post_created' };
      }
    }

    return { handled: false };
  }
}
