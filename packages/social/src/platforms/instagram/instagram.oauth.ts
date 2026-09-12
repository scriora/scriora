import axios, { type AxiosError } from 'axios';
import type {
  OAuthCallbackParams,
  OAuthInitParams,
  OAuthInitResult,
  TokenExchangeResult,
} from '../../contracts/platform.contract.js';
import { PlatformError } from '../../errors/social.error.js';

export class InstagramOAuth {
  private readonly appId: string;
  private readonly appSecret: string;
  private readonly graphApiVersion = 'v21.0';

  constructor(appId?: string, appSecret?: string) {
    this.appId = appId || process.env.INSTAGRAM_APP_ID || process.env.META_APP_ID || '';
    this.appSecret =
      appSecret || process.env.INSTAGRAM_APP_SECRET || process.env.META_APP_SECRET || '';
  }

  private getEffectiveAppId(): string {
    return this.appId || process.env.INSTAGRAM_APP_ID || process.env.META_APP_ID || '';
  }

  private getEffectiveAppSecret(): string {
    return this.appSecret || process.env.INSTAGRAM_APP_SECRET || process.env.META_APP_SECRET || '';
  }

  public async getAuthorizationUrl(params: OAuthInitParams): Promise<OAuthInitResult> {
    const appId = this.getEffectiveAppId();
    if (!appId) {
      throw new PlatformError({
        code: 'MISSING_CLIENT_CREDENTIALS',
        category: 'AUTHENTICATION',
        message: 'Instagram / Meta App ID is not configured (set INSTAGRAM_APP_ID or META_APP_ID)',
        retryable: false,
      });
    }

    const scopes = [
      'instagram_basic',
      'instagram_content_publish',
      'pages_show_list',
      'pages_read_engagement',
      'business_management',
    ].join(',');

    const url = new URL(`https://www.facebook.com/${this.graphApiVersion}/dialog/oauth`);
    url.searchParams.set('client_id', appId);
    url.searchParams.set('redirect_uri', params.redirectUri);
    url.searchParams.set('state', params.state);
    url.searchParams.set('scope', scopes);
    url.searchParams.set('response_type', 'code');

    return { authorizationUrl: url.toString() };
  }

