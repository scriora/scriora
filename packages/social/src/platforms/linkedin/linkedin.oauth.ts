import crypto from 'node:crypto';
import axios from 'axios';
import type {
  OAuthCallbackParams,
  OAuthInitParams,
  OAuthInitResult,
  TokenExchangeResult,
} from '../../contracts/platform.contract.js';
import { PlatformError } from '../../errors/social.error.js';

export class LinkedInOAuth {
  private readonly clientId: string | undefined;
  private readonly clientSecret: string | undefined;

  constructor(clientId?: string | undefined, clientSecret?: string | undefined) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
  }

  private get effectiveClientId(): string {
    return this.clientId || process.env.LINKEDIN_CLIENT_ID || '';
  }

  private get effectiveClientSecret(): string {
    return this.clientSecret || process.env.LINKEDIN_CLIENT_SECRET || '';
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
        message: 'LINKEDIN_CLIENT_ID is not configured in environment',
        code: 'MISSING_CLIENT_ID',
        retryable: false,
      });
    }

    const scope = encodeURIComponent('openid profile email w_member_social');

    const authorizationUrl = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${encodeURIComponent(
      clientId
    )}&redirect_uri=${encodeURIComponent(params.redirectUri)}&state=${encodeURIComponent(
      params.state
    )}&scope=${scope}`;

    return { authorizationUrl };
  }

  public async exchangeCodeForTokens(params: OAuthCallbackParams): Promise<TokenExchangeResult> {
    try {
      const response = await axios.post(
        'https://www.linkedin.com/oauth/v2/accessToken',
        new URLSearchParams({
          grant_type: 'authorization_code',
          code: params.code,
          redirect_uri: params.redirectUri,
          client_id: this.effectiveClientId,
          client_secret: this.effectiveClientSecret,
        }).toString(),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        }
      );

      const { access_token, expires_in, refresh_token, refresh_token_expires_in } = response.data;

      // Fetch LinkedIn Userinfo to obtain member URN (sub) and name
      const userinfoRes = await axios.get('https://api.linkedin.com/v2/userinfo', {
        headers: { Authorization: `Bearer ${access_token}` },
      });

      const externalAccountId = userinfoRes.data.sub;
      const accountName = userinfoRes.data.name || userinfoRes.data.email || 'LinkedIn Member';

      return {
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresIn: expires_in,
        refreshTokenExpiresIn: refresh_token_expires_in,
        externalAccountId,
        accountName,
        rawPayload: userinfoRes.data,
      };
    } catch (err: unknown) {
      const errorMsg = axios.isAxiosError(err)
        ? err.response?.data?.error_description || err.message
        : String(err);
      throw new PlatformError({
        message: `LinkedIn OAuth token exchange failed: ${errorMsg}`,
        code: 'OAUTH_EXCHANGE_FAILED',
        retryable: false,
        platformCode: axios.isAxiosError(err) ? String(err.response?.status) : undefined,
      });
    }
  }

  public async refreshAccessToken(
    refreshToken: string
  ): Promise<{ accessToken: string; refreshToken?: string; expiresIn?: number }> {
    try {
      const response = await axios.post(
        'https://www.linkedin.com/oauth/v2/accessToken',
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: this.effectiveClientId,
          client_secret: this.effectiveClientSecret,
        }).toString(),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        }
      );

      return {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token,
        expiresIn: response.data.expires_in,
      };
    } catch (err: unknown) {
      const errorMsg = axios.isAxiosError(err)
        ? err.response?.data?.error_description || err.message
        : String(err);
      throw new PlatformError({
        message: `LinkedIn token refresh failed: ${errorMsg}`,
        code: 'TOKEN_REFRESH_FAILED',
        retryable: false,
      });
    }
  }
}
