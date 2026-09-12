/**
 * packages/core/src/domain/content/cross-post-optimizer.ts
 * Intelligent cross-platform content adaptation engine.
 * Synthesizes 2026 industry benchmarks from Buffer (1.7M+ post analysis) and Postiz cross-composer specs.
 */

export type PlatformTarget =
  | 'LINKEDIN'
  | 'X'
  | 'INSTAGRAM'
  | 'TIKTOK'
  | 'YOUTUBE'
  | 'THREADS'
  | 'FACEBOOK'
  | 'PINTEREST'
  | 'BLUESKY'
  | 'TELEGRAM'
  | 'DISCORD';

export interface PlatformLimitConfig {
  maxCharacters: number;
  minMediaItems: number;
  maxMediaItems: number;
  maxHashtags?: number | undefined;
  maxVideoDurationSeconds?: number | undefined;
  supportsTextOnly: boolean;
  supportsChainedReplies: boolean;
  notes: string;
}

export const PLATFORM_LIMITS: Record<PlatformTarget, PlatformLimitConfig> = {
  THREADS: {
    maxCharacters: 500,
    minMediaItems: 0,
    maxMediaItems: 10,
    maxHashtags: 1, // Threads favors 1 topic tag over multiple hashtags
    maxVideoDurationSeconds: 300, // 5 minutes
    supportsTextOnly: true,
    supportsChainedReplies: true,
    notes:
      'Threads favors conversational tone and single topic tags. Images yield 60% more median engagement than plain text (Buffer 2026 benchmark).',
  },
  X: {
    maxCharacters: 280,
    minMediaItems: 0,
    maxMediaItems: 4,
    maxHashtags: 3,
    maxVideoDurationSeconds: 140, // 2m 20s on standard tier
    supportsTextOnly: true,
    supportsChainedReplies: true,
    notes:
      'Standard tier is capped at 280 characters. Links in main tweets suffer algorithmic suppression; use linkInFirstReply when possible.',
  },
  INSTAGRAM: {
    maxCharacters: 2200,
    minMediaItems: 1,
    maxMediaItems: 10,
    maxHashtags: 5, // Meta 2026 anti-spam guideline
    maxVideoDurationSeconds: 1200, // 20 minutes for Reels
    supportsTextOnly: false,
    supportsChainedReplies: false,
    notes:
      'Requires at least one image or video. Meta algorithm prioritizes shares (sends via DM) and saves above likes. Max 5 hashtags.',
  },
  LINKEDIN: {
    maxCharacters: 3000,
    minMediaItems: 0,
    maxMediaItems: 9,
    maxHashtags: 5,
    maxVideoDurationSeconds: 600, // 10 minutes
    supportsTextOnly: true,
    supportsChainedReplies: false,
    notes:
      'Professional tone. Document carousels (PDF) outperform standard single images. Wednesday 4:00 PM is peak engagement window.',
  },
  BLUESKY: {
    maxCharacters: 300,
    minMediaItems: 0,
    maxMediaItems: 4,
    supportsTextOnly: true,
    supportsChainedReplies: true,
    notes:
      'Decentralized microblogging capped at 300 characters. Niche community discussions thrive.',
  },
  TIKTOK: {
    maxCharacters: 2200,
    minMediaItems: 1,
    maxMediaItems: 35,
    maxVideoDurationSeconds: 3600, // 60 minutes
    supportsTextOnly: false,
    supportsChainedReplies: false,
    notes: 'Video-first platform. First 3 seconds dictate retention.',
  },
  FACEBOOK: {
    maxCharacters: 63206,
    minMediaItems: 0,
    maxMediaItems: 30,
    supportsTextOnly: true,
    supportsChainedReplies: false,
    notes: 'Supports long-form updates and rich link previews.',
  },
  PINTEREST: {
    maxCharacters: 500,
    minMediaItems: 1,
    maxMediaItems: 5,
    supportsTextOnly: false,
    supportsChainedReplies: false,
    notes: 'Visual search engine. Optimal aspect ratio is 2:3 vertical.',
  },
  TELEGRAM: {
    maxCharacters: 4096,
    minMediaItems: 0,
    maxMediaItems: 10,
    supportsTextOnly: true,
    supportsChainedReplies: false,
    notes: 'Supports markdown and HTML formatting, channel broadcasts, and media groups.',
  },
  DISCORD: {
    maxCharacters: 2000,
    minMediaItems: 0,
    maxMediaItems: 10,
    supportsTextOnly: true,
    supportsChainedReplies: true,
    notes: 'Webhook and bot integration with rich embeds up to 4096 characters.',
  },
  YOUTUBE: {
    maxCharacters: 5000,
    minMediaItems: 1,
    maxMediaItems: 1,
    maxVideoDurationSeconds: 180, // Shorts up to 3 mins (2025/2026 update)
    supportsTextOnly: false,
    supportsChainedReplies: false,
    notes: 'Search-driven video discovery with titles and descriptions.',
  },
};

