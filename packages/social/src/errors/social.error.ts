export type SocialErrorCategory =
  | 'VALIDATION'
  | 'AUTHENTICATION'
  | 'AUTHORIZATION'
  | 'RATE_LIMITED'
  | 'EXTERNAL'
  | 'TIMEOUT'
  | 'UNAVAILABLE'
  | 'UNKNOWN_EXTERNAL_STATE';

export interface NormalizedSocialErrorOptions {
  message: string;
  category: SocialErrorCategory;
  code?: string | undefined;
  retryable?: boolean | undefined;
  retryAfter?: Date | null | undefined;
  platformCode?: string | undefined;
}

export class NormalizedSocialError extends Error {
  public readonly category: SocialErrorCategory;
  public readonly code?: string | undefined;
  public readonly retryable: boolean;
  public readonly retryAfter: Date | null;
  public readonly platformCode?: string | undefined;

  constructor(options: NormalizedSocialErrorOptions) {
    super(options.message);
    this.name = 'NormalizedSocialError';
    this.category = options.category;
    this.code = options.code;
    this.retryable =
      options.retryable ?? (options.category === 'RATE_LIMITED' || options.category === 'TIMEOUT');
    this.retryAfter = options.retryAfter ?? null;
    if (options.platformCode !== undefined) {
      this.platformCode = options.platformCode;
    }
  }
}

export interface PlatformErrorOptions {
  message: string;
  code: string;
  category?: SocialErrorCategory | undefined;
  retryable?: boolean | undefined;
  platformCode?: string | undefined;
  retryAfterMs?: number | undefined;
  retryAfter?: Date | null | undefined;
}

export class PlatformError extends NormalizedSocialError {
  public override readonly code: string;
  public readonly retryAfterMs?: number | undefined;

  constructor(options: PlatformErrorOptions) {
    const category = options.category ?? 'EXTERNAL';
    const retryAfter =
      options.retryAfter ??
      (options.retryAfterMs !== undefined ? new Date(Date.now() + options.retryAfterMs) : null);

    super({
      message: options.message,
      category,
      code: options.code,
      retryable: options.retryable,
      retryAfter,
      platformCode: options.platformCode,
    });

    this.name = 'PlatformError';
    this.code = options.code;
    this.retryAfterMs = options.retryAfterMs;
  }
}
