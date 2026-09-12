import axios from 'axios';
import type {
  OAuthCallbackParams,
  OAuthInitParams,
  OAuthInitResult,
  PlatformAdapter,
  PlatformCapabilities,
  PublishRequest,
  PublishResult,
  SocialPlatformType,
  TokenExchangeResult,
} from '../../contracts/platform.contract.js';
import { PlatformError } from '../../errors/social.error.js';
import { LinkedInOAuth } from './linkedin.oauth.js';

export class LinkedInAdapter implements PlatformAdapter {
  public readonly platform: SocialPlatformType = 'LINKEDIN';
  private readonly oauth: LinkedInOAuth;

  constructor(clientId?: string, clientSecret?: string) {
    this.oauth = new LinkedInOAuth(clientId, clientSecret);
  }

  public getCapabilities(): PlatformCapabilities {
    return {
      supportsText: true,
      supportsImage: true,
      supportsVideo: true,
      supportsCarousel: true,
      supportsThreads: false,
      supportsScheduling: true,
      supportsMetrics: true,
      supportsWebhooks: true,
      maxTextLength: 3000,
    };
  }

  public async getAuthorizationUrl(params: OAuthInitParams): Promise<OAuthInitResult> {
    return this.oauth.getAuthorizationUrl(params);
  }

  public async exchangeCodeForTokens(params: OAuthCallbackParams): Promise<TokenExchangeResult> {
    return this.oauth.exchangeCodeForTokens(params);
  }

  public async refreshAccessToken(
    refreshToken: string
  ): Promise<{ accessToken: string; refreshToken?: string; expiresIn?: number }> {
    return this.oauth.refreshAccessToken(refreshToken);
  }

  public async publish(request: PublishRequest): Promise<PublishResult> {
    const accessToken = (request.metadata?.accessToken as string) || '';
    const authorUrn =
      (request.metadata?.authorUrn as string) ||
      (request.accountId ? `urn:li:person:${request.accountId}` : '');

    if (!accessToken) {
      throw new PlatformError({
        message: 'Missing LinkedIn access token in request metadata',
        code: 'MISSING_ACCESS_TOKEN',
        retryable: false,
      });
    }

    try {
      const visibilitySetting =
        (request.metadata?.visibility as string) === 'CONNECTIONS' ? 'CONNECTIONS' : 'PUBLIC';
      const postType = (request.metadata?.postType as string) || '';

      let shareMediaCategory: 'NONE' | 'ARTICLE' | 'IMAGE' | 'DOCUMENT' = 'NONE';
      let mediaItems: unknown[] = [];

      if (request.metadata?.documentTitle || postType === 'DOCUMENT') {
        shareMediaCategory = 'DOCUMENT';
        mediaItems = request.mediaUrls.map((url) => ({
          status: 'READY',
          originalUrl: url,
          ...(request.metadata?.documentTitle
            ? { title: { text: String(request.metadata.documentTitle) } }
            : {}),
        }));
      } else if (postType === 'ARTICLE' || request.metadata?.articleUrl) {
        shareMediaCategory = 'ARTICLE';
        const articleUrl = (request.metadata?.articleUrl as string) || request.mediaUrls[0];
        const titleText =
          (request.metadata?.articleTitle as string) ||
          (request.metadata?.title as string) ||
          undefined;
        const descText =
          (request.metadata?.articleDescription as string) ||
          (request.metadata?.description as string) ||
          undefined;

        mediaItems = [
          {
            status: 'READY',
            originalUrl: articleUrl,
            ...(titleText ? { title: { text: titleText } } : {}),
            ...(descText ? { description: { text: descText } } : {}),
          },
        ];
      } else if (request.mediaUrls.length > 0) {
        shareMediaCategory = 'IMAGE';
        const uploadedAssets: Array<{ status: string; media: string; title?: { text: string } }> =
          [];
        for (const url of request.mediaUrls) {
          const assetUrn = await this.registerAndUploadImage(url, authorUrn, accessToken);
          uploadedAssets.push({
            status: 'READY',
            media: assetUrn,
            title: { text: request.text?.slice(0, 50) || 'Scriora Media' },
          });
        }
        mediaItems = uploadedAssets;
      }

      // Process LinkedIn company page mentions into native UGC attributes
      const postText = request.text || '';
      const mentionsList = Array.isArray(request.metadata?.mentions)
        ? (request.metadata.mentions as Array<{ text: string; urn: string }>)
        : [];

      const mentionAttributes: Array<{
        start: number;
        length: number;
        value: { 'com.linkedin.common.CompanyURN': string };
      }> = [];

      for (const mention of mentionsList) {
        if (typeof mention?.text === 'string' && typeof mention?.urn === 'string') {
          const idx = postText.indexOf(mention.text);
          if (idx !== -1) {
            mentionAttributes.push({
              start: idx,
              length: mention.text.length,
              value: {
                'com.linkedin.common.CompanyURN': mention.urn,
              },
            });
          }
        }
      }

      const payload = {
        author: authorUrn,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: {
              text: postText,
              ...(mentionAttributes.length > 0 ? { attributes: mentionAttributes } : {}),
            },
            shareMediaCategory,
            ...(mediaItems.length > 0 ? { media: mediaItems } : {}),
          },
        },
        visibility: {
          'com.linkedin.ugc.MemberNetworkVisibility': visibilitySetting,
        },
      };

