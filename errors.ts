/**
 * Error classes for Trigger.dev API client
 */

/**
 * Base API error class for Trigger.dev errors
 */
export class TriggerAPIError extends Error {
  public status?: number;
  public data?: any;
  public originalError?: Error;

  constructor(message: string, status?: number, data?: any, originalError?: Error) {
    super(message);
    this.name = 'TriggerAPIError';
    this.status = status;
    this.data = data;
    this.originalError = originalError;
  }
}

/**
 * Validation error for invalid parameters
 */
export class ValidationError extends TriggerAPIError {
  constructor(message: string, data?: any) {
    super(message, 400, data);
    this.name = 'ValidationError';
  }
}

/**
 * Authentication error (401)
 */
export class AuthenticationError extends TriggerAPIError {
  constructor(message: string, data?: any, originalError?: Error) {
    super(message, 401, data, originalError);
    this.name = 'AuthenticationError';
  }
}

/**
 * Permission denied error (403)
 */
export class PermissionDeniedError extends TriggerAPIError {
  constructor(message: string, data?: any, originalError?: Error) {
    super(message, 403, data, originalError);
    this.name = 'PermissionDeniedError';
  }
}

/**
 * Not found error (404)
 */
export class NotFoundError extends TriggerAPIError {
  constructor(message: string, data?: any, originalError?: Error) {
    super(message, 404, data, originalError);
    this.name = 'NotFoundError';
  }
}

/**
 * Rate limit error (429)
 */
export class RateLimitError extends TriggerAPIError {
  public retryAfter?: number;

  constructor(message: string, retryAfter?: number, data?: any, originalError?: Error) {
    super(message, 429, data, originalError);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

/**
 * Server error (500, 502, 503, 504)
 */
export class ServerError extends TriggerAPIError {
  constructor(message: string, status: number, data?: any, originalError?: Error) {
    super(message, status, data, originalError);
    this.name = 'ServerError';
  }
} 