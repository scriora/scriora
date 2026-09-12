import { describe, expect, it } from 'vitest';
import {
  crossPostOptimizer,
  PLATFORM_LIMITS,
} from '../../src/domain/content/cross-post-optimizer.js';

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