  public async exchangeCodeForTokens(params: OAuthCallbackParams): Promise<TokenExchangeResult> {
    const appId = this.getEffectiveAppId();
    const appSecret = this.getEffectiveAppSecret();
    if (!appId || !appSecret) {
      throw new PlatformError({
        code: 'MISSING_CLIENT_CREDENTIALS',
        category: 'AUTHENTICATION',
        message: 'Instagram / Meta credentials are not configured',
        retryable: false,
      });
    }

    // 1. Try Instagram Business Login direct token exchange first (via api.instagram.com)
    try {
      const formData = new URLSearchParams();
      formData.append('client_id', appId);
      formData.append('client_secret', appSecret);
      formData.append('grant_type', 'authorization_code');
      formData.append('redirect_uri', params.redirectUri);
      formData.append('code', params.code);

      const igTokenRes = await axios.post<{
        access_token: string;
        user_id?: string | number;
      }>('https://api.instagram.com/oauth/access_token', formData.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      const shortLivedToken = igTokenRes.data.access_token;
      const userId = String(igTokenRes.data.user_id || '');

      // Exchange short-lived token for long-lived (60 days) token via graph.instagram.com
      let longLivedToken = shortLivedToken;
      let expiresIn = 5184000;
      try {
        const longLivedRes = await axios.get<{ access_token: string; expires_in?: number }>(
          'https://graph.instagram.com/access_token',
          {
            params: {
              grant_type: 'ig_exchange_token',
              client_secret: appSecret,
              access_token: shortLivedToken,
            },
          }
        );
        if (longLivedRes.data.access_token) {
          longLivedToken = longLivedRes.data.access_token;
          expiresIn = longLivedRes.data.expires_in ?? 5184000;
        }
      } catch {
        // Use short-lived token if long-lived exchange is unavailable
      }

      // Resolve Instagram username & details
      let externalAccountId = userId;
      let accountName = `Instagram User ${userId}`;

      try {
        const meRes = await axios.get<{ id: string; username?: string; name?: string }>(
          `https://graph.instagram.com/${this.graphApiVersion}/me`,
          {
            params: {
              fields: 'id,username,name',
              access_token: longLivedToken,
            },
          }
        );
        externalAccountId = meRes.data.id || userId;
        accountName = meRes.data.username
          ? `@${meRes.data.username}`
          : meRes.data.name || accountName;
      } catch {
        // Keep fallback
      }

      return {
        accessToken: longLivedToken,
        refreshToken: longLivedToken,
        expiresIn,
        externalAccountId,
        accountName,
        rawPayload: {
          mode: 'INSTAGRAM_BUSINESS_LOGIN',
          userId,
        },
      };
    } catch {
      // If direct Instagram login exchange fails, fallback to Facebook Graph API exchange flow
    }

    try {
      // 2. Fallback: Facebook Graph API exchange for Meta Facebook Login
      const tokenRes = await axios.get<{ access_token: string; expires_in?: number }>(
        `https://graph.facebook.com/${this.graphApiVersion}/oauth/access_token`,
        {
          params: {
            client_id: appId,
            client_secret: appSecret,
            redirect_uri: params.redirectUri,
            code: params.code,
          },
        }
      );

      const shortLivedToken = tokenRes.data.access_token;

      // 2. Exchange short-lived token for long-lived (60 days) User Access Token
      const longLivedRes = await axios.get<{ access_token: string; expires_in?: number }>(
        `https://graph.facebook.com/${this.graphApiVersion}/oauth/access_token`,
        {
          params: {
            grant_type: 'fb_exchange_token',
            client_id: appId,
            client_secret: appSecret,
            fb_exchange_token: shortLivedToken,
          },
        }
      );

      const longLivedToken = longLivedRes.data.access_token;
      const expiresIn = longLivedRes.data.expires_in ?? 5184000; // 60 days default

      // 3. Resolve the connected Instagram Business / Creator Account via Facebook Pages
      const pagesRes = await axios.get<{
        data: Array<{
          id: string;
          name: string;
          access_token: string;
          instagram_business_account?: {
            id: string;
            username?: string;
            name?: string;
          };
        }>;
      }>(`https://graph.facebook.com/${this.graphApiVersion}/me/accounts`, {
        params: {
          fields: 'id,name,access_token,instagram_business_account{id,username,name}',
          access_token: longLivedToken,
        },
      });

      const pageWithIg = pagesRes.data.data?.find((p) => p.instagram_business_account?.id);

      if (!pageWithIg?.instagram_business_account) {
        throw new PlatformError({
          code: 'NO_INSTAGRAM_BUSINESS_ACCOUNT',
          category: 'VALIDATION',
          message:
            'No Instagram Professional/Business account found connected to your Facebook Pages. Please link your Instagram Professional account to a Facebook Page.',
          retryable: false,
        });
      }

      const igAccount = pageWithIg.instagram_business_account;
      const accountName = igAccount.username
        ? `@${igAccount.username}`
        : igAccount.name || pageWithIg.name;

      return {
        accessToken: pageWithIg.access_token || longLivedToken,
        refreshToken: longLivedToken,
        expiresIn,
        externalAccountId: igAccount.id,
        accountName,
        rawPayload: {
          instagramBusinessAccountId: igAccount.id,
          pageId: pageWithIg.id,
          pageName: pageWithIg.name,
          userAccessToken: longLivedToken,
        },
      };
    } catch (e: unknown) {
      if (e instanceof PlatformError) throw e;
      const err = e as AxiosError<{ error?: { message?: string; code?: number } }>;
      const msg =
        err.response?.data?.error?.message ||
        err.message ||
        'Instagram OAuth token exchange failed';
      throw new PlatformError({
        code: 'OAUTH_EXCHANGE_FAILED',
        category: 'AUTHENTICATION',
        message: msg,
        retryable: false,
      });
    }
  }

  public async refreshAccessToken(
    refreshToken: string
  ): Promise<{ accessToken: string; refreshToken?: string; expiresIn?: number }> {
    if (!this.appId || !this.appSecret) {
      throw new PlatformError({
        code: 'MISSING_CLIENT_CREDENTIALS',
        category: 'AUTHENTICATION',
        message: 'Instagram / Meta credentials are not configured',
        retryable: false,
      });
    }

    try {
      const res = await axios.get<{ access_token: string; expires_in?: number }>(
        `https://graph.facebook.com/${this.graphApiVersion}/oauth/access_token`,
        {
          params: {
            grant_type: 'fb_exchange_token',
            client_id: this.appId,
            client_secret: this.appSecret,
            fb_exchange_token: refreshToken,
          },
        }
      );

      return {
        accessToken: res.data.access_token,
        refreshToken: res.data.access_token,
        expiresIn: res.data.expires_in ?? 5184000,
      };
    } catch (e: unknown) {
      const err = e as AxiosError<{ error?: { message?: string } }>;
      throw new PlatformError({
        code: 'TOKEN_REFRESH_FAILED',
        category: 'AUTHENTICATION',
        message: err.response?.data?.error?.message || 'Failed to refresh Instagram access token',
        retryable: false,
      });
    }
  }
}
