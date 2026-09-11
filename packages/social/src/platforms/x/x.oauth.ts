import crypto from 'node:crypto';
import axios from 'axios';
import type {
  OAuthCallbackParams,
  OAuthInitParams,
  OAuthInitResult,
  TokenExchangeResult,
} from '../../contracts/platform.contract.js';
import { PlatformError } from '../../errors/social.error.js';

export class XOAuth {
  private readonly clientId: string | undefined;
  private readonly clientSecret: string | undefined;

  constructor(clientId?: string | undefined, clientSecret?: string | undefined) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
  }

  private get effectiveClientId(): string {
    return this.clientId || process.env.X_CLIENT_ID || process.env.TWITTER_CLIENT_ID || '';
  }

  private get effectiveClientSecret(): string {
    return (
      this.clientSecret || process.env.X_CLIENT_SECRET || process.env.TWITTER_CLIENT_SECRET || ''
    );
  }

  public static generatePKCE(): { codeVerifier: string; codeChallenge: string } {
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
    return { codeVerifier, codeChallenge };
  }

  public getAuthorizationUrl(params: OAuthInitParams): OAuthInitResult {
    const clientId = this.effectiveClientId;
    if (!clientId) {
      throw new PlatformError({
        message: 'X_CLIENT_ID is not configured in environment',
        code: 'MISSING_CLIENT_ID',
        retryable: false,
      });
    }

    const codeChallenge = crypto
      .createHash('sha256')
      .update(params.codeVerifier)
      .digest('base64url');
    const scope = encodeURIComponent('tweet.read tweet.write users.read offline.access');

    const authorizationUrl = `https://twitter.com/i/oauth2/authorize?response_type=code&client_id=${encodeURIComponent(
      clientId
    )}&redirect_uri=${encodeURIComponent(params.redirectUri)}&state=${encodeURIComponent(
      params.state
    )}&scope=${scope}&code_challenge=${codeChallenge}&code_challenge_method=S256`;

    return { authorizationUrl };
  }

  public async exchangeCodeForTokens(params: OAuthCallbackParams): Promise<TokenExchangeResult> {
    try {
      const clientId = this.effectiveClientId;
      const clientSecret = this.effectiveClientSecret;
      const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code: params.code,
        redirect_uri: params.redirectUri,
        code_verifier: params.codeVerifier,
        client_id: clientId,
      });

      const response = await axios.post('https://api.twitter.com/2/oauth2/token', body.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          ...(clientSecret ? { Authorization: `Basic ${basicAuth}` } : {}),
        },
      });

      const { access_token, expires_in, refresh_token } = response.data;

      // Fetch Twitter/X user profile to obtain id, name, username
      const meRes = await axios.get('https://api.twitter.com/2/users/me', {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      });

      const user = meRes.data?.data;
      const externalAccountId = user?.id ?? 'unknown_x_id';
      const accountName = user?.username ? `@${user.username}` : (user?.name ?? 'X Account');

      return {
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresIn: expires_in,
        externalAccountId,
        accountName,
        rawPayload: { user, ...response.data },
      };
    } catch (e: unknown) {
      const err = e as { response?: { data?: unknown; status?: number }; message?: string };
      throw new PlatformError({
        message: `Failed to exchange X OAuth code for tokens: ${err.message ?? 'Unknown error'}`,
        code: 'OAUTH_EXCHANGE_FAILED',
        retryable: false,
        platformCode: String(err.response?.status ?? ''),
      });
    }
  }

  public async refreshAccessToken(
    refreshToken: string
  ): Promise<{ accessToken: string; refreshToken?: string; expiresIn?: number }> {
    try {
      const clientId = this.effectiveClientId;
      const clientSecret = this.effectiveClientSecret;
      const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
      const body = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId,
      });

      const response = await axios.post('https://api.twitter.com/2/oauth2/token', body.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          ...(clientSecret ? { Authorization: `Basic ${basicAuth}` } : {}),
        },
      });

      const { access_token, expires_in, refresh_token } = response.data;
      return {
        accessToken: access_token,
        refreshToken: refresh_token ?? refreshToken,
        expiresIn: expires_in,
      };
    } catch (e: unknown) {
      const err = e as { response?: { data?: unknown; status?: number }; message?: string };
      throw new PlatformError({
        message: `Failed to refresh X access token: ${err.message ?? 'Unknown error'}`,
        code: 'OAUTH_REFRESH_FAILED',
        retryable: false,
        platformCode: String(err.response?.status ?? ''),
      });
    }
  }
}
