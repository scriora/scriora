import type { ErrorCategory, ResponseMeta } from 'scriora-core';

export interface SuccessEnvelope<T> {
  success: true;
  data: T;
  meta: ResponseMeta;
}

export interface ErrorDetail {
  field?: string | undefined;
  message: string;
  code?: string | undefined;
}

export interface ErrorEnvelope {
  success: false;
  error: {
    code: string;
    category: ErrorCategory;
    message: string;
    retryable: boolean;
    retryAfter?: number;
    details?: ErrorDetail[];
  };
  meta: {
    requestId: string;
    timestamp: string;
  };
}

export function ok<T>(
  data: T,
  requestId = 'req_default',
  overrides?: Partial<ResponseMeta>
): SuccessEnvelope<T> {
  return {
    success: true,
    data,
    meta: {
      requestId,
      timestamp: new Date().toISOString(),
      ...overrides,
    },
  };
}

export function err(
  code: string,
  category: ErrorCategory,
  message: string,
  requestId = 'req_default',
  retryable = false,
  details?: ErrorDetail[],
  retryAfter?: number
): ErrorEnvelope {
  return {
    success: false,
    error: {
      code,
      category,
      message,
      retryable,
      ...(retryAfter !== undefined ? { retryAfter } : {}),
      ...(details !== undefined && details.length > 0 ? { details } : {}),
    },
    meta: {
      requestId,
      timestamp: new Date().toISOString(),
    },
  };
}
