import { type PrismaClient, prisma } from '../../index.js';
import {
  type DateTimeService,
  defaultDateTimeService,
  type HistoricalPostEngagement,
  type SmartScheduleSlot,
} from './datetime.service.js';

export interface GetAccountScheduleOptions {
  socialAccountId: string;
  workspaceId: string;
  daysAhead?: number | undefined;
  startDate?: Date | undefined;
  limit?: number | undefined;
  timezone?: string | undefined;
}

export class AdaptiveScheduleService {
  constructor(
    private readonly db: PrismaClient = prisma,
    private readonly dateTime: DateTimeService = defaultDateTimeService
  ) {}

  /**
   * Retrieves dynamically learned posting schedule slots for a specific connected social account.
   * Leverages historical publication timestamps and performance metrics from AnalyticsSnapshots.
   * Blends with global 2026 benchmark priors when history is limited (cold start).
   */
  public async getLearnedSlotsForAccount(
    options: GetAccountScheduleOptions
  ): Promise<SmartScheduleSlot[]> {
    const {
      socialAccountId,
      workspaceId,
      daysAhead = 7,
      startDate,
      limit = 10,
      timezone: requestedTimezone,
    } = options;

    const account = await this.db.socialAccount.findFirst({
      where: { id: socialAccountId, workspaceId },
      include: {
        workspace: {
          select: { timezone: true },
        },
      },
    });

    if (!account) {
      throw new Error(`Social account not found: ${socialAccountId}`);
    }

    const timezone = requestedTimezone || account.workspace.timezone || 'UTC';

    // Fetch published publications for this social account with latest analytics metrics
    const pastPublications = await this.db.publication.findMany({
      where: {
        socialAccountId,
        workspaceId,
        status: 'PUBLISHED',
        publishedAt: { not: null },
      },
      select: {
        publishedAt: true,
        analyticsSnapshots: {
          select: {
            metrics: {
              select: {
                metricKey: true,
                valueNumeric: true,
              },
            },
          },
          orderBy: { capturedAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { publishedAt: 'desc' },
      take: 100, // Look back up to 100 recent posts
    });

    const history: HistoricalPostEngagement[] = pastPublications.map((pub) => {
      const metrics = pub.analyticsSnapshots[0]?.metrics || [];
      const metricMap: Record<string, number> = {};
      for (const m of metrics) {
        if (m.valueNumeric !== null) {
          metricMap[m.metricKey.toLowerCase()] = Number(m.valueNumeric);
        }
      }

      return {
        publishedAt: pub.publishedAt ?? new Date(),
        impressions: metricMap.impressions ?? metricMap.impression_count ?? metricMap.views,
        likes: metricMap.likes ?? metricMap.like_count ?? metricMap.reactions,
        replies: metricMap.replies ?? metricMap.reply_count ?? metricMap.comments,
        reposts:
          metricMap.reposts ?? metricMap.repost_count ?? metricMap.retweets ?? metricMap.shares,
        shares: metricMap.shares,
        quotes: metricMap.quotes ?? metricMap.quote_count,
        bookmarks: metricMap.bookmarks ?? metricMap.bookmark_count ?? metricMap.saved,
        clicks: metricMap.clicks ?? metricMap.profile_clicks ?? metricMap.link_clicks,
        engagementRate: metricMap.engagement_rate,
      };
    });

    const platform =
      account.platform === 'X'
        ? 'X'
        : account.platform === 'LINKEDIN'
          ? 'LINKEDIN'
          : account.platform === 'INSTAGRAM'
            ? 'INSTAGRAM'
            : account.platform === 'THREADS'
              ? 'THREADS'
              : 'GENERAL';

    const slots = this.dateTime.getSmartScheduleSlots({
      timezone,
      startDate,
      daysAhead,
      platform,
      history,
    });

    return limit ? slots.slice(0, limit) : slots;
  }
}

export const adaptiveScheduleService = new AdaptiveScheduleService();
