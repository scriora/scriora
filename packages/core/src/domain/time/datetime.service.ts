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

export interface HistoricalPostEngagement {
  publishedAt: Date | string;
  impressions?: number | undefined;
  likes?: number | undefined;
  replies?: number | undefined;
  reposts?: number | undefined;
  quotes?: number | undefined;
  bookmarks?: number | undefined;
  shares?: number | undefined;
  clicks?: number | undefined;
  engagementRate?: number | undefined;
  compositeScore?: number | undefined;
}

export type SlotSource = 'BENCHMARK' | 'USER_ANALYTICS' | 'HYBRID_LEARNED';

export interface SmartScheduleSlot {
  datetimeUtc: string;
  localTime: string;
  localDay: string;
  formattedArabic: string;
  formattedEnglish: string;
  score: number;
  recommendationReason: string;
  source: SlotSource;
  sampleCount?: number | undefined;
  confidence?: number | undefined;
  performanceMultiplier?: number | undefined;
}

export interface SmartScheduleOptions {
  timezone?: string | undefined;
  startDate?: Date | undefined;
  daysAhead?: number | undefined;
  platform?:
    | (
        | 'LINKEDIN'
        | 'X'
        | 'INSTAGRAM'
        | 'THREADS'
        | 'TIKTOK'
        | 'YOUTUBE'
        | 'FACEBOOK'
        | 'PINTEREST'
        | 'BLUESKY'
        | 'TELEGRAM'
        | 'GENERAL'
      )
    | undefined;
  history?: HistoricalPostEngagement[] | undefined;
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
   * Extracts local time parts (weekday, hour, minute) in the specified timezone.
   */
  private getLocalTimeParts(
    date: Date,
    timezone: string
  ): { dayOfWeek: number; hour: number; minute: number } {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short',
      hour: 'numeric',
      minute: 'numeric',
      hourCycle: 'h23',
    });
    const parts = formatter.formatToParts(date);
    let weekdayStr = '';
    let hour = 0;
    let minute = 0;
    for (const p of parts) {
      if (p.type === 'weekday') weekdayStr = p.value;
      if (p.type === 'hour') hour = Number(p.value);
      if (p.type === 'minute') minute = Number(p.value);
    }
    const dayMap: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };
    return {
      dayOfWeek: dayMap[weekdayStr] ?? date.getUTCDay(),
      hour: hour === 24 ? 0 : hour,
      minute,
    };
  }

  /**
   * Evaluates historical post performance using 2026 platform algorithmic scoring.
   */
  private computePostScore(post: HistoricalPostEngagement, platform: string): number {
    if (post.compositeScore !== undefined && post.compositeScore > 0) {
      return post.compositeScore;
    }
    if (post.engagementRate !== undefined && post.engagementRate > 0) {
      return post.engagementRate * 100;
    }

    const replies = post.replies ?? 0;
    const reposts = post.reposts ?? 0;
    const quotes = post.quotes ?? 0;
    const bookmarks = post.bookmarks ?? 0;
    const clicks = post.clicks ?? 0;
    const likes = post.likes ?? 0;
    const impressions = post.impressions ?? 0;

    let raw = 0;
    if (platform === 'X') {
      raw = replies * 27 + quotes * 20 + reposts * 20 + clicks * 12 + bookmarks * 8 + likes * 1;
    } else if (platform === 'LINKEDIN') {
      raw = replies * 30 + reposts * 25 + clicks * 15 + likes * 5;
    } else if (platform === 'INSTAGRAM') {
      // 2026 Instagram Algorithm: Sends/Shares (#1 ranking signal) + Saves/Bookmarks + Comments + Likes
      const shares = post.shares ?? post.reposts ?? 0;
      raw = shares * 35 + bookmarks * 25 + replies * 20 + likes * 2;
    } else if (platform === 'THREADS') {
      raw = replies * 35 + reposts * 25 + quotes * 20 + likes * 3;
    } else {
      raw = replies * 25 + reposts * 20 + clicks * 10 + likes * 5;
    }

    if (raw === 0 && likes === 0 && impressions === 0) {
      return 1.0;
    }

    return impressions > 0 ? (raw / impressions) * 100 : raw;
  }

  /**
   * Blends global benchmark templates with empirical user engagement history.
   */
  private learnScheduleTemplates(
    history: HistoricalPostEngagement[] | undefined,
    timezone: string,
    platform: string,
    baseTemplates: Array<{
      dayOfWeek: number;
      hour: number;
      minute: number;
      score: number;
      reason: string;
    }>
  ): Array<{
    dayOfWeek: number;
    hour: number;
    minute: number;
    score: number;
    reason: string;
    source: SlotSource;
    sampleCount: number;
    confidence: number;
    performanceMultiplier: number;
  }> {
    if (!history || history.length === 0) {
      return baseTemplates.map((tpl) => ({
        ...tpl,
        source: 'BENCHMARK' as SlotSource,
        sampleCount: 0,
        confidence: 0,
        performanceMultiplier: 1.0,
      }));
    }

    interface Bucket {
      dayOfWeek: number;
      hour: number;
      scores: number[];
    }

    const buckets = new Map<string, Bucket>();
    let totalScoreSum = 0;
    let validCount = 0;

    for (const post of history) {
      const pubDate =
        typeof post.publishedAt === 'object' ? post.publishedAt : new Date(post.publishedAt);
      if (Number.isNaN(pubDate.getTime())) continue;

      const { dayOfWeek, hour } = this.getLocalTimeParts(pubDate, timezone);
      const key = `${dayOfWeek}:${hour}`;

      const score = this.computePostScore(post, platform);
      totalScoreSum += score;
      validCount++;

      let b = buckets.get(key);
      if (!b) {
        b = { dayOfWeek, hour, scores: [] };
        buckets.set(key, b);
      }
      b.scores.push(score);
    }

    const overallAverage = validCount > 0 ? totalScoreSum / validCount : 1.0;

    const learnedSlots: Array<{
      dayOfWeek: number;
      hour: number;
      minute: number;
      score: number;
      reason: string;
      source: SlotSource;
      sampleCount: number;
      confidence: number;
      performanceMultiplier: number;
    }> = [];

    const matchedKeys = new Set<string>();

    for (const tpl of baseTemplates) {
      const key = `${tpl.dayOfWeek}:${tpl.hour}`;
      const bucket = buckets.get(key);

      if (bucket && bucket.scores.length > 0) {
        matchedKeys.add(key);
        const bucketAvg = bucket.scores.reduce((a, b) => a + b, 0) / bucket.scores.length;
        const multiplier = overallAverage > 0 ? bucketAvg / overallAverage : 1.0;
        const sampleCount = bucket.scores.length;
        const confidence = Math.min(1.0, (sampleCount / 3) * Math.min(1.0, validCount / 5));

        const userScore = Math.max(20, Math.min(100, Math.round(multiplier * 60)));
        const blendedScore = Math.max(
          10,
          Math.min(100, Math.round((1 - confidence) * tpl.score + confidence * userScore))
        );

        const pctDiff = Math.round((multiplier - 1) * 100);
        const pctSign = pctDiff >= 0 ? `+${pctDiff}%` : `${pctDiff}%`;
        const reason = `${tpl.reason} • أكدته تحليلات حسابك (${pctSign} تفاعل مقارنة بمتوسطك)`;

        learnedSlots.push({
          dayOfWeek: tpl.dayOfWeek,
          hour: tpl.hour,
          minute: tpl.minute,
          score: blendedScore,
          reason,
          source: confidence >= 0.2 ? 'HYBRID_LEARNED' : 'BENCHMARK',
          sampleCount,
          confidence: Number(confidence.toFixed(2)),
          performanceMultiplier: Number(multiplier.toFixed(2)),
        });
      } else {
        learnedSlots.push({
          ...tpl,
          source: 'BENCHMARK',
          sampleCount: 0,
          confidence: 0,
          performanceMultiplier: 1.0,
        });
      }
    }

    // Discover non-benchmark user golden windows
    const DAY_NAMES_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    for (const [key, bucket] of buckets.entries()) {
      if (matchedKeys.has(key)) continue;

      const sampleCount = bucket.scores.length;
      if (sampleCount < 2) continue; // Require at least 2 observations to avoid noise

      const bucketAvg = bucket.scores.reduce((a, b) => a + b, 0) / sampleCount;
      const multiplier = overallAverage > 0 ? bucketAvg / overallAverage : 1.0;

      if (multiplier >= 1.1) {
        const confidence = Math.min(1.0, (sampleCount / 3) * Math.min(1.0, validCount / 5));
        const userScore = Math.max(75, Math.min(100, Math.round(70 + (multiplier - 1) * 30)));
        const dayName = DAY_NAMES_AR[bucket.dayOfWeek] ?? '';
        const hourStr = `${bucket.hour % 12 || 12}:00 ${bucket.hour >= 12 ? 'مساءً' : 'صباحاً'}`;
        const pctSign = `+${Math.round((multiplier - 1) * 100)}%`;

        learnedSlots.push({
          dayOfWeek: bucket.dayOfWeek,
          hour: bucket.hour,
          minute: 0,
          score: userScore,
          reason: `${dayName} ${hourStr}: نافذة ذهبية مخصصة — رصدنا تفاعل استثنائي لحسابك (${pctSign} أعلى من متوسطك)`,
          source: 'USER_ANALYTICS',
          sampleCount,
          confidence: Number(confidence.toFixed(2)),
          performanceMultiplier: Number(multiplier.toFixed(2)),
        });
      }
    }

    return learnedSlots;
  }

  /**
   * Generates optimal smart schedule slots based on industry benchmark data (Buffer 8.7M post analysis for X, 4.8M for LinkedIn)
   * and dynamically learns from user post analytics history.
   * - X Peak window: Weekday mornings 9:00 AM – 11:00 AM (Tuesday 9am #1, Wednesday 10am #2, Wednesday 9am #3).
   * - LinkedIn Peak window: 3:00 PM – 8:00 PM on weekdays.
   * - Dynamically incorporates user engagement telemetry and discovers personalized golden windows.
   */
  public getSmartScheduleSlots(options?: SmartScheduleOptions): SmartScheduleSlot[] {
    const timezone = options?.timezone || this.defaultTimezone;
    const start = options?.startDate || new Date();
    const daysAhead = Math.min(options?.daysAhead || 7, 14);
    const platform = options?.platform || 'GENERAL';
    const history = options?.history;

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

    const instagramSlotTemplates = [
      {
        dayOfWeek: 3, // Wednesday
        hour: 12,
        minute: 0,
        score: 100,
        reason:
          'الأربعاء 12:00 م: ذروة التصفح واستراحة الغداء على إنستغرام (دراسة Buffer لـ 9.6M منشور)',
      },
      {
        dayOfWeek: 3, // Wednesday
        hour: 18,
        minute: 0,
        score: 98,
        reason: 'الأربعاء 6:00 م: ذروة التفاعل المسائي والمشاركات عبر الرسائل الخاصة (DMs)',
      },
      {
        dayOfWeek: 2, // Tuesday
        hour: 19,
        minute: 0,
        score: 95,
        reason: 'الثلاثاء 7:00 م: وقت استرخاء ومشاهدة الريلز بعد ساعات العمل',
      },
      {
        dayOfWeek: 4, // Thursday
        hour: 9,
        minute: 0,
        score: 92,
        reason: 'الخميس 9:00 ص: تفاعل صباحي قوي للمحتوى المرئي والستوري',
      },
      {
        dayOfWeek: 4, // Thursday
        hour: 12,
        minute: 0,
        score: 90,
        reason: 'الخميس 12:00 م: زخم تصفح منتصف النهار قبل عطلة نهاية الأسبوع',
      },
      {
        dayOfWeek: 1, // Monday
        hour: 12,
        minute: 0,
        score: 85,
        reason: 'الاثنين 12:00 م: عودة النشاط وتصفح الكاروسيل في بداية الأسبوع',
      },
    ];

    const threadsSlotTemplates = [
      {
        dayOfWeek: 3, // Wednesday
        hour: 7,
        minute: 0,
        score: 100,
        reason:
          'الأربعاء 7:00 ص: أعلى أوقات التفاعل عالمياً على ثريدز قبل بدء الدوام (دراسة Buffer لـ 2.5M منشور)',
      },
      {
        dayOfWeek: 4, // Thursday
        hour: 9,
        minute: 0,
        score: 98,
        reason:
          'الخميس 9:00 ص: أفضل نافذة تفاعل أسبوعية على ثريدز لمشاركة الآراء وطرح الأسئلة المفتوحة',
      },
      {
        dayOfWeek: 2, // Tuesday
        hour: 10,
        minute: 0,
        score: 95,
        reason: 'الثلاثاء 10:00 ص: ذروة التصفح التفاعلي وتبادل الردود ومناقشة الموضوعات الرائجة',
      },
      {
        dayOfWeek: 3, // Wednesday
        hour: 12,
        minute: 0,
        score: 93,
        reason: 'الأربعاء 12:00 م: استراحة الظهيرة وزيادة تصفح الصور والأفكار في منتصف الأسبوع',
      },
      {
        dayOfWeek: 5, // Friday
        hour: 10,
        minute: 0,
        score: 90,
        reason: 'الجمعة 10:00 ص: تفاعل قوي على منشورات المجتمع والقصص الواقعية قبل العطلة',
      },
      {
        dayOfWeek: 1, // Monday
        hour: 12,
        minute: 0,
        score: 87,
        reason: 'الاثنين 12:00 م: عودة النشاط ومطالعة الموضوعات الجديدة مع بداية أسبوع العمل',
      },
      {
        dayOfWeek: 6, // Saturday
        hour: 10,
        minute: 0,
        score: 80,
        reason: 'السبت 10:00 ص: أفضل أوقات عطلة نهاية الأسبوع للتصفح الهادئ والمحتوى الشخصي',
      },
    ];

    const facebookSlotTemplates = [
      {
        dayOfWeek: 4, // Thursday
        hour: 9,
        minute: 0,
        score: 100,
        reason:
          'الخميس 9:00 ص: أعلى أوقات التفاعل عالمياً على فيسبوك عبر دراسة Buffer لـ 14M منشور (الذروة الذهبية)',
      },
      {
        dayOfWeek: 3, // Wednesday
        hour: 8,
        minute: 0,
        score: 98,
        reason:
          'الأربعاء 8:00 ص: أفضل يوم تفاعل أسبوعي إجمالي على صفحات فيسبوك والبدء المبكر للمتابعين',
      },
      {
        dayOfWeek: 2, // Tuesday
        hour: 8,
        minute: 0,
        score: 95,
        reason: 'الثلاثاء 8:00 ص: تصفح صباحي قوي وتفاعل مرتفع مع منشورات الصور والألبومات',
      },
      {
        dayOfWeek: 3, // Wednesday
        hour: 12,
        minute: 0,
        score: 93,
        reason: 'الأربعاء 12:00 م: استراحة الغداء وزيادة المشاركات والتعليقات على صفحات الأعمال',
      },
      {
        dayOfWeek: 0, // Sunday
        hour: 10,
        minute: 0,
        score: 90,
        reason: 'الأحد 10:00 ص: تفاعل عائلي واجتماعي هادئ وارتفاع نسبة قراءة المنشورات الطويلة',
      },
      {
        dayOfWeek: 5, // Friday
        hour: 9,
        minute: 0,
        score: 88,
        reason: 'الجمعة 9:00 ص: تفاعل صباحي ملحوظ قبل تراجع النشاط المعتاد في عطلة نهاية الأسبوع',
      },
      {
        dayOfWeek: 1, // Monday
        hour: 10,
        minute: 0,
        score: 85,
        reason: 'الاثنين 10:00 ص: عودة النشاط ومطالعة تحديثات الشركات والصفحات المهنية',
      },
    ];

    const youtubeSlotTemplates = [
      {
        dayOfWeek: 0, // Sunday
        hour: 10,
        minute: 0,
        score: 100,
        reason:
          'الأحد 10:00 ص: أعلى أوقات التفاعل عالمياً لفيديوهات يوتيوب الطويلة عبر دراسة Buffer لـ 1.8M فيديو (معامل تفاعل 0.95)',
      },
      {
        dayOfWeek: 0, // Sunday
        hour: 9,
        minute: 0,
        score: 95,
        reason: 'الأحد 9:00 ص: ذروة التصفح والمشاهدة الصباحية في عطلة نهاية الأسبوع (معامل تفاعل 0.80)',
      },
      {
        dayOfWeek: 5, // Friday
        hour: 16,
        minute: 0,
        score: 95,
        reason:
          'الجمعة 4:00 م: التوقيت الذهبي الأول لـ YouTube Shorts (الأعلى تفاعلاً للأسبوع بأكمله في دراسة Buffer)',
      },
      {
        dayOfWeek: 5, // Friday
        hour: 12,
        minute: 0,
        score: 92,
        reason: 'الجمعة 12:00 م: ذروة استراحة الغداء وتفاعل قوي لفيديوهات يوتيوب (معامل تفاعل 0.70)',
      },
      {
        dayOfWeek: 5, // Friday
        hour: 18,
        minute: 0,
        score: 91,
        reason: 'الجمعة 6:00 م: توقيت مسائي قوي لـ YouTube Shorts ومشاهدات الاسترخاء بعد أسبوع العمل',
      },
      {
        dayOfWeek: 2, // Tuesday
        hour: 9,
        minute: 0,
        score: 88,
        reason: 'الثلاثاء 9:00 ص: أفضل أوقات أيام العمل الصباحية للفيديوهات التعليمية والتقنية على يوتيوب',
      },
      {
        dayOfWeek: 1, // Monday
        hour: 9,
        minute: 0,
        score: 85,
        reason: 'الاثنين 9:00 ص: انطلاقة قوية للأسبوع وإقبال على الفيديوهات التحفيزية والإخبارية',
      },
      {
        dayOfWeek: 6, // Saturday
        hour: 12,
        minute: 0,
        score: 83,
        reason: 'السبت 12:00 م: مشاهدات مستقرة وممتدة في عطلة نهاية الأسبوع',
      },
    ];

    const baseTemplates =
      platform === 'X'
        ? xSlotTemplates
        : platform === 'INSTAGRAM'
          ? instagramSlotTemplates
          : platform === 'THREADS'
            ? threadsSlotTemplates
            : platform === 'FACEBOOK'
              ? facebookSlotTemplates
              : platform === 'YOUTUBE'
                ? youtubeSlotTemplates
                : linkedInSlotTemplates;
    const learnedTemplates = this.learnScheduleTemplates(
      history,
      timezone,
      platform,
      baseTemplates
    );

    const results: SmartScheduleSlot[] = [];

    for (let dayOffset = 0; dayOffset < daysAhead; dayOffset++) {
      const candidateDay = new Date(start.getTime() + dayOffset * 86400000);
      const { dayOfWeek } = this.getLocalTimeParts(candidateDay, timezone);

      for (const tpl of learnedTemplates) {
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
                localDay: this.format(utcDate, {
                  timezone,
                  locale: 'ar',
                  style: 'dateOnly',
                }),
                formattedArabic: this.format(utcDate, {
                  timezone,
                  locale: 'ar',
                  style: 'long',
                }),
                formattedEnglish: this.format(utcDate, {
                  timezone,
                  locale: 'en',
                  style: 'long',
                }),
                score: tpl.score,
                recommendationReason: tpl.reason,
                source: tpl.source,
                sampleCount: tpl.sampleCount,
                confidence: tpl.confidence,
                performanceMultiplier: tpl.performanceMultiplier,
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
