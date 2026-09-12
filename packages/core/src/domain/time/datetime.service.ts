/**
 * packages/core/src/domain/time/datetime.service.ts
 * Enterprise Date & Time Engine for Scriora.
 *
 * Provides:
 * 1. Timezone-aware, bilingual (Arabic / English) human-readable formatting.
 * 2. Accurate conversion between local timezones (e.g. Africa/Cairo, Asia/Riyadh) and canonical UTC.
 * 3. Relative time calculation (e.g. 'منذ دقيقتين', 'بعد 3 ساعات').
 * 4. Smart Scheduling Engine: suggests golden posting slots based on Buffer 4.8M post research,
 *    extensible to account-specific case studies.
 */

export interface DateTimeFormatOptions {
  timezone?: string;
  locale?: 'ar' | 'en' | 'ar-EG' | 'ar-SA' | 'en-US';
  style?: 'full' | 'long' | 'medium' | 'short' | 'timeOnly' | 'dateOnly';
  useArabicNumerals?: boolean;
}

export interface SmartScheduleSlot {
  datetimeUtc: string;
  localTime: string;
  localDay: string;
  formattedArabic: string;
  formattedEnglish: string;
  score: number;
  recommendationReason: string;
}

export class DateTimeService {
  private readonly defaultTimezone: string;
  private readonly defaultLocale: 'ar' | 'en';

  constructor(defaultTimezone = 'Africa/Cairo', defaultLocale: 'ar' | 'en' = 'ar') {
    this.defaultTimezone = defaultTimezone;
    this.defaultLocale = defaultLocale;
  }

  /**
   * Formats a given date according to timezone, locale, and style.
   * By default, uses Latin digits ('ar-EG-u-nu-latn') for modern clean readable Arabic in tech UI,
   * with full option to use Eastern Arabic numerals ('useArabicNumerals: true').
   */
  public format(inputDate: Date | string | number, options?: DateTimeFormatOptions): string {
    const date = typeof inputDate === 'object' ? inputDate : new Date(inputDate);
    if (Number.isNaN(date.getTime())) {
      throw new Error('Invalid date provided to DateTimeService.format');
    }

    const timezone = options?.timezone || this.defaultTimezone;
    const localeInput = options?.locale || this.defaultLocale;
    const useEasternNumerals = options?.useArabicNumerals ?? false;

    let locale = 'en-US';
    if (localeInput.startsWith('ar')) {
      locale = useEasternNumerals ? 'ar-EG' : 'ar-EG-u-nu-latn';
    }

    const style = options?.style || 'long';

    let intlOptions: Intl.DateTimeFormatOptions;

    switch (style) {
      case 'full':
        intlOptions = {
          timeZone: timezone,
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          timeZoneName: 'short',
        };
        break;
      case 'long':
        intlOptions = {
          timeZone: timezone,
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        };
        break;
      case 'medium':
        intlOptions = {
          timeZone: timezone,
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        };
        break;
      case 'short':
        intlOptions = {
          timeZone: timezone,
          year: 'numeric',
          month: 'numeric',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        };
        break;
      case 'timeOnly':
        intlOptions = {
          timeZone: timezone,
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        };
        break;
      case 'dateOnly':
        intlOptions = {
          timeZone: timezone,
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        };
        break;
    }

    return new Intl.DateTimeFormat(locale, intlOptions).format(date);
  }

  /**
   * Formats relative time (e.g. 'منذ دقيقتين', 'بعد ساعتين').
   */
  public formatRelative(
    targetDate: Date | string | number,
    baseDate: Date = new Date(),
    localeInput: 'ar' | 'en' = this.defaultLocale
  ): string {
    const target = typeof targetDate === 'object' ? targetDate : new Date(targetDate);
    const diffMs = target.getTime() - baseDate.getTime();
    const diffSec = Math.round(diffMs / 1000);
    const diffMin = Math.round(diffSec / 60);
    const diffHours = Math.round(diffMin / 60);
    const diffDays = Math.round(diffHours / 24);

    const locale = localeInput.startsWith('ar') ? 'ar-EG' : 'en-US';
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

    if (Math.abs(diffSec) < 45) {
      return locale.startsWith('ar') ? 'الآن' : 'just now';
    }
    if (Math.abs(diffMin) < 60) {
      return rtf.format(diffMin, 'minute');
    }
    if (Math.abs(diffHours) < 24) {
      return rtf.format(diffHours, 'hour');
    }
    if (Math.abs(diffDays) < 30) {
      return rtf.format(diffDays, 'day');
    }

    return this.format(target, { locale: localeInput, style: 'medium' });
  }