      const response = await axios.post('https://api.linkedin.com/v2/ugcPosts', payload, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'X-Restli-Protocol-Version': '2.0.0',
          'Content-Type': 'application/json',
        },
      });

      const externalPostId =
        response.data?.id ||
        (response.headers['x-restli-id'] as string) ||
        `urn:li:share:${request.idempotencyKey}`;
      const externalPostUrl = `https://www.linkedin.com/feed/update/${encodeURIComponent(externalPostId)}`;

      return {
        status: 'SUCCEEDED',
        externalPostId,
        externalPostUrl,
        publishedAt: new Date(),
        operationId: request.idempotencyKey,
        platformMetadata: {
          ugcPostId: externalPostId,
          apiVersion: 'v2/ugcPosts',
          responseStatus: response.status,
        },
      };
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        const retryable = status === 429 || (status !== undefined && status >= 500 && status < 600);
        const retryAfterHeader = err.response?.headers['retry-after'];
        const retryAfterMs = retryAfterHeader
          ? Number.parseInt(retryAfterHeader, 10) * 1000
          : undefined;

        throw new PlatformError({
          message: `LinkedIn API error (${status}): ${err.response?.data?.message || err.message}`,
          code: status === 429 ? 'RATE_LIMITED' : status === 401 ? 'TOKEN_EXPIRED' : 'API_ERROR',
          retryable,
          platformCode: String(status),
          retryAfterMs,
        });
      }

      throw new PlatformError({
        message: err instanceof Error ? err.message : 'Unknown publish failure',
        code: 'UNKNOWN_ERROR',
        retryable: false,
      });
    }
  }

  private async registerAndUploadImage(
    imageUrl: string,
    authorUrn: string,
    accessToken: string
  ): Promise<string> {
    const registerResponse = await axios.post(
      'https://api.linkedin.com/v2/assets?action=registerUpload',
      {
        registerUploadRequest: {
          recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
          owner: authorUrn,
          serviceRelationships: [
            {
              relationshipType: 'OWNER',
              identifier: 'urn:li:userGeneratedContent',
            },
          ],
        },
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'X-Restli-Protocol-Version': '2.0.0',
          'Content-Type': 'application/json',
        },
      }
    );

    const uploadUrl =
      registerResponse.data?.value?.uploadMechanism?.[
        'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'
      ]?.uploadUrl;
    const assetUrn = registerResponse.data?.value?.asset as string;

    if (!uploadUrl || !assetUrn) {
      throw new PlatformError({
        message: 'Failed to obtain LinkedIn image upload URL or asset URN',
        code: 'MEDIA_UPLOAD_FAILED',
        retryable: true,
      });
    }

    if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
      const imgRes = await axios.get(imageUrl, { responseType: 'arraybuffer' });
      const contentType = (imgRes.headers['content-type'] as string) || 'image/png';
      await axios.post(uploadUrl, imgRes.data, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': contentType,
        },
      });
    } else if (imageUrl.startsWith('urn:li:digitalmediaAsset:')) {
      return imageUrl;
    } else {
      throw new PlatformError({
        message: `Unsupported image URL or format: ${imageUrl}`,
        code: 'INVALID_MEDIA_URL',
        retryable: false,
      });
    }

    return assetUrn;
  }

  public async verify(externalPostId: string): Promise<boolean> {
    if (!externalPostId) return false;
    return externalPostId.startsWith('urn:li:');
  }

  public async deletePost(externalPostId: string, accessToken: string): Promise<boolean> {
    if (!externalPostId || !accessToken) return false;
    try {
      const response = await axios.delete(
        `https://api.linkedin.com/v2/ugcPosts/${encodeURIComponent(externalPostId)}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'X-Restli-Protocol-Version': '2.0.0',
          },
        }
      );
      return response.status === 200 || response.status === 204;
    } catch {
      return false;
    }
  }
}
