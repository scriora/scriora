import { describe, expect, it } from 'vitest';
import { crossPostOptimizer } from '../../src/domain/content/cross-post-optimizer.js';

describe('CrossPostOptimizer (Buffer & Postiz Heuristics)', () => {
  it('enforces Instagram media requirement (no text-only allowed)', () => {
    const result = crossPostOptimizer.optimize({
      body: 'Announcing our new feature! Check it out.',
      mediaUrls: [],
      targetPlatforms: ['INSTAGRAM', 'THREADS', 'X'],
    });

    expect(result.INSTAGRAM.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'ERROR',
          code: 'MEDIA_REQUIRED',
        }),
      ])
    );

    // Threads and X allow text-only
    expect(result.THREADS.issues.some((i) => i.code === 'MEDIA_REQUIRED')).toBe(false);
    expect(result.X.issues.some((i) => i.code === 'MEDIA_REQUIRED')).toBe(false);
  });

  it('suggests auto-splitting into thread chain when text exceeds platform limits', () => {
    const longText =
      'Step 1: Introduction to scalable design. First we build the foundation with zero technical debt.\n\n' +
      'Step 2: Architecture of multi-tenant databases and isolation using PostgreSQL Row Level Security.\n\n' +
      'Step 3: Event-driven pub/sub background queues using Inngest and Redis workers.\n\n' +
      'Step 4: Real-time telemetry monitoring and automated self-healing loops for 99.99% uptime.';

    const result = crossPostOptimizer.optimize({
      body: longText,
      targetPlatforms: ['X', 'THREADS'],
    });

    // X has 280 character limit
    expect(result.X.exceedsLimit).toBe(true);
    expect(result.X.suggestedThreadChain?.length).toBeGreaterThanOrEqual(2);
    expect(result.X.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'EXCEEDS_LENGTH_SPLIT_RECOMMENDED',
        }),
      ])
    );
  });

  it('warns about Instagram 2026 hashtag limit (max 5)', () => {
    const result = crossPostOptimizer.optimize({
      body: 'Beautiful sunset in Cairo #sunset #cairo #egypt #travel #photography #goldenhour #summer',
      mediaUrls: ['https://cdn.scriora.com/photo.jpg'],
      targetPlatforms: ['INSTAGRAM', 'THREADS'],
    });

    expect(result.INSTAGRAM.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'INSTAGRAM_HASHTAG_LIMIT',
          severity: 'WARNING',
        }),
      ])
    );
  });

  it('warns about external links in main post on X to avoid algorithm demotion', () => {
    const result = crossPostOptimizer.optimize({
      body: 'Check out our new release notes here: https://scriora.com/blog/v2-release',
      targetPlatforms: ['X', 'LINKEDIN'],
    });

    expect(result.X.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'X_LINK_PENALTY_AVOIDANCE',
        }),
      ])
    );
  });

  it('warns about external links in Facebook post to avoid 14M study reach penalty', () => {
    const result = crossPostOptimizer.optimize({
      body: 'Check out our new update: https://scriora.com/blog/update',
      targetPlatforms: ['FACEBOOK'],
    });

    expect(result.FACEBOOK.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'FACEBOOK_LINK_REACH_PENALTY',
          severity: 'SUGGESTION',
        }),
      ])
    );
  });

  it('validates YouTube titles for prohibited < and > characters and warns about mobile truncation', () => {
    const result = crossPostOptimizer.optimize({
      body: 'How to build <AI Agents> with Node.js & TypeScript and make $10k/month on YouTube easily',
      targetPlatforms: ['YOUTUBE'],
      mediaUrls: ['https://example.com/video.mp4'],
    });

    expect(result.YOUTUBE.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'YOUTUBE_TITLE_FORBIDDEN_CHARACTERS',
          severity: 'ERROR',
        }),
        expect.objectContaining({
          code: 'YOUTUBE_TITLE_MOBILE_TRUNCATION',
          severity: 'WARNING',
        }),
      ])
    );
  });

  it('suggests placing links in firstComment on YouTube', () => {
    const result = crossPostOptimizer.optimize({
      body: 'Check out the full repository here: https://github.com/scriora/scriora',
      targetPlatforms: ['YOUTUBE'],
      mediaUrls: ['https://example.com/video.mp4'],
    });

    expect(result.YOUTUBE.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'YOUTUBE_FIRST_COMMENT_LINKS',
          severity: 'SUGGESTION',
        }),
      ])
    );
  });

  it('correctly splits long paragraphs without cutting words', () => {
    const text =
      'Sentence one is short. Sentence two is slightly longer and contains informative details. ' +
      'Sentence three continues the explanation. Sentence four concludes the section.';

    const thread = crossPostOptimizer.splitIntoThread(text, 60);
    expect(thread.length).toBeGreaterThan(1);
    for (const item of thread) {
      expect(item.length).toBeLessThanOrEqual(60);
    }
  });
});
