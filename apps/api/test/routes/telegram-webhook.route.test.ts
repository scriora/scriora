import { TelegramBotService } from 'scriora-social';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../src/app.js';

const WEBHOOK_URL = '/v1/webhooks/telegram';
const UPDATE = { update_id: 1, message: { text: '/status', chat: { id: 42 } } };

describe('API Routes — Telegram webhook secret', () => {
  const previousBotToken = process.env.TELEGRAM_BOT_TOKEN;
  const previousWebhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const previousAdminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;

  beforeEach(() => {
    vi.spyOn(TelegramBotService.prototype, 'handleUpdate').mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    restoreEnv('TELEGRAM_BOT_TOKEN', previousBotToken);
    restoreEnv('TELEGRAM_WEBHOOK_SECRET', previousWebhookSecret);
    restoreEnv('TELEGRAM_ADMIN_CHAT_ID', previousAdminChatId);
  });

  it('rejects webhook posts when TELEGRAM_WEBHOOK_SECRET is unset', async () => {
    process.env.TELEGRAM_BOT_TOKEN = '123456:ABC';
    delete process.env.TELEGRAM_WEBHOOK_SECRET;

    const app = buildApp();
    const res = await postWebhook(app);

    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error.code).toBe('INVALID_WEBHOOK_SECRET');
    expect(TelegramBotService.prototype.handleUpdate).not.toHaveBeenCalled();
  });

  it('keeps the route registered but rejects posts when TELEGRAM_BOT_TOKEN is unset', async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    process.env.TELEGRAM_WEBHOOK_SECRET = 'expected-secret';

    const app = buildApp();
    const res = await postWebhook(app, { 'x-telegram-bot-api-secret-token': 'expected-secret' });

    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error.code).toBe('INVALID_WEBHOOK_SECRET');
    expect(TelegramBotService.prototype.handleUpdate).not.toHaveBeenCalled();
  });

  it('rejects webhook posts when TELEGRAM_WEBHOOK_SECRET is blank', async () => {
    process.env.TELEGRAM_BOT_TOKEN = '123456:ABC';
    process.env.TELEGRAM_WEBHOOK_SECRET = '   ';

    const app = buildApp();
    const res = await postWebhook(app, { 'x-telegram-bot-api-secret-token': '   ' });

    expect(res.statusCode).toBe(401);
    expect(TelegramBotService.prototype.handleUpdate).not.toHaveBeenCalled();
  });

  it('rejects webhook posts that omit the secret header', async () => {
    process.env.TELEGRAM_BOT_TOKEN = '123456:ABC';
    process.env.TELEGRAM_WEBHOOK_SECRET = 'expected-secret';

    const app = buildApp();
    const res = await postWebhook(app);

    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error.code).toBe('INVALID_WEBHOOK_SECRET');
    expect(TelegramBotService.prototype.handleUpdate).not.toHaveBeenCalled();
  });

  it('rejects webhook posts with an invalid secret', async () => {
    process.env.TELEGRAM_BOT_TOKEN = '123456:ABC';
    process.env.TELEGRAM_WEBHOOK_SECRET = 'expected-secret';

    const app = buildApp();
    const res = await postWebhook(app, { 'x-telegram-bot-api-secret-token': 'wrong-secret' });

    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error.code).toBe('INVALID_WEBHOOK_SECRET');
    expect(TelegramBotService.prototype.handleUpdate).not.toHaveBeenCalled();
  });

  it('processes updates only when the secret header matches', async () => {
    process.env.TELEGRAM_BOT_TOKEN = '123456:ABC';
    process.env.TELEGRAM_WEBHOOK_SECRET = 'expected-secret';

    const app = buildApp();
    const res = await postWebhook(app, { 'x-telegram-bot-api-secret-token': 'expected-secret' });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true });
    expect(TelegramBotService.prototype.handleUpdate).toHaveBeenCalledTimes(1);
    expect(TelegramBotService.prototype.handleUpdate).toHaveBeenCalledWith(
      UPDATE,
      expect.any(Object)
    );
  });
});

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

function postWebhook(app: ReturnType<typeof buildApp>, headers?: Record<string, string>) {
  return app.inject({
    method: 'POST',
    url: WEBHOOK_URL,
    headers,
    payload: UPDATE,
  });
}
