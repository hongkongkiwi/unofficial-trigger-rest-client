import { z } from 'zod';
import axios, { CancelToken } from 'axios';
import { ValidationError } from './errors';
import { fromZodError } from 'zod-validation-error';

/**
 * Helper function to check if WebSocket is available in the current environment
 */
export function isWebSocketAvailable(): boolean {
  return typeof globalThis !== 'undefined' && 
         (typeof (globalThis as any).WebSocket !== 'undefined' || 
          typeof (globalThis as any).window?.WebSocket !== 'undefined');
}

/**
 * Validate data with a Zod schema and return human-readable error messages
 * @param schema - Zod schema to validate against
 * @param data - Data to validate
 * @returns Validated data or throws a ValidationError with human-readable message
 */
export function validateWithZod<T>(schema: z.ZodType<T>, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const validationError = fromZodError(error);
      throw new ValidationError(validationError.message, error.format());
    }
    throw error;
  }
}

/**
 * Create a cancellable request
 * Use this to create a request that can be cancelled
 * 
 * @returns An object with the cancel token and a cancel function
 * 
 * @example
 * ```typescript
 * const { cancelToken, cancel } = createCancellableRequest();
 * 
 * // Use the token with any API call
 * const runsPromise = client.runs.list({}, { cancelToken });
 * 
 * // Cancel the request if needed
 * cancel('Operation canceled by user');
 * ```
 */
export function createCancellableRequest() {
  const source = axios.CancelToken.source();
  return {
    cancelToken: source.token,
    cancel: (message?: string) => source.cancel(message),
  };
} 