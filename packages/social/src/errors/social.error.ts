export type SocialErrorCategory =
  | 'VALIDATION'
  | 'AUTHENTICATION'
  | 'AUTHORIZATION'
  | 'RATE_LIMITED'
  | 'EXTERNAL'
  | 'TIMEOUT'
  | 'UNAVAILABLE'
  | 'UNKNOWN_EXTERNAL_STATE';

export class NormalizedSocialError extends Error {
  public readonly category: SocialErrorCategory;
  public readonly retryable: boolean;
  public readonly retryAfter: Date | null;
  public readonly platformCode?: string;

  constructor(options: {
    message: string;
    category: SocialErrorCategory;
    retryable?: boolean;
    retryAfter?: Date | null;
    platformCode?: string;
  }) {
    super(options.message);
    this.name = 'NormalizedSocialError';
    this.category = options.category;
    this.retryable =
      options.retryable ?? (options.category === 'RATE_LIMITED' || options.category === 'TIMEOUT');
    this.retryAfter = options.retryAfter ?? null;
    if (options.platformCode !== undefined) {
      this.platformCode = options.platformCode;
    }
  }
}

export class PlatformError extends Error {
  public readonly code: string;
  public readonly retryable: boolean;
  public readonly platformCode?: string | undefined;
  public readonly retryAfterMs?: number | undefined;

  constructor(options: {
    message: string;
    code: string;
    retryable?: boolean | undefined;
    platformCode?: string | undefined;
    retryAfterMs?: number | undefined;
  }) {
    super(options.message);
    this.name = 'PlatformError';
    this.code = options.code;
    this.retryable = options.retryable ?? false;
    this.platformCode = options.platformCode;
    this.retryAfterMs = options.retryAfterMs;
  }
}
