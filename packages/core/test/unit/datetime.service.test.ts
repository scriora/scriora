import { describe, it, expect } from 'vitest';
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
  });
});
