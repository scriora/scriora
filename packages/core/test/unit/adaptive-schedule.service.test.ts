import { describe, expect, it, vi } from 'vitest';
import {
  AdaptiveScheduleService,
} from '../../src/domain/time/adaptive-schedule.service.js';
import { DateTimeService } from '../../src/domain/time/datetime.service.js';

describe('AdaptiveScheduleService', () => {
  it('fetches publications and maps analytics into learned smart schedule slots', async () => {
    const mockPrisma = {
      socialAccount: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'acc-123',
          platform: 'X',
          workspaceId: 'ws-123',
          workspace: { timezone: 'Africa/Cairo' },
        }),
      },
      publication: {
        findMany: vi.fn().mockResolvedValue([
          {
            publishedAt: new Date('2026-09-08T06:00:00Z'), // Tuesday 09:00 Cairo
            analyticsSnapshots: [
              {
                metrics: [
                  { metricKey: 'likes', valueNumeric: 300 },
                  { metricKey: 'replies', valueNumeric: 50 },
                  { metricKey: 'reposts', valueNumeric: 40 },
                  { metricKey: 'impressions', valueNumeric: 2500 },
                ],
              },
            ],
          },
          {
            publishedAt: new Date('2026-09-08T06:05:00Z'),
            analyticsSnapshots: [
              {
                metrics: [
                  { metricKey: 'likes', valueNumeric: 200 },
                  { metricKey: 'replies', valueNumeric: 35 },
                  { metricKey: 'reposts', valueNumeric: 25 },
                  { metricKey: 'impressions', valueNumeric: 1800 },
                ],
              },
            ],
          },
        ]),
      },
    };

    const dateTime = new DateTimeService('Africa/Cairo', 'ar');
    const service = new AdaptiveScheduleService(mockPrisma as any, dateTime);

    const slots = await service.getLearnedSlotsForAccount({
      socialAccountId: 'acc-123',
      workspaceId: 'ws-123',
      startDate: new Date('2026-09-12T00:00:00Z'),
      daysAhead: 7,
      limit: 5,
    });

    expect(slots.length).toBeGreaterThan(0);
    expect(slots.length).toBeLessThanOrEqual(5);

    const topSlot = slots[0];
    expect(topSlot.score).toBeGreaterThanOrEqual(90);
    expect(topSlot.formattedArabic).toBeDefined();
    expect(topSlot.formattedEnglish).toBeDefined();
    expect(topSlot.source).toBeDefined();
  });

  it('throws error when social account is not found in workspace', async () => {
    const mockPrisma = {
      socialAccount: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };

    const service = new AdaptiveScheduleService(mockPrisma as any);
    await expect(
      service.getLearnedSlotsForAccount({
        socialAccountId: 'acc-not-exist',
        workspaceId: 'ws-123',
      })
    ).rejects.toThrow('Social account not found');
  });

  it('handles cold-start accounts with zero publications gracefully', async () => {
    const mockPrisma = {
      socialAccount: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'acc-cold',
          platform: 'LINKEDIN',
          workspaceId: 'ws-123',
          workspace: { timezone: 'Asia/Riyadh' },
        }),
      },
      publication: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };

    const service = new AdaptiveScheduleService(mockPrisma as any);
    const slots = await service.getLearnedSlotsForAccount({
      socialAccountId: 'acc-cold',
      workspaceId: 'ws-123',
      startDate: new Date('2026-09-12T00:00:00Z'),
      daysAhead: 7,
    });

    expect(slots.length).toBeGreaterThan(0);
    expect(slots.every((s) => s.source === 'BENCHMARK')).toBe(true);
  });
});