export interface CrossPostOptimizationIssue {
  severity: 'ERROR' | 'WARNING' | 'SUGGESTION';
  code: string;
  message: string;
  suggestedAction?: string | undefined;
}

export interface PlatformOptimizedVariant {
  platform: PlatformTarget;
  adaptedBody: string;
  characterCount: number;
  exceedsLimit: boolean;
  issues: CrossPostOptimizationIssue[];
  suggestedThreadChain?: string[] | undefined;
}

export interface CrossPostInput {
  body: string;
  mediaUrls?: string[] | undefined;
  targetPlatforms: PlatformTarget[];
}

export class CrossPostOptimizer {
  /**
   * Extracts all hashtags from text.
   */
  public extractHashtags(text: string): string[] {
    const matches = text.match(/#[\p{L}\p{N}_]+/gu);
    return matches ? Array.from(new Set(matches)) : [];
  }

  /**
   * Extracts URLs from text.
   */
  public extractUrls(text: string): string[] {
    const matches = text.match(/https?:\/\/[^\s]+/gi);
    return matches ? Array.from(new Set(matches)) : [];
  }

  /**
   * Splits long-form text into a sequential thread chain respecting sentence and paragraph boundaries.
   */
  public splitIntoThread(text: string, maxChars = 500): string[] {
    const trimmed = text.trim();
    if (trimmed.length <= maxChars) {
      return [trimmed];
    }

    const paragraphs = trimmed.split(/\n\s*\n/);
    const chain: string[] = [];
    let currentChunk = '';

    for (const paragraph of paragraphs) {
      if ((currentChunk + '\n\n' + paragraph).trim().length <= maxChars) {
        currentChunk = currentChunk ? `${currentChunk}\n\n${paragraph}` : paragraph;
      } else {
        if (currentChunk) {
          chain.push(currentChunk.trim());
          currentChunk = '';
        }

        // If a single paragraph exceeds maxChars, split by sentences
        if (paragraph.length > maxChars) {
          const sentences = paragraph.split(/(?<=[.?!؟।])\s+/);
          for (const sentence of sentences) {
            if ((currentChunk + ' ' + sentence).trim().length <= maxChars) {
              currentChunk = currentChunk ? `${currentChunk} ${sentence}` : sentence;
            } else {
              if (currentChunk) chain.push(currentChunk.trim());
              if (sentence.length > maxChars) {
                // Hard wrap words if a single sentence is giant
                const words = sentence.split(/\s+/);
                currentChunk = '';
                for (const word of words) {
                  if ((currentChunk + ' ' + word).trim().length <= maxChars) {
                    currentChunk = currentChunk ? `${currentChunk} ${word}` : word;
                  } else {
                    if (currentChunk) chain.push(currentChunk.trim());
                    currentChunk = word;
                  }
                }
              } else {
                currentChunk = sentence;
              }
            }
          }
        } else {
          currentChunk = paragraph;
        }
      }
    }

    if (currentChunk.trim()) {
      chain.push(currentChunk.trim());
    }

    return chain;
  }

  /**
   * Analyzes and optimizes content for all targeted social platforms.
   */
  public optimize(input: CrossPostInput): Record<PlatformTarget, PlatformOptimizedVariant> {
    const results = {} as Record<PlatformTarget, PlatformOptimizedVariant>;
    const rawBody = input.body.trim();
    const mediaUrls = input.mediaUrls || [];
    const hashtags = this.extractHashtags(rawBody);
    const urls = this.extractUrls(rawBody);

    for (const platform of input.targetPlatforms) {
      const config = PLATFORM_LIMITS[platform];
      const issues: CrossPostOptimizationIssue[] = [];
      let adaptedBody = rawBody;
      let suggestedThreadChain: string[] | undefined;

      // 1. Media requirement validation
      if (!config.supportsTextOnly && mediaUrls.length === 0) {
        issues.push({
          severity: 'ERROR',
          code: 'MEDIA_REQUIRED',
          message: `${platform} does not support text-only posts. At least 1 media item is required.`,
          suggestedAction: 'Attach an image or video before publishing.',
        });
      }

      if (mediaUrls.length > config.maxMediaItems) {
        issues.push({
          severity: 'ERROR',
          code: 'TOO_MANY_MEDIA_ITEMS',
          message: `${platform} supports a maximum of ${config.maxMediaItems} media attachments (provided ${mediaUrls.length}).`,
          suggestedAction: `Reduce attachments to ${config.maxMediaItems} or fewer.`,
        });
      }

      // 2. Character length validation & thread chain suggestion
      if (rawBody.length > config.maxCharacters) {
        if (config.supportsChainedReplies) {
          suggestedThreadChain = this.splitIntoThread(rawBody, config.maxCharacters);
          issues.push({
            severity: 'WARNING',
            code: 'EXCEEDS_LENGTH_SPLIT_RECOMMENDED',
            message: `Body (${rawBody.length} chars) exceeds ${platform} limit of ${config.maxCharacters} chars.`,
            suggestedAction: `Auto-split into a chained thread of ${suggestedThreadChain.length} items.`,
          });
        } else {
          issues.push({
            severity: 'ERROR',
            code: 'EXCEEDS_LENGTH_NO_THREADS',
            message: `Body (${rawBody.length} chars) exceeds ${platform} limit of ${config.maxCharacters} chars and cannot be threaded.`,
            suggestedAction: `Trim text by at least ${rawBody.length - config.maxCharacters} characters.`,
          });
        }
      }

      // 3. Platform specific heuristics
      if (platform === 'INSTAGRAM') {
        if (hashtags.length > 5) {
          issues.push({
            severity: 'WARNING',
            code: 'INSTAGRAM_HASHTAG_LIMIT',
            message: `Found ${hashtags.length} hashtags. Instagram 2026 guidelines recommend max 5 hashtags for optimal distribution.`,
            suggestedAction: 'Trim excess hashtags to avoid anti-spam reach penalties.',
          });
        }
        if (urls.length > 0) {
          issues.push({
            severity: 'SUGGESTION',
            code: 'INSTAGRAM_NON_CLICKABLE_URLS',
            message: 'URLs in Instagram captions are not clickable for viewers.',
            suggestedAction: 'Consider mentioning "link in bio" or sharing via Story instead.',
          });
        }
      } else if (platform === 'X') {
        if (urls.length > 0) {
          issues.push({
            severity: 'SUGGESTION',
            code: 'X_LINK_PENALTY_AVOIDANCE',
            message:
              'External URLs in the main post are demoted by the X algorithm. Consider moving links to the first reply.',
            suggestedAction: 'Enable linkInFirstReply: true.',
          });
        }
      } else if (platform === 'THREADS') {
        const hasVideo = mediaUrls.some((url) => /\.(mp4|mov|avi|wmv)($|\?)/i.test(url));
        const hasImage = mediaUrls.some((url) => /\.(jpg|jpeg|png|webp|avif)($|\?)/i.test(url));
        if (hasVideo && hasImage) {
          issues.push({
            severity: 'ERROR',
            code: 'THREADS_MIXED_MEDIA_NOT_ALLOWED',
            message:
              'Threads does not allow mixing images and videos in a single post (carousel or standalone).',
            suggestedAction:
              'Publish images and videos as separate posts or attach only images or only video.',
          });
        }
        const videoCount = mediaUrls.filter((url) =>
          /\.(mp4|mov|avi|wmv)($|\?)/i.test(url)
        ).length;
        if (videoCount > 1) {
          issues.push({
            severity: 'ERROR',
            code: 'THREADS_MAX_ONE_VIDEO',
            message: 'Threads allows a maximum of 1 video per post.',
            suggestedAction: 'Select 1 video or distribute across chained thread replies.',
          });
        }
        if (mediaUrls.some((url) => /\.gif($|\?)/i.test(url))) {
          issues.push({
            severity: 'WARNING',
            code: 'THREADS_GIF_NOT_SUPPORTED',
            message: 'Animated GIFs are not supported by the Threads API.',
            suggestedAction: 'Convert GIF to MP4 video before publishing.',
          });
        }
        if (hashtags.length > 1) {
          issues.push({
            severity: 'SUGGESTION',
            code: 'THREADS_TOPIC_TAG_PREFERENCE',
            message:
              'Threads performs best when using 1 specific topic tag rather than multiple hashtags.',
            suggestedAction: 'Use metadata.topicTag to categorize your thread into community hubs.',
          });
        }
      }

      results[platform] = {
        platform,
        adaptedBody,
        characterCount: adaptedBody.length,
        exceedsLimit: rawBody.length > config.maxCharacters,
        issues,
        suggestedThreadChain,
      };
    }

    return results;
  }
}

export const crossPostOptimizer = new CrossPostOptimizer();
