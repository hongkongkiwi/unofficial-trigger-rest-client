/**
 * Error classes for Trigger.dev API client
 * Aligned with the official SDK's error classes
 */

/**
 * Base API error class for Trigger.dev errors
 */
export class ApiError extends Error {
  public status?: number;
  public data?: any;
  public originalError?: Error;

  constructor(message: string, status?: number, data?: any, originalError?: Error) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
    this.originalError = originalError;
  }
}

// For backward compatibility
export class TriggerAPIError extends ApiError {
  constructor(message: string, status?: number, data?: any, originalError?: Error) {
    super(message, status, data, originalError);
    this.name = 'TriggerAPIError';
  }
}

/**
 * Bad request error (400)
 */
export class BadRequestError extends ApiError {
  constructor(message: string, data?: any, originalError?: Error) {
    super(message, 400, data, originalError);
    this.name = 'BadRequestError';
  }
}

/**
 * Validation error for invalid parameters (400)
 * For backward compatibility
 */
export class ValidationError extends BadRequestError {
  constructor(message: string, data?: any) {
    super(message, data);
    this.name = 'ValidationError';
  }
}

/**
 * Authentication error (401)
 */
export class AuthenticationError extends ApiError {
  constructor(message: string, data?: any, originalError?: Error) {
    super(message, 401, data, originalError);
    this.name = 'AuthenticationError';
  }
}

/**
 * Permission denied error (403)
 */
export class PermissionDeniedError extends ApiError {
  constructor(message: string, data?: any, originalError?: Error) {
    super(message, 403, data, originalError);
    this.name = 'PermissionDeniedError';
  }
}

/**
 * Not found error (404)
 */
export class NotFoundError extends ApiError {
  constructor(message: string, data?: any, originalError?: Error) {
    super(message, 404, data, originalError);
    this.name = 'NotFoundError';
  }
}

/**
 * Conflict error (409)
 */
export class ConflictError extends ApiError {
  constructor(message: string, data?: any, originalError?: Error) {
    super(message, 409, data, originalError);
    this.name = 'ConflictError';
  }
}

/**
 * Unprocessable entity error (422)
 */
export class UnprocessableEntityError extends ApiError {
  constructor(message: string, data?: any, originalError?: Error) {
    super(message, 422, data, originalError);
    this.name = 'UnprocessableEntityError';
  }
}

/**
 * Rate limit error (429)
 */
export class RateLimitError extends ApiError {
  public retryAfter?: number;

  constructor(message: string, retryAfter?: number, data?: any, originalError?: Error) {
    super(message, 429, data, originalError);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

/**
 * Server error (500)
 */
export class InternalServerError extends ApiError {
  constructor(message: string, data?: any, originalError?: Error) {
    super(message, 500, data, originalError);
    this.name = 'InternalServerError';
  }
}

/**
 * Server error (500, 502, 503, 504)
 * For backward compatibility
 */
export class ServerError extends ApiError {
  constructor(message: string, status: number, data?: any, originalError?: Error) {
    super(message, status, data, originalError);
    this.name = 'ServerError';
  }
}

/**
 * Task error classes
 */
export class AbortTaskRunError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AbortTaskRunError';
  }
}

export class OutOfMemoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OutOfMemoryError';
  }
}

export class CompleteTaskWithOutput extends Error {
  public output: any;
  
  constructor(output: any) {
    super('Task completed with output');
    this.name = 'CompleteTaskWithOutput';
    this.output = output;
  }
} 