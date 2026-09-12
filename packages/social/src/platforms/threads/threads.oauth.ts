import axios, { type AxiosError } from 'axios';
import type {
  OAuthCallbackParams,
  OAuthInitParams,
  OAuthInitResult,
  TokenExchangeResult,
} from '../../contracts/platform.contract.js';
import { PlatformError } from '../../errors/social.error.js';

export class ThreadsOAuth {
  private readonly appId: string;
  private readonly appSecret: string;
  private readonly apiVersion = 'v1.0';

  constructor(appId?: string, appSecret?: string) {
    this.appId = appId || process.env.THREADS_APP_ID || '';
    this.appSecret = appSecret || process.env.THREADS_APP_SECRET || '';
  }

  private getEffectiveAppId(): string {
    return this.appId || process.env.THREADS_APP_ID || '';
  }

  private getEffectiveAppSecret(): string {
    return this.appSecret || process.env.THREADS_APP_SECRET || '';
  }

  public async getAuthorizationUrl(params: OAuthInitParams): Promise<OAuthInitResult> {
    const appId = this.getEffectiveAppId();
    if (!appId) {
      throw new PlatformError({
        code: 'MISSING_CLIENT_CREDENTIALS',
        category: 'AUTHENTICATION',
        message: 'Threads App ID is not configured (set THREADS_APP_ID)',
        retryable: false,
      });
    }

    const scopes = [
      'threads_basic',
      'threads_content_publish',
      'threads_read_replies',
      'threads_manage_replies',
      'threads_manage_insights',
    ].join(',');

    const url = new URL('https://threads.net/oauth/authorize');
    url.searchParams.set('client_id', appId);
    url.searchParams.set('redirect_uri', params.redirectUri);
    url.searchParams.set('scope', scopes);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('state', params.state);

    return { authorizationUrl: url.toString() };
  }

  public async exchangeCodeForTokens(params: OAuthCallbackParams): Promise<TokenExchangeResult> {
    const appId = this.getEffectiveAppId();
    const appSecret = this.getEffectiveAppSecret();
    if (!appId || !appSecret) {
      throw new PlatformError({
        code: 'MISSING_CLIENT_CREDENTIALS',
        category: 'AUTHENTICATION',
        message: 'Threads credentials (THREADS_APP_ID / THREADS_APP_SECRET) are not configured',
        retryable: false,
      });
    }

    try {
      // 1. Exchange authorization code for short-lived User Access Token
      const form = new URLSearchParams();
      form.append('client_id', appId);
      form.append('client_secret', appSecret);
      form.append('grant_type', 'authorization_code');
      form.append('redirect_uri', params.redirectUri);
      form.append('code', params.code);

      const shortLivedRes = await axios.post<{
        access_token: string;
        user_id: string;
      }>('https://graph.threads.net/oauth/access_token', form, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      const shortLivedToken = shortLivedRes.data.access_token;
      const initialUserId = shortLivedRes.data.user_id;

      // 2. Exchange short-lived token for long-lived (60 days) token
      const longLivedRes = await axios.get<{
        access_token: string;
        token_type: string;
        expires_in: number;
      }>('https://graph.threads.net/access_token', {
        params: {
          grant_type: 'th_exchange_token',
          client_secret: this.getEffectiveAppSecret(),
          access_token: shortLivedToken,
        },
      });

      const longLivedToken = longLivedRes.data.access_token;
      const expiresIn = longLivedRes.data.expires_in ?? 5184000; // 60 days default

      // 3. Fetch user profile from Threads Graph API
      let username = `threads_user_${initialUserId}`;
      let accountName = `Threads Account (${initialUserId})`;
      let externalAccountId = initialUserId;

      try {
        const meRes = await axios.get<{
          id: string;
          username?: string;
          name?: string;
          threads_profile_picture_url?: string;
        }>(`https://graph.threads.net/${this.apiVersion}/me`, {
          params: {
            fields: 'id,username,name,threads_profile_picture_url',
            access_token: longLivedToken,
          },
        });

        if (meRes.data.id) {
          externalAccountId = meRes.data.id;
        }
        if (meRes.data.username) {
          username = meRes.data.username;
          accountName = `@${username}`;
        }
        if (meRes.data.name) {
          accountName = `${meRes.data.name} (@${username})`;
        }
      } catch (_profileErr) {
        // Fallback to initial ID if profile fetch fails
      }

      return {
        accessToken: longLivedToken,
        expiresIn,
        externalAccountId,
        accountName,
        rawPayload: {
          threads_user_id: externalAccountId,
          username,
        },
      };
    } catch (e: unknown) {
      const err = e as AxiosError<{ error_message?: string; error?: { message?: string } }>;
      const msg =
        err.response?.data?.error_message ||
        err.response?.data?.error?.message ||
        err.message ||
        'Failed to exchange Threads authorization code';

      throw new PlatformError({
        code: 'TOKEN_EXCHANGE_FAILED',
        category: 'AUTHENTICATION',
        message: msg,
        retryable: false,
      });
    }
  }

  public async refreshAccessToken(
    refreshToken: string
  ): Promise<{ accessToken: string; refreshToken?: string; expiresIn?: number }> {
    try {
      const res = await axios.get<{
        access_token: string;
        token_type: string;
        expires_in: number;
      }>('https://graph.threads.net/refresh_access_token', {
        params: {
          grant_type: 'th_refresh_token',
          access_token: refreshToken,
        },
      });

      return {
        accessToken: res.data.access_token,
        expiresIn: res.data.expires_in ?? 5184000,
      };
    } catch (e: unknown) {
      const err = e as AxiosError<{ error_message?: string; error?: { message?: string } }>;
      const msg =
        err.response?.data?.error_message ||
        err.response?.data?.error?.message ||
        err.message ||
        'Failed to refresh Threads access token';

      throw new PlatformError({
        code: 'TOKEN_REFRESH_FAILED',
        category: 'AUTHENTICATION',
        message: msg,
        retryable: false,
      });
    }
  }
}
