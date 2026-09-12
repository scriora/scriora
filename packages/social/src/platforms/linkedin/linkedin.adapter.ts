import axios from 'axios';
import {
  assertSafeRemoteUrl,
  fetchSafeRemoteUrl,
  UnsafeRemoteUrlError,
} from 'scriora-core/security';
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
        value: Record<string, unknown>;
      }> = [];

      for (const mention of mentionsList) {
        if (typeof mention?.text === 'string' && typeof mention?.urn === 'string') {
          const idx = postText.indexOf(mention.text);
          if (idx !== -1) {
            let valuePayload: Record<string, unknown>;
            if (
              mention.urn.startsWith('urn:li:organization:') ||
              mention.urn.startsWith('urn:li:company:')
            ) {
              const companyId = mention.urn.replace(/^urn:li:(organization|company):/, '');
              valuePayload = {
                'com.linkedin.common.CompanyAttributedEntity': {
                  company: `urn:li:company:${companyId}`,
                },
              };
            } else if (mention.urn.startsWith('urn:li:organizationalPage:')) {
              valuePayload = {
                'com.linkedin.common.OrganizationalPageAttributedEntity': {
                  organizationalPage: mention.urn,
                },
              };
            } else if (
              mention.urn.startsWith('urn:li:person:') ||
              mention.urn.startsWith('urn:li:member:')
            ) {
              valuePayload = {
                'com.linkedin.common.MemberAttributedEntity': {
                  member: mention.urn,
                },
              };
            } else {
              valuePayload = {
                'com.linkedin.common.CompanyAttributedEntity': {
                  company: mention.urn,
                },
              };
            }

            mentionAttributes.push({
              start: idx,
              length: mention.text.length,
              value: valuePayload,
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
      if (err instanceof PlatformError) {
        throw err;
      }
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
    if (imageUrl.startsWith('urn:li:digitalmediaAsset:')) {
      return imageUrl;
    }

    this.assertAllowlistedMediaUrl(imageUrl);

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

    let fileBuffer: Buffer;
    let contentType: string;
    try {
      const downloaded = await fetchSafeRemoteUrl(imageUrl);
      fileBuffer = downloaded.buffer;
      contentType = downloaded.contentType || 'image/png';
    } catch (err: unknown) {
      if (err instanceof UnsafeRemoteUrlError) {
        throw new PlatformError({
          message: err.message,
          code: 'INVALID_MEDIA_URL',
          category: 'VALIDATION',
          retryable: false,
        });
      }
      throw new PlatformError({
        message: `Failed to download LinkedIn image: ${err instanceof Error ? err.message : String(err)}`,
        code: 'INVALID_MEDIA_URL',
        category: 'VALIDATION',
        retryable: false,
      });
    }

    await axios.post(uploadUrl, fileBuffer, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': contentType,
      },
    });

    return assetUrn;
  }

  public async registerAndUploadDocument(
    documentUrl: string,
    authorUrn: string,
    accessToken: string
  ): Promise<string> {
    if (documentUrl.startsWith('urn:li:document:')) {
      return documentUrl;
    }

    this.assertAllowlistedMediaUrl(documentUrl);

    try {
      const initRes = await axios.post(
        'https://api.linkedin.com/rest/documents?action=initializeUpload',
        {
          initializeUploadRequest: {
            owner: authorUrn,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'LinkedIn-Version': '202503',
            'X-Restli-Protocol-Version': '2.0.0',
            'Content-Type': 'application/json',
          },
        }
      );

      const uploadUrl = initRes.data?.value?.uploadUrl;
      const documentUrn = initRes.data?.value?.document;

      if (!uploadUrl || !documentUrn) {
        throw new PlatformError({
          message: 'Failed to obtain LinkedIn document upload URL or document URN',
          code: 'MEDIA_UPLOAD_FAILED',
          retryable: true,
        });
      }

      let fileBuffer: Buffer;
      try {
        const downloaded = await fetchSafeRemoteUrl(documentUrl);
        fileBuffer = downloaded.buffer;
      } catch (err: unknown) {
        if (err instanceof UnsafeRemoteUrlError) {
          throw new PlatformError({
            message: err.message,
            code: 'INVALID_MEDIA_URL',
            category: 'VALIDATION',
            retryable: false,
          });
        }
        throw err;
      }

      await axios.put(uploadUrl, fileBuffer, {
        headers: {
          'Content-Type': 'application/pdf',
        },
      });

      return documentUrn;
    } catch (err: unknown) {
      if (err instanceof PlatformError) throw err;
      throw new PlatformError({
        message: `Failed to upload document to LinkedIn: ${err instanceof Error ? err.message : String(err)}`,
        code: 'MEDIA_UPLOAD_FAILED',
        retryable: false,
      });
    }
  }

  public async publishDocumentPost(
    authorUrn: string,
    accessToken: string,
    documentUrn: string,
    documentTitle: string,
    request: PublishRequest,
    visibilitySetting: string = 'PUBLIC'
  ): Promise<PublishResult> {
    try {
      const postPayload = {
        author: authorUrn,
        commentary: request.text || '',
        visibility: visibilitySetting === 'CONNECTIONS' ? 'CONNECTIONS' : 'PUBLIC',
        distribution: {
          feedDistribution: 'MAIN_FEED',
          targetEntities: [],
          thirdPartyDistributionChannels: [],
        },
        content: {
          media: {
            title: documentTitle,
            id: documentUrn,
          },
        },
        lifecycleState: 'PUBLISHED',
        isReshareDisabledByAuthor: false,
      };

      const response = await axios.post('https://api.linkedin.com/rest/posts', postPayload, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'LinkedIn-Version': '202503',
          'X-Restli-Protocol-Version': '2.0.0',
          'Content-Type': 'application/json',
        },
      });

      const externalPostId =
        (response.headers['x-restli-id'] as string) ||
        (response.headers['x-linkedin-id'] as string) ||
        response.data?.id ||
        `urn:li:ugcPost:${request.idempotencyKey}`;
      const externalPostUrl = `https://www.linkedin.com/feed/update/${encodeURIComponent(externalPostId)}`;

      return {
        status: 'SUCCEEDED',
        externalPostId,
        externalPostUrl,
        publishedAt: new Date(),
        operationId: request.idempotencyKey,
        platformMetadata: {
          documentUrn,
          apiVersion: 'rest/posts (202503)',
          responseStatus: response.status,
        },
      };
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        throw new PlatformError({
          message: `LinkedIn Document Post error (${err.response?.status}): ${JSON.stringify(err.response?.data || err.message)}`,
          code: 'API_ERROR',
          retryable: false,
          platformCode: String(err.response?.status),
        });
      }
      throw new PlatformError({
        message: err instanceof Error ? err.message : 'Unknown document publish failure',
        code: 'UNKNOWN_ERROR',
        retryable: false,
      });
    }
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

  private assertAllowlistedMediaUrl(url: string): void {
    try {
      assertSafeRemoteUrl(url);
    } catch (err: unknown) {
      throw new PlatformError({
        message: err instanceof Error ? err.message : 'Media URL is not allowed',
        code: 'INVALID_MEDIA_URL',
        category: 'VALIDATION',
        retryable: false,
      });
    }
  }
}