  /**
   * Converts a date and time string in a specific timezone into canonical UTC Date.
   * Host-machine timezone agnostic.
   */
  public toUtc(localDateTimeStr: string, timezone = this.defaultTimezone): Date {
    const match = localDateTimeStr.match(
      /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?/
    );
    if (!match) {
      throw new Error(`Invalid date format: ${localDateTimeStr}`);
    }

    const [_, yearStr, monthStr, dayStr, hourStr, minStr, secStr] = match;
    const year = Number(yearStr);
    const month = Number(monthStr);
    const day = Number(dayStr);
    const hour = Number(hourStr);
    const minute = Number(minStr);
    const second = secStr ? Number(secStr) : 0;

    // 1. Treat local components as a baseline UTC millisecond representation
    const targetUtcMs = Date.UTC(year, month - 1, day, hour, minute, second);
    const probeDate = new Date(targetUtcMs);

    // 2. Format probeDate in target timezone to discover the exact offset at that date
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    const parts = formatter.formatToParts(probeDate);
    const map: Record<string, string> = {};
    for (const p of parts) map[p.type] = p.value;

    const tzHourRaw = Number(map.hour);
    const tzHour = tzHourRaw === 24 ? 0 : tzHourRaw;
    const tzDay = Number(map.day);
    const tzMonth = Number(map.month);
    const tzYear = Number(map.year);
    const tzMinute = Number(map.minute);
    const tzSecond = Number(map.second);

    const tzFormattedUtcMs = Date.UTC(tzYear, tzMonth - 1, tzDay, tzHour, tzMinute, tzSecond);
    const offsetMs = tzFormattedUtcMs - targetUtcMs;

    // The true UTC timestamp is targetUtcMs minus offset
    return new Date(targetUtcMs - offsetMs);
  }

