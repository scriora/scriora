import { crossPostOptimizer, defaultDateTimeService } from 'scriora-core';
import { describe, expect, it } from 'vitest';

describe('Scriora MCP Tool Engine', () => {
  it('optimizes Facebook copy detecting link reach penalty and limits', () => {
    const analysis = crossPostOptimizer.optimize({
      body: 'Check out our new launch here: https://scriora.io/launch',
      targetPlatforms: ['FACEBOOK', 'THREADS'],
    });

    expect(analysis.FACEBOOK).toBeDefined();
    expect(analysis.FACEBOOK.characterCount).toBeGreaterThan(0);
    expect(analysis.FACEBOOK.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'FACEBOOK_LINK_REACH_PENALTY',
          severity: 'SUGGESTION',
        }),
      ])
    );
  });

  it('retrieves Facebook golden slots from Buffer 14M dataset (Thursday 9 AM peak)', () => {
    const slots = defaultDateTimeService.getSmartScheduleSlots({
      platform: 'FACEBOOK',
      timezone: 'Africa/Cairo',
      daysAhead: 7,
    });

    expect(slots.length).toBeGreaterThan(0);
    const top = slots[0]!;
    expect(top.score).toBe(100);
    expect(top.localTime).toBe('09:00');
    expect(top.recommendationReason).toContain('الخميس 9:00 ص');
    expect(top.recommendationReason).toContain('14M');
  });
});
