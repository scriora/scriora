import { describe, expect, it } from 'vitest';
import { DateTimeService, defaultDateTimeService } from '../../src/domain/time/datetime.service.js';

describe('DateTimeService', () => {
  const service = new DateTimeService('Africa/Cairo', 'ar');
  const fixedDate = new Date('2026-09-12T04:42:35.940Z'); // 07:42:35 in Cairo (UTC+3)

  describe('format()', () => {
    it('formats date in Arabic with Africa/Cairo timezone', () => {
      const formatted = service.format(fixedDate, {
        timezone: 'Africa/Cairo',
        locale: 'ar',
        style: 'long',
      });
      expect(formatted).toBeDefined();
      expect(typeof formatted).toBe('string');
      // Should contain Arabic day or month
      expect(formatted).toContain('سبتمبر');
      expect(formatted).toContain('2026');
      // Cairo is UTC+3, so 04:42 UTC becomes 7:42 AM
      expect(formatted).toMatch(/7:42|٠٧:٤٢|07:42/);
    });

    it('formats date in English with America/New_York timezone', () => {
      const formatted = service.format(fixedDate, {
        timezone: 'America/New_York',
        locale: 'en',
        style: 'medium',
      });
      expect(formatted).toBeDefined();
      expect(formatted).toContain('Sep');
      expect(formatted).toContain('2026');
      // New York is EDT (UTC-4), so 04:42 UTC becomes 12:42 AM
      expect(formatted).toMatch(/12:42/);
      expect(formatted).toContain('AM');
    });

    it('formats dateOnly and timeOnly styles correctly', () => {
      const dateOnly = service.format(fixedDate, {
        timezone: 'Asia/Riyadh',
        locale: 'ar',
        style: 'dateOnly',
      });
      expect(dateOnly).toContain('سبتمبر');
      expect(dateOnly).toContain('2026');

      const timeOnly = service.format(fixedDate, {
        timezone: 'Asia/Riyadh',
        locale: 'en',
        style: 'timeOnly',
      });
      expect(timeOnly).toMatch(/7:42/);
      expect(timeOnly).toContain('AM');
    });

    it('throws error for invalid date', () => {
      expect(() => service.format('not-a-valid-date')).toThrow('Invalid date provided');
    });
  });

  describe('formatRelative()', () => {
    it('returns "الآن" for timestamps within seconds', () => {
      const now = new Date();
      const relativeAr = service.formatRelative(now, now, 'ar');
      expect(relativeAr).toBe('الآن');

      const relativeEn = service.formatRelative(now, now, 'en');
      expect(relativeEn).toBe('just now');
    });

    it('formats minutes and hours in Arabic', () => {
      const base = new Date('2026-09-12T12:00:00Z');
      const fiveMinAgo = new Date('2026-09-12T11:55:00Z');
      const twoHoursAgo = new Date('2026-09-12T10:00:00Z');
      const threeHoursLater = new Date('2026-09-12T15:00:00Z');

      const minResult = service.formatRelative(fiveMinAgo, base, 'ar');
      expect(minResult).toMatch(/دقائق|دقيقة/);

      const hourResult = service.formatRelative(twoHoursAgo, base, 'ar');
      expect(hourResult).toMatch(/ساعة|ساعتين/);

      const futureResult = service.formatRelative(threeHoursLater, base, 'ar');
      expect(futureResult).toMatch(/بعد|خلال/);
    });
  });

  describe('toUtc()', () => {
    it('converts local Cairo string to correct UTC date', () => {
      // Cairo is UTC+3 in September (EEST)
      const localStr = '2026-09-12T16:00:00';
      const utc = service.toUtc(localStr, 'Africa/Cairo');

      expect(utc).toBeInstanceOf(Date);
      expect(utc.getUTCFullYear()).toBe(2026);
      expect(utc.getUTCMonth()).toBe(8); // September (0-indexed)
      expect(utc.getUTCDate()).toBe(12);
      expect(utc.getUTCHours()).toBe(13); // 16:00 - 3 = 13:00 UTC
    });
  });

  describe('getSmartScheduleSlots()', () => {
    it('generates prioritized posting slots based on Buffer research', () => {
      const baseDate = new Date('2026-09-12T00:00:00Z');
      const slots = service.getSmartScheduleSlots({
        timezone: 'Africa/Cairo',
        startDate: baseDate,
        daysAhead: 7,
      });

      expect(slots.length).toBeGreaterThan(0);
      // First slot should be highest score (Wednesday peak 100)
      const topSlot = slots[0];
      expect(topSlot.score).toBeGreaterThanOrEqual(90);
      expect(topSlot.formattedArabic).toBeDefined();
      expect(topSlot.formattedEnglish).toBeDefined();
      expect(topSlot.recommendationReason).toBeDefined();
      expect(topSlot.datetimeUtc).toMatch(/T.*Z/);
    });

    it('generates X-specific golden slots based on 2026 8.7M post analysis (Tuesday 9am #1, Wednesday 10am #2)', () => {
      const baseDate = new Date('2026-09-12T00:00:00Z');
      const xSlots = service.getSmartScheduleSlots({
        timezone: 'Africa/Cairo',
        startDate: baseDate,
        daysAhead: 7,
        platform: 'X',
      });

      expect(xSlots.length).toBeGreaterThan(0);
      const topSlot = xSlots[0];
      expect(topSlot.score).toBe(100);
      expect(topSlot.localTime).toBe('09:00');
      expect(topSlot.recommendationReason).toContain('الثلاثاء 9:00 ص');
      expect(topSlot.recommendationReason).toContain('8.7M');
      expect(topSlot.source).toBe('BENCHMARK');
    });

    it('generates Instagram-specific golden slots based on 2026 9.6M post analysis (Wednesday 12pm #1)', () => {
      const igSlots = service.getSmartScheduleSlots({
        timezone: 'Africa/Cairo',
        startDate: new Date('2026-09-12T00:00:00Z'),
        daysAhead: 7,
        platform: 'INSTAGRAM',
      });

      expect(igSlots.length).toBeGreaterThan(0);
      const topSlot = igSlots[0];
      expect(topSlot.score).toBe(100);
      expect(topSlot.localTime).toBe('12:00');
      expect(topSlot.recommendationReason).toContain('الأربعاء 12:00 م');
      expect(topSlot.recommendationReason).toContain('9.6M');
      expect(topSlot.source).toBe('BENCHMARK');
    });

    it('adapts and learns when user post analytics confirm or boost benchmark windows (HYBRID_LEARNED)', () => {
      const baseDate = new Date('2026-09-12T00:00:00Z');
      // Historical post on Tuesday 9:00 AM Cairo time (2026-09-08 06:00 UTC) with massive engagement
      const history = [
        {
          publishedAt: new Date('2026-09-08T06:00:00Z'), // Tuesday 09:00 Cairo
          likes: 250,
          replies: 45,
          reposts: 35,
          impressions: 2000,
        },
        {
          publishedAt: new Date('2026-09-08T06:05:00Z'), // Tuesday 09:05 Cairo
          likes: 180,
          replies: 30,
          reposts: 20,
          impressions: 1500,
        },
        {
          publishedAt: new Date('2026-09-01T06:00:00Z'), // Previous Tuesday 09:00 Cairo
          likes: 300,
          replies: 50,
          reposts: 40,
          impressions: 2500,
        },
      ];

      const slots = service.getSmartScheduleSlots({
        timezone: 'Africa/Cairo',
        startDate: baseDate,
        daysAhead: 7,
        platform: 'X',
        history,
      });

      const tuesdaySlot = slots.find(
        (s) => s.localTime === '09:00' && s.source === 'HYBRID_LEARNED'
      );
      expect(tuesdaySlot).toBeDefined();
      expect(tuesdaySlot?.source).toBe('HYBRID_LEARNED');
      expect(tuesdaySlot?.confidence).toBeGreaterThan(0.2);
      expect(tuesdaySlot?.recommendationReason).toContain('أكدته تحليلات حسابك');
    });

    it('discovers custom user golden windows outside standard benchmark (USER_ANALYTICS)', () => {
      const baseDate = new Date('2026-09-12T00:00:00Z');
      // Historical posts on Friday 8:00 PM Cairo (17:00 UTC) with huge engagement vs low elsewhere
      const history = [
        {
          publishedAt: new Date('2026-09-04T17:00:00Z'), // Friday 20:00 Cairo
          likes: 500,
          replies: 90,
          reposts: 60,
          impressions: 3000,
        },
        {
          publishedAt: new Date('2026-08-28T17:00:00Z'), // Previous Friday 20:00 Cairo
          likes: 450,
          replies: 80,
          reposts: 55,
          impressions: 2800,
        },
        {
          publishedAt: new Date('2026-09-07T08:00:00Z'), // Monday morning (low engagement)
          likes: 5,
          replies: 0,
          reposts: 0,
          impressions: 500,
        },
      ];

      const slots = service.getSmartScheduleSlots({
        timezone: 'Africa/Cairo',
        startDate: baseDate,
        daysAhead: 7,
        platform: 'X',
        history,
      });

      const discoveredSlot = slots.find((s) => s.source === 'USER_ANALYTICS');
      expect(discoveredSlot).toBeDefined();
      expect(discoveredSlot?.localTime).toBe('20:00');
      expect(discoveredSlot?.recommendationReason).toContain('نافذة ذهبية مخصصة');
      expect(discoveredSlot?.performanceMultiplier).toBeGreaterThan(1.0);
    });
  });
});