  /**
   * Generates optimal smart schedule slots based on industry benchmark data (Buffer 8.7M post analysis for X, 4.8M for LinkedIn):
   * - X Peak window: Weekday mornings 9:00 AM – 11:00 AM (Tuesday 9am #1, Wednesday 10am #2, Wednesday 9am #3).
   * - LinkedIn Peak window: 3:00 PM – 8:00 PM on weekdays.
   * Extensible to individual account case-study models when account analytics history exists.
   */
  public getSmartScheduleSlots(options?: {
    timezone?: string;
    startDate?: Date;
    daysAhead?: number;
    platform?: 'LINKEDIN' | 'X' | 'GENERAL';
  }): SmartScheduleSlot[] {
    const timezone = options?.timezone || this.defaultTimezone;
    const start = options?.startDate || new Date();
    const daysAhead = Math.min(options?.daysAhead || 7, 14);
    const platform = options?.platform || 'GENERAL';

    const linkedInSlotTemplates = [
      {
        dayOfWeek: 3,
        hour: 16,
        minute: 0,
        score: 100,
        reason: 'الأربعاء 4 مساءً: أعلى وقت تفاعل تاريخي على لينكد إن عالمياً',
      },
      {
        dayOfWeek: 5,
        hour: 15,
        minute: 0,
        score: 96,
        reason: 'الجمعة 3 مساءً: ذروة إنهاء أسبوع العمل والاستعداد للتواصل',
      },
      {
        dayOfWeek: 5,
        hour: 16,
        minute: 0,
        score: 94,
        reason: 'الجمعة 4 مساءً: معدل قراءة مرتفع للمقالات والكاروسيل',
      },
      {
        dayOfWeek: 4,
        hour: 17,
        minute: 0,
        score: 92,
        reason: 'الخميس 5 مساءً: نافذة تفاعل مسائية قوية للمدراء وصناع القرار',
      },
      {
        dayOfWeek: 3,
        hour: 15,
        minute: 0,
        score: 90,
        reason: 'الأربعاء 3 مساءً: بداية صعود التفاعل الأسبوعي',
      },
      {
        dayOfWeek: 4,
        hour: 19,
        minute: 0,
        score: 85,
        reason: 'الخميس 7 مساءً: تصفح هادئ بعد ساعات العمل',
      },
      {
        dayOfWeek: 2,
        hour: 16,
        minute: 0,
        score: 83,
        reason: 'الثلاثاء 4 مساءً: انتهاء ضغط بداية الأسبوع',
      },
      {
        dayOfWeek: 1,
        hour: 17,
        minute: 0,
        score: 75,
        reason: 'الاثنين 5 مساءً: أفضل فترات الاثنين بعد انقضاء اجتماعات الصباح',
      },
    ];

    const xSlotTemplates = [
      {
        dayOfWeek: 2, // Tuesday
        hour: 9,
        minute: 0,
        score: 100,
        reason:
          'الثلاثاء 9:00 ص: أعلى أوقات التفاعل عالمياً على منصة X (دراسة Buffer لـ 8.7M منشور)',
      },
      {
        dayOfWeek: 3, // Wednesday
        hour: 10,
        minute: 0,
        score: 98,
        reason: 'الأربعاء 10:00 ص: ثاني أعلى توقيت للتفاعل ومعدل الانتشار الأسبوعي على X',
      },
      {
        dayOfWeek: 3, // Wednesday
        hour: 9,
        minute: 0,
        score: 95,
        reason: 'الأربعاء 9:00 ص: ذروة التفاعل الصباحي لمنتصف الأسبوع',
      },
      {
        dayOfWeek: 4, // Thursday
        hour: 9,
        minute: 0,
        score: 92,
        reason: 'الخميس 9:00 ص: تفاعل ومشاركات قوية قبل عطلة نهاية الأسبوع',
      },
      {
        dayOfWeek: 4, // Thursday
        hour: 10,
        minute: 0,
        score: 90,
        reason: 'الخميس 10:00 ص: استمرار زخم النقاشات الصباحية على X',
      },
      {
        dayOfWeek: 1, // Monday
        hour: 9,
        minute: 0,
        score: 85,
        reason: 'الاثنين 9:00 ص: عودة المتابعين للتصفح مع بداية الأسبوع',
      },
      {
        dayOfWeek: 5, // Friday
        hour: 9,
        minute: 0,
        score: 80,
        reason: 'الجمعة 9:00 ص: آخر نافذة تفاعل نشطة قبل هبوط عطلة نهاية الأسبوع',
      },
    ];

    const goldenSlotTemplates = platform === 'X' ? xSlotTemplates : linkedInSlotTemplates;

    const results: SmartScheduleSlot[] = [];

    for (let dayOffset = 0; dayOffset < daysAhead; dayOffset++) {
      const candidateDay = new Date(start.getTime() + dayOffset * 86400000);
      const dayOfWeek = candidateDay.getUTCDay();

      for (const tpl of goldenSlotTemplates) {
        if (tpl.dayOfWeek === dayOfWeek) {
          const year = candidateDay.getUTCFullYear();
          const month = String(candidateDay.getUTCMonth() + 1).padStart(2, '0');
          const day = String(candidateDay.getUTCDate()).padStart(2, '0');
          const hour = String(tpl.hour).padStart(2, '0');
          const min = String(tpl.minute).padStart(2, '0');

          const localString = `${year}-${month}-${day}T${hour}:${min}:00`;
          try {
            const utcDate = this.toUtc(localString, timezone);
            if (utcDate.getTime() > start.getTime()) {
              results.push({
                datetimeUtc: utcDate.toISOString(),
                localTime: `${hour}:${min}`,
                localDay: this.format(utcDate, { timezone, locale: 'ar', style: 'dateOnly' }),
                formattedArabic: this.format(utcDate, { timezone, locale: 'ar', style: 'long' }),
                formattedEnglish: this.format(utcDate, { timezone, locale: 'en', style: 'long' }),
                score: tpl.score,
                recommendationReason: tpl.reason,
              });
            }
          } catch {
            // Ignore format errors
          }
        }
      }
    }

    return results.sort(
      (a, b) =>
        b.score - a.score || new Date(a.datetimeUtc).getTime() - new Date(b.datetimeUtc).getTime()
    );
  }
}

export const defaultDateTimeService = new DateTimeService();
