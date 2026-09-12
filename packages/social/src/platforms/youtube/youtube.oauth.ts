import axios, { type AxiosError } from 'axios';
import type {
  OAuthCallbackParams,
  OAuthInitParams,
  OAuthInitResult,
  TokenExchangeResult,
} from '../../contracts/platform.contract.js';
import { PlatformError } from '../../errors/social.error.js';

export interface YouTubeChannelInfo {
  id: string;
  title: string;
  customUrl?: string | undefined;
  avatarUrl?: string | undefined;
}

export class YouTubeOAuth {
  private readonly clientId: string;
  private readonly clientSecret: string;

  constructor(clientId?: string, clientSecret?: string) {
    this.clientId = clientId || process.env.YOUTUBE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '';
    this.clientSecret =
      clientSecret || process.env.YOUTUBE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || '';
  }

  private getEffectiveClientId(): string {
    return this.clientId || process.env.YOUTUBE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '';
  }

  private getEffectiveClientSecret(): string {
    return (
      this.clientSecret ||
      process.env.YOUTUBE_CLIENT_SECRET ||
      process.env.GOOGLE_CLIENT_SECRET ||
      ''
    );
  }

  /**
   * Generates Google OAuth 2.0 authorization URL for YouTube Data API v3.
   * Forces access_type=offline and prompt=consent to ensure a permanent refresh token is returned.
   */
  public async getAuthorizationUrl(params: OAuthInitParams): Promise<OAuthInitResult> {
    const clientId = this.getEffectiveClientId();
    if (!clientId) {
      throw new PlatformError({
        message: 'YOUTUBE_CLIENT_ID is not configured in environment variables.',
        code: 'CONFIG_ERROR',
        category: 'VALIDATION',
        retryable: false,
      });
    }

    const scopes = [
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube.readonly',
    ];

    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', params.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', scopes.join(' '));
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'consent');
    url.searchParams.set('state', params.state);

    return {
      authorizationUrl: url.toString(),
    };
  }

  /**
   * Exchanges authorization code for Google access token and refresh token,
   * then fetches the authenticated channel details.
   */
  public async exchangeCodeForTokens(params: OAuthCallbackParams): Promise<TokenExchangeResult> {
    const clientId = this.getEffectiveClientId();
    const clientSecret = this.getEffectiveClientSecret();

    if (!clientId || !clientSecret) {
      throw new PlatformError({
        message: 'Missing YOUTUBE_CLIENT_ID or YOUTUBE_CLIENT_SECRET in environment variables.',
        code: 'CONFIG_ERROR',
        category: 'VALIDATION',
        retryable: false,
      });
    }

    let tokenData: {
      access_token: string;
      refresh_token?: string | undefined;
      expires_in: number;
      token_type: string;
      scope: string;
    };

    try {
      const tokenRes = await axios.post<{
        access_token: string;
        refresh_token?: string | undefined;
        expires_in: number;
        token_type: string;
        scope: string;
      }>(
        'https://oauth2.googleapis.com/token',
        new URLSearchParams({
          code: params.code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: params.redirectUri,
          grant_type: 'authorization_code',
        }).toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );
      tokenData = tokenRes.data;
    } catch (err) {
      const axiosErr = err as AxiosError<{ error?: string; error_description?: string }>;
      const desc =
        axiosErr.response?.data?.error_description ||
        axiosErr.response?.data?.error ||
        axiosErr.message;
      throw new PlatformError({
        message: `Failed to exchange authorization code for YouTube tokens: ${desc}`,
        code: 'INVALID_CREDENTIALS',
        category: 'AUTHENTICATION',
        retryable: false,
      });
    }

    const channel = await this.fetchChannelInfo(tokenData.access_token);

    return {
      accessToken: tokenData.access_token,
      ...(tokenData.refresh_token ? { refreshToken: tokenData.refresh_token } : {}),
      expiresIn: tokenData.expires_in,
      externalAccountId: channel.id,
      accountName: `${channel.title} (YouTube)`,
      rawPayload: {
        channelId: channel.id,
        channelTitle: channel.title,
        ...(channel.customUrl ? { customUrl: channel.customUrl } : {}),
        ...(channel.avatarUrl ? { avatarUrl: channel.avatarUrl } : {}),
        scope: tokenData.scope,
        tokenType: tokenData.token_type,
      },
    };
  }

  /**
   * Refreshes an expired Google access token using the permanent refresh token.
   */
  public async refreshAccessToken(refreshToken: string): Promise<{
    accessToken: string;
    expiresIn: number;
  }> {
    const clientId = this.getEffectiveClientId();
    const clientSecret = this.getEffectiveClientSecret();

    if (!clientId || !clientSecret) {
      throw new PlatformError({
        message: 'Missing YOUTUBE_CLIENT_ID or YOUTUBE_CLIENT_SECRET for token refresh.',
        code: 'CONFIG_ERROR',
        category: 'VALIDATION',
        retryable: false,
      });
    }

    try {
      const res = await axios.post<{
        access_token: string;
        expires_in: number;
        token_type: string;
        scope: string;
      }>(
        'https://oauth2.googleapis.com/token',
        new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        }).toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      return {
        accessToken: res.data.access_token,
        expiresIn: res.data.expires_in,
      };
    } catch (err) {
      const axiosErr = err as AxiosError<{ error?: string; error_description?: string }>;
      const desc =
        axiosErr.response?.data?.error_description ||
        axiosErr.response?.data?.error ||
        axiosErr.message;
      throw new PlatformError({
        message: `Failed to refresh YouTube access token: ${desc}`,
        code: 'AUTH_REVOKED',
        category: 'AUTHENTICATION',
        retryable: false,
      });
    }
  }

  /**
   * Queries YouTube Data API v3 channels endpoint to discover channel identity.
   */
  public async fetchChannelInfo(accessToken: string): Promise<YouTubeChannelInfo> {
    try {
      const res = await axios.get<{
        items?: Array<{
          id: string;
          snippet: {
            title: string;
            customUrl?: string;
            thumbnails?: {
              default?: { url?: string };
              high?: { url?: string };
            };
          };
        }>;
      }>('https://www.googleapis.com/youtube/v3/channels', {
        params: {
          part: 'snippet',
          mine: 'true',
        },
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const firstItem = res.data.items?.[0];
      if (!firstItem) {
        throw new PlatformError({
          message: 'No YouTube channel associated with this Google account.',
          code: 'RESOURCE_NOT_FOUND',
          category: 'EXTERNAL',
          retryable: false,
        });
      }

      return {
        id: firstItem.id,
        title: firstItem.snippet.title,
        ...(firstItem.snippet.customUrl ? { customUrl: firstItem.snippet.customUrl } : {}),
        avatarUrl:
          firstItem.snippet.thumbnails?.high?.url || firstItem.snippet.thumbnails?.default?.url,
      };
    } catch (err) {
      if (err instanceof PlatformError) throw err;
      const axiosErr = err as AxiosError<{ error?: { message?: string } }>;
      const msg = axiosErr.response?.data?.error?.message || axiosErr.message;
      throw new PlatformError({
        message: `Failed to fetch YouTube channel info: ${msg}`,
        code: 'INTERNAL_ERROR',
        category: 'EXTERNAL',
        retryable: false,
      });
    }
  }
}
