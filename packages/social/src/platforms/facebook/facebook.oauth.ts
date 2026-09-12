import axios, { type AxiosError } from 'axios';
import type {
  OAuthCallbackParams,
  OAuthInitParams,
  OAuthInitResult,
  TokenExchangeResult,
} from '../../contracts/platform.contract.js';
import { PlatformError } from '../../errors/social.error.js';

export interface FacebookPageAccount {
  id: string;
  name: string;
  accessToken: string;
  category?: string | undefined;
  tasks?: string[] | undefined;
}

export class FacebookOAuth {
  private readonly appId: string;
  private readonly appSecret: string;
  private readonly graphApiVersion = 'v21.0';

  constructor(appId?: string, appSecret?: string) {
    this.appId =
      appId ||
      process.env.FACEBOOK_APP_ID ||
      process.env.META_APP_ID ||
      process.env.INSTAGRAM_APP_ID ||
      '';
    this.appSecret =
      appSecret ||
      process.env.FACEBOOK_APP_SECRET ||
      process.env.META_APP_SECRET ||
      process.env.INSTAGRAM_APP_SECRET ||
      '';
  }

  private getEffectiveAppId(): string {
    return (
      this.appId ||
      process.env.FACEBOOK_APP_ID ||
      process.env.META_APP_ID ||
      process.env.INSTAGRAM_APP_ID ||
      ''
    );
  }

  private getEffectiveAppSecret(): string {
    return (
      this.appSecret ||
      process.env.FACEBOOK_APP_SECRET ||
      process.env.META_APP_SECRET ||
      process.env.INSTAGRAM_APP_SECRET ||
      ''
    );
  }

  public async getAuthorizationUrl(params: OAuthInitParams): Promise<OAuthInitResult> {
    const appId = this.getEffectiveAppId();
    if (!appId) {
      throw new PlatformError({
        code: 'MISSING_CLIENT_CREDENTIALS',
        category: 'AUTHENTICATION',
        message: 'Facebook / Meta App ID is not configured (set FACEBOOK_APP_ID or META_APP_ID)',
        retryable: false,
      });
    }

    const scopes = [
      'pages_show_list',
      'pages_read_engagement',
      'pages_manage_posts',
      'public_profile',
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
        message: 'Facebook / Meta credentials are not configured',
        retryable: false,
      });
    }

    try {
      // 1. Exchange code for short-lived user token
      const tokenRes = await axios.get<{
        access_token: string;
        token_type: string;
        expires_in?: number;
      }>(`https://graph.facebook.com/${this.graphApiVersion}/oauth/access_token`, {
        params: {
          client_id: appId,
          client_secret: appSecret,
          redirect_uri: params.redirectUri,
          code: params.code,
        },
      });

      const shortLivedToken = tokenRes.data.access_token;

      // 2. Exchange short-lived token for long-lived user token (60 days)
      let longLivedUserToken = shortLivedToken;
      let userExpiresIn = 5184000;

      try {
        const longRes = await axios.get<{
          access_token: string;
          token_type: string;
          expires_in?: number;
        }>(`https://graph.facebook.com/${this.graphApiVersion}/oauth/access_token`, {
          params: {
            grant_type: 'fb_exchange_token',
            client_id: appId,
            client_secret: appSecret,
            fb_exchange_token: shortLivedToken,
          },
        });
        if (longRes.data.access_token) {
          longLivedUserToken = longRes.data.access_token;
          userExpiresIn = longRes.data.expires_in ?? 5184000;
        }
      } catch {
        // Continue with short-lived token if exchange fails
      }

      // 3. Fetch user profile
      const meRes = await axios.get<{ id: string; name: string }>(
        `https://graph.facebook.com/${this.graphApiVersion}/me`,
        {
          params: {
            fields: 'id,name',
            access_token: longLivedUserToken,
          },
        }
      );
      const userId = meRes.data.id;
      const userName = meRes.data.name;

      // 4. Fetch user's managed Facebook Pages
      let pages: FacebookPageAccount[] = [];
      try {
        const accountsRes = await axios.get<{
          data: Array<{
            id: string;
            name: string;
            access_token: string;
            category?: string;
            tasks?: string[];
          }>;
        }>(`https://graph.facebook.com/${this.graphApiVersion}/me/accounts`, {
          params: {
            fields: 'id,name,access_token,category,tasks',
            access_token: longLivedUserToken,
          },
        });

        pages = (accountsRes.data.data || []).map((p) => ({
          id: p.id,
          name: p.name,
          accessToken: p.access_token,
          category: p.category,
          tasks: p.tasks,
        }));
      } catch {
        // No pages returned or error
      }

      // If user manages at least one Page, set primary Page as default destination
      const primaryPage = pages[0];
      if (primaryPage) {
        return {
          accessToken: primaryPage.accessToken, // Permanent Page Access Token
          refreshToken: longLivedUserToken, // Keep long-lived user token as fallback
          expiresIn: 0, // Page tokens do not expire
          externalAccountId: primaryPage.id,
          accountName: `${primaryPage.name} (Facebook Page)`,
          rawPayload: {
            type: 'PAGE',
            pageId: primaryPage.id,
            pageName: primaryPage.name,
            userId,
            userName,
            availablePages: pages,
            userAccessToken: longLivedUserToken,
          },
        };
      }

      // Fallback: Store User profile destination
      return {
        accessToken: longLivedUserToken,
        expiresIn: userExpiresIn,
        externalAccountId: userId,
        accountName: `${userName} (Facebook User)`,
        rawPayload: {
          type: 'USER',
          userId,
          userName,
          availablePages: [],
        },
      };
    } catch (e: unknown) {
      const err = e as AxiosError<{
        error?: { message?: string; type?: string; code?: number };
      }>;
      const msg =
        err.response?.data?.error?.message ||
        err.message ||
        'Failed to exchange Facebook authorization code for tokens';

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
    const appId = this.getEffectiveAppId();
    const appSecret = this.getEffectiveAppSecret();
    if (!appId || !appSecret) {
      throw new PlatformError({
        code: 'MISSING_CLIENT_CREDENTIALS',
        category: 'AUTHENTICATION',
        message: 'Facebook / Meta credentials are not configured for token refresh',
        retryable: false,
      });
    }

    try {
      const res = await axios.get<{
        access_token: string;
        token_type: string;
        expires_in?: number;
      }>(`https://graph.facebook.com/${this.graphApiVersion}/oauth/access_token`, {
        params: {
          grant_type: 'fb_exchange_token',
          client_id: appId,
          client_secret: appSecret,
          fb_exchange_token: refreshToken,
        },
      });

      return {
        accessToken: res.data.access_token,
        expiresIn: res.data.expires_in ?? 5184000,
      };
    } catch (e: unknown) {
      const err = e as AxiosError<{ error?: { message?: string } }>;
      throw new PlatformError({
        code: 'TOKEN_REFRESH_FAILED',
        category: 'AUTHENTICATION',
        message: err.response?.data?.error?.message || 'Failed to refresh Facebook access token',
        retryable: false,
      });
    }
  }
}
