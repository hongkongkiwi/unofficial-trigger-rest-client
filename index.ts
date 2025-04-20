import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, AxiosError, CancelToken } from 'axios';
import { z } from 'zod';
import { fromZodError } from 'zod-validation-error';

// Add the WebSocket type definition for Node.js
declare global {
  interface Window {
    WebSocket: WebSocket;
  }
  
  // Simplified WebSocket type for Node.js environments
  interface WebSocket {
    onopen: ((event: any) => void) | null;
    onclose: ((event: any) => void) | null;
    onmessage: ((event: any) => void) | null;
    onerror: ((event: any) => void) | null;
    close(): void;
    send(data: string): void;
  }
  
  var WebSocket: {
    prototype: WebSocket;
    new(url: string, protocols?: string | string[]): WebSocket;
  };
}

/**
 * Helper function to check if WebSocket is available in the current environment
 */
function isWebSocketAvailable(): boolean {
  return typeof globalThis !== 'undefined' && 
         (typeof (globalThis as any).WebSocket !== 'undefined' || 
          typeof (globalThis as any).window?.WebSocket !== 'undefined');
}

// -------------------- ERROR CLASSES --------------------

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

// -------------------- ZOD SCHEMAS --------------------

/**
 * Machine size presets
 */
export const machineSizeSchema = z.enum([
  'micro',
  'small-1x',
  'small-2x',
  'medium-1x',
  'medium-2x',
  'large-1x',
  'large-2x'
]);

export type MachineSize = z.infer<typeof machineSizeSchema>;

/**
 * Run status types
 */
export const runStatusSchema = z.enum([
  'PENDING',
  'EXECUTING', 
  'COMPLETED', 
  'FAILED', 
  'CANCELED', 
  'TIMED_OUT',
  'REATTEMPTING', 
  'CRASHED', 
  'DELAYED', 
  'EXPIRED', 
  'FROZEN', 
  'INTERRUPTED',
  'PENDING_VERSION', 
  'QUEUED', 
  'SYSTEM_FAILURE', 
  'WAITING_FOR_DEPLOY'
]);

export type RunStatus = z.infer<typeof runStatusSchema>;

/**
 * Sort direction
 */
export const sortDirectionSchema = z.enum(['asc', 'desc']);

export type SortDirection = z.infer<typeof sortDirectionSchema>;

/**
 * Run options schema
 */
export const runOptionsSchema = z.object({
  idempotencyKey: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  delayUntil: z.union([z.string(), z.date()]).optional(),
  machine: machineSizeSchema.optional(),
  tags: z.array(z.string()).optional(),
  ttl: z.union([z.string(), z.number()]).optional(),
  maxDuration: z.number().int().positive().optional(),
  version: z.string().optional(),
  releaseConcurrency: z.boolean().optional(),
  batchKey: z.string().optional(),
  startAfter: z.union([z.string(), z.date()]).optional(),
  deduplicate: z.boolean().optional(),
  queue: z.string().optional(),
  priority: z.number().int().optional()
});

export type RunOptions = z.infer<typeof runOptionsSchema>;

/**
 * Task trigger parameters schema
 */
export const triggerTaskParamsSchema = z.object({
  taskId: z.string().min(1, "Task ID is required"),
  payload: z.record(z.unknown()).optional(),
  run: runOptionsSchema.optional()
});

export type TriggerTaskParams = z.infer<typeof triggerTaskParamsSchema>;

/**
 * Batch trigger parameters schema
 */
export const batchTriggerParamsSchema = z.object({
  runs: z.array(triggerTaskParamsSchema).min(1, "At least one run is required")
});

export type BatchTriggerParams = z.infer<typeof batchTriggerParamsSchema>;

/**
 * Common list parameters schema
 */
export const listParamsSchema = z.object({
  limit: z.number().int().positive().optional(),
  cursor: z.string().optional()
});

export type ListParams = z.infer<typeof listParamsSchema>;

/**
 * Common pagination response
 */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    cursor?: string;
    hasMore: boolean;
  };
}

/**
 * Run list parameters schema
 */
export const listRunsParamsSchema = listParamsSchema.extend({
  status: z.array(runStatusSchema).optional(),
  taskId: z.string().optional(),
  search: z.string().optional(),
  sortDirection: sortDirectionSchema.optional(),
  tags: z.array(z.string()).optional(),
  idempotencyKey: z.string().optional(),
  batchId: z.string().optional(),
  projectRef: z.string().optional()
});

export type ListRunsParams = z.infer<typeof listRunsParamsSchema>;

/**
 * Run error schema
 */
export const runErrorSchema = z.object({
  message: z.string(),
  name: z.string().optional(),
  stackTrace: z.string().optional()
});

export type RunError = z.infer<typeof runErrorSchema>;

/**
 * Run attempt schema
 */
export const runAttemptSchema = z.object({
  id: z.string(),
  status: z.enum(['EXECUTING', 'COMPLETED', 'CANCELED', 'FAILED', 'PENDING', 'PAUSED']),
  createdAt: z.date(),
  updatedAt: z.date(),
  error: runErrorSchema.optional(),
  startedAt: z.date().optional(),
  completedAt: z.date().optional()
});

export type RunAttempt = z.infer<typeof runAttemptSchema>;

/**
 * Run details response
 */
export interface RunDetails {
  id: string;
  status: RunStatus;
  taskIdentifier: string;
  isTest: boolean;
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date;
  finishedAt?: Date;
  idempotencyKey?: string;
  version?: string;
  tags: string[];
  metadata?: Record<string, unknown>;
  durationMs: number;
  costInCents: number;
  baseCostInCents: number;
  ttl?: string;
  delayedUntil?: Date;
  expiredAt?: Date;
  attempts: RunAttempt[];
  attemptCount: number;
  error?: RunError;
  payload?: unknown;
  output?: unknown;
  isQueued: boolean;
  isExecuting: boolean;
  isCompleted: boolean;
  isSuccess: boolean;
  isFailed: boolean;
  isCancelled: boolean;
  depth: number;
  triggerFunction: 'trigger' | 'batchTrigger' | 'triggerAndWait' | 'batchTriggerAndWait';
  batchId?: string;
}

/**
 * Schedule parameters schema
 */
export const scheduleParamsSchema = z.object({
  taskId: z.string().min(1, "Task ID is required"),
  cron: z.string().min(1, "Cron expression is required"),
  timezone: z.string().optional(),
  payload: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
  active: z.boolean().optional(),
  machine: machineSizeSchema.optional(),
  tags: z.array(z.string()).optional()
});

export type ScheduleParams = z.infer<typeof scheduleParamsSchema>;

/**
 * Schedule details response
 */
export interface ScheduleDetails {
  id: string;
  taskIdentifier: string;
  cron: string;
  timezone: string;
  description: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  payload?: unknown;
  metadata?: Record<string, unknown>;
  machine?: MachineSize;
  tags?: string[];
}

/**
 * Environment variable parameters schema
 */
export const envVarParamsSchema = z.object({
  key: z.string().min(1, "Key is required"),
  value: z.string().min(1, "Value is required"),
  description: z.string().optional()
});

export type EnvVarParams = z.infer<typeof envVarParamsSchema>;

/**
 * Environment variable response
 */
export interface EnvVarDetails {
  id: string;
  key: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Queue parameters schema
 */
export const queueParamsSchema = z.object({
  name: z.string().min(1, "Name is required"),
  concurrencyLimit: z.number().int().positive().optional(),
  description: z.string().optional()
});

export type QueueParams = z.infer<typeof queueParamsSchema>;

/**
 * Queue details response
 */
export interface QueueDetails {
  id: string;
  name: string;
  concurrencyLimit: number;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Logger interface for consistent logging
 */
export interface Logger {
  error: (message: string, ...args: any[]) => void;
  warn: (message: string, ...args: any[]) => void;
  info: (message: string, ...args: any[]) => void;
  debug: (message: string, ...args: any[]) => void;
}

/**
 * Logger options schema
 */
export const loggerOptionsSchema = z.object({
  enabled: z.boolean(),
  level: z.enum(['error', 'warn', 'info', 'debug'])
});

export type LoggerOptions = z.infer<typeof loggerOptionsSchema>;

/**
 * Request metrics schema
 */
export const requestMetricsSchema = z.object({
  url: z.string(),
  method: z.string(),
  startTime: z.number(),
  endTime: z.number(),
  duration: z.number(),
  status: z.number().optional(),
  success: z.boolean(),
  error: z.string().optional()
});

export type RequestMetrics = z.infer<typeof requestMetricsSchema>;

/**
 * Performance metrics options schema
 */
export const performanceMetricsOptionsSchema = z.object({
  enabled: z.boolean(),
  logTimings: z.boolean(),
  historySize: z.number().int().positive(),
  telemetryHook: z.function().args(requestMetricsSchema).returns(z.void()).optional()
});

export type PerformanceMetricsOptions = z.infer<typeof performanceMetricsOptionsSchema>;

/**
 * Retry options schema
 */
export const retryOptionsSchema = z.object({
  maxRetries: z.number().int().nonnegative().optional(),
  retryDelay: z.number().int().positive().optional(),
  retryStatusCodes: z.array(z.number().int()).optional(),
  useJitter: z.boolean().optional()
});

export type RetryOptions = z.infer<typeof retryOptionsSchema>;

/**
 * WebSocket manager options schema
 */
export const webSocketManagerOptionsSchema = z.object({
  pingInterval: z.number().int().positive().optional(),
  pongTimeout: z.number().int().positive().optional(),
  connectionTimeout: z.number().int().positive().optional(),
  maxReconnectAttempts: z.number().int().nonnegative().optional(),
  initialReconnectDelay: z.number().int().positive().optional(),
  maxReconnectDelay: z.number().int().positive().optional(),
  reconnectBackoffFactor: z.number().positive().optional()
}).strict();

export type WebSocketManagerOptions = z.infer<typeof webSocketManagerOptionsSchema>;

/**
 * API options schema
 */
export const triggerAPIOptionsSchema = z.object({
  baseURL: z.string().url().optional(),
  websocketURL: z.string().url().optional(),
  timeout: z.number().int().positive().optional(),
  logging: loggerOptionsSchema.optional(),
  logger: z.custom<Logger>((val) => {
    return val !== null && 
           typeof val === 'object' && 
           typeof (val as any).error === 'function' &&
           typeof (val as any).warn === 'function' &&
           typeof (val as any).info === 'function' &&
           typeof (val as any).debug === 'function';
  }, { message: "Logger must implement error, warn, info, and debug methods" }).optional(),
  retry: retryOptionsSchema.optional(),
  enableCompression: z.boolean().optional(),
  metrics: performanceMetricsOptionsSchema.optional(),
  websocketOptions: webSocketManagerOptionsSchema.optional()
}).strict();

export type TriggerAPIOptions = {
  baseURL?: string;
  websocketURL?: string;
  timeout?: number;
  logging?: LoggerOptions;
  logger?: Logger;  // Custom logger implementation
  retry?: RetryOptions;
  enableCompression?: boolean;
  metrics?: PerformanceMetricsOptions;
  websocketOptions?: WebSocketManagerOptions;
};

/**
 * Default API options
 */
const DEFAULT_OPTIONS: TriggerAPIOptions = {
  baseURL: 'https://api.trigger.dev/api/v3',
  websocketURL: 'wss://api.trigger.dev/api/v3/ws',
  timeout: 30000,
  logging: {
    enabled: false,
    level: 'error'
  },
  retry: {
    maxRetries: 3,
    retryDelay: 300,
    retryStatusCodes: [408, 429, 500, 502, 503, 504],
    useJitter: true
  },
  enableCompression: true,
  metrics: {
    enabled: false,
    logTimings: false,
    historySize: 100
  }
};

/**
 * TriggerAPI - A standalone client for the Trigger.dev Management API
 * Compatible with Trigger.dev v4
 */
export class TriggerAPI {
  private client: AxiosInstance;
  private baseURL: string;
  private websocketURL: string;
  private apiKey: string;
  private options: TriggerAPIOptions;
  private logger: Logger;
  
  /** 
   * Request metrics history 
   */
  private metricsHistory: RequestMetrics[] = [];
  
  /**
   * WebSocket connection manager
   */
  private wsManager: WebSocketManager | null = null;

  /**
   * Create a new TriggerAPI client
   * @param secretKey - Your Trigger.dev secret key
   * @param options - Client configuration options
   */
  constructor(secretKey: string, options: TriggerAPIOptions = {}) {
    if (!secretKey) {
      throw new Error('Trigger.dev secret key is required');
    }
    
    // Validate options with Zod if provided
    if (Object.keys(options).length > 0) {
      try {
        validateWithZod(triggerAPIOptionsSchema, options);
      } catch (error) {
        // Display friendlier error and rethrow
        console.error('Invalid TriggerAPI options:', error);
        throw error;
      }
    }

    this.apiKey = secretKey;
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.baseURL = this.options.baseURL || DEFAULT_OPTIONS.baseURL!;
    this.websocketURL = this.options.websocketURL || DEFAULT_OPTIONS.websocketURL!;
    
    // Set up logging (use custom logger if provided, otherwise create one)
    this.logger = this.options.logger || this.createLogger();
    
    // Headers for the client
    const headers: Record<string, string> = {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
    };

    // Add compression headers if enabled
    if (this.options.enableCompression !== false) {
      headers['Accept-Encoding'] = 'gzip, deflate';
      this.logger.debug('Response compression enabled');
    }
    
    this.client = axios.create({
      baseURL: this.baseURL,
      headers,
      timeout: this.options.timeout,
    });

    // Add response interceptor to handle errors
    this.setupErrorHandling();

    // Configure automatic retries if enabled
    this.setupRetry();
    
    // Set up metrics collection if enabled
    this.setupMetrics();

    // Bind methods that need to access 'this'
    this.runs.poll = this.runs.poll.bind(this);
    this.runs.subscribeToRun = this.runs.subscribeToRun.bind(this);
    this.runs.subscribeToRunsWithTag = this.runs.subscribeToRunsWithTag.bind(this);
    this.runs.subscribeToBatch = this.runs.subscribeToBatch.bind(this);
    this.runs.listAll = this.runs.listAll.bind(this);
  }

  /**
   * Creates a configured logger based on options
   */
  private createLogger() {
    const { enabled, level } = this.options.logging || DEFAULT_OPTIONS.logging!;
    
    const noop = () => {};
    const levels: Record<string, number> = { error: 0, warn: 1, info: 2, debug: 3 };
    const levelValue = levels[level || 'error'];
    
    const log = (logLevel: 'error' | 'warn' | 'info' | 'debug', message: string, ...args: any[]) => {
      if (!enabled) return;
      if (levels[logLevel] > levelValue) return;
      
      const prefix = `[TriggerAPI:${logLevel.toUpperCase()}]`;
      const fullMessage = `${prefix} ${message}`;
      
      if (typeof console !== 'undefined') {
        if (logLevel === 'error' && console.error) {
          console.error(fullMessage, ...args);
        } else if (logLevel === 'warn' && console.warn) {
          console.warn(fullMessage, ...args);
        } else if (logLevel === 'info' && console.info) {
          console.info(fullMessage, ...args);
        } else if (console.log) {
          console.log(fullMessage, ...args);
        }
      }
    };
    
    return {
      error: (message: string, ...args: any[]) => log('error', message, ...args),
      warn: (message: string, ...args: any[]) => log('warn', message, ...args),
      info: (message: string, ...args: any[]) => log('info', message, ...args),
      debug: (message: string, ...args: any[]) => log('debug', message, ...args),
    };
  }

  /**
   * Set up error handling interceptor
   */
  private setupErrorHandling() {
    this.client.interceptors.response.use(
      (response: AxiosResponse) => response,
      (error: AxiosError) => {
        if (error.response) {
          const { status, data } = error.response;
          let apiError: TriggerAPIError;
          const errorMsg = typeof data === 'object' && data !== null && 'message' in data 
            ? String(data.message) 
            : JSON.stringify(data);

          // Create specific error type based on status code
          switch (status) {
            case 401:
              apiError = new AuthenticationError(
                `Authentication failed: ${errorMsg}`, 
                data, 
                error
              );
              break;
            case 403:
              apiError = new PermissionDeniedError(
                `Permission denied: ${errorMsg}`, 
                data, 
                error
              );
              break;
            case 404:
              apiError = new NotFoundError(
                `Resource not found: ${errorMsg}`, 
                data, 
                error
              );
              break;
            case 429:
              const retryAfter = error.response.headers['retry-after'] 
                ? parseInt(error.response.headers['retry-after'], 10) 
                : undefined;
              apiError = new RateLimitError(
                `Rate limit exceeded: ${errorMsg}`, 
                retryAfter, 
                data, 
                error
              );
              break;
            case 500:
            case 502:
            case 503:
            case 504:
              apiError = new ServerError(
                `Server error (${status}): ${errorMsg}`, 
                status,
                data, 
                error
              );
              break;
            default:
              apiError = new TriggerAPIError(
                `API error (${status}): ${errorMsg}`, 
                status, 
                data, 
                error
              );
              break;
          }

          this.logger.error(`${apiError.name}: ${apiError.message}`);
          return Promise.reject(apiError);
        } else if (error.request) {
          const networkError = new TriggerAPIError(
            'Network error: No response received', 
            undefined, 
            undefined, 
            error
          );
          this.logger.error(`Network Error: ${error.message}`);
          return Promise.reject(networkError);
        }
        
        this.logger.error(`Unknown Error: ${error.message}`);
        return Promise.reject(error);
      }
    );
  }

  /**
   * Configure automatic retry logic with the provided options
   * 
   * @private
   * @param options - Retry configuration options
   * @returns The interceptor ID for later removal if needed
   */
  private configureRetryLogic(options: {
    maxRetries: number;
    retryDelay: number;
    retryStatusCodes: number[];
    useJitter?: boolean;
  }): number {
    const { maxRetries, retryDelay, retryStatusCodes, useJitter } = options;
    
    return this.client.interceptors.response.use(undefined, async (error: AxiosError) => {
      const config = error.config;
      if (!config) return Promise.reject(error);
      
      // Add retry count to config
      const retryState = config as any;
      retryState._retryCount = retryState._retryCount || 0;
      
      // Check if we should retry the request
      if (retryState._retryCount >= maxRetries) {
        return Promise.reject(error);
      }
      
      const status = error.response?.status;
      if (!status || !retryStatusCodes.includes(status)) {
        return Promise.reject(error);
      }
      
      // Retry with exponential backoff and jitter if enabled
      retryState._retryCount += 1;
      const baseDelay = retryDelay * Math.pow(2, retryState._retryCount - 1);
      
      // Add jitter to prevent thundering herd problem
      const delay = useJitter !== false
        ? baseDelay * (0.5 + Math.random() * 0.5) // 50-100% of base delay
        : baseDelay;
      
      this.logger.info(`Retrying request (${retryState._retryCount}/${maxRetries}) after ${Math.round(delay)}ms`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return this.client(config);
    });
  }

  /**
   * Set up automatic retry with configurable options
   */
  private setupRetry() {
    const retryConfig = this.options.retry || DEFAULT_OPTIONS.retry!;
    this.configureRetryLogic({
      maxRetries: retryConfig.maxRetries!,
      retryDelay: retryConfig.retryDelay!,
      retryStatusCodes: retryConfig.retryStatusCodes!,
      useJitter: retryConfig.useJitter
    });
  }

  /**
   * Validate parameters for required fields and custom validation
   * @param params - Parameters to validate
   * @param requiredFields - Array of required field names
   * @param customValidations - Object with custom validation functions
   * @throws {ValidationError} - If validation fails
   */
  private validateParams(
    params: unknown, 
    requiredFields: string[] = [], 
    customValidations?: Record<string, (val: unknown) => boolean>
  ) {
    if (!params || typeof params !== 'object') {
      throw new ValidationError('Parameters must be an object');
    }
    
    const paramsObj = params as Record<string, unknown>;
    
    // Check required fields
    for (const field of requiredFields) {
      if (!(field in paramsObj) || paramsObj[field] === undefined || paramsObj[field] === null) {
        throw new ValidationError(`Missing required parameter: ${field}`);
      }
    }
    
    // Run custom validations
    if (customValidations) {
      for (const [field, validator] of Object.entries(customValidations)) {
        if (field in paramsObj && !validator(paramsObj[field])) {
          throw new ValidationError(`Invalid value for parameter: ${field}`);
        }
      }
    }
    
    return true;
  }

  /**
   * Tasks API
   */
  tasks = {
    /**
     * Trigger a task
     * @param params - Task parameters
     * @returns {Promise<RunDetails>} - Run details
     */
    trigger: async (params: TriggerTaskParams): Promise<RunDetails> => {
      validateWithZod(triggerTaskParamsSchema, params);
      this.logger.debug('Triggering task:', params);
      
      const response = await this.client.post('/tasks/trigger', params);
      return response.data;
    },

    /**
     * Batch trigger multiple tasks
     * @param params - Batch parameters
     * @param options - Request options
     * @returns {Promise<RunDetails[]>} - Array of run details
     */
    batchTrigger: async (params: BatchTriggerParams, options?: { cancelToken?: CancelToken }): Promise<RunDetails[]> => {
      validateWithZod(batchTriggerParamsSchema, params);
      this.logger.debug('Batch triggering tasks:', params);
      
      const response = await this.client.post('/tasks/batch-trigger', params, {
        cancelToken: options?.cancelToken
      });
      return response.data;
    },
    
    /**
     * Batch multiple task triggering requests into a single API call
     * 
     * This is helpful when you need to trigger many tasks in parallel
     * 
     * @param requests - Array of task parameters
     * @param options - Request options
     */
    batchRequests: async (requests: TriggerTaskParams[], options?: { cancelToken?: CancelToken }) => {
      if (!Array.isArray(requests) || requests.length === 0) {
        throw new Error('Batch requests must be a non-empty array');
      }
      
      this.logger.debug('Batching requests', requests.length);
      return this.tasks.batchTrigger({ runs: requests }, options);
    }
  };

  /**
   * Runs API
   */
  runs = {
    /**
     * List runs with optional filters
     * @param params - List parameters
     * @param options - Request options
     */
    list: async (params?: ListRunsParams, options?: { cancelToken?: CancelToken }): Promise<PaginatedResponse<RunDetails>> => {
      this.logger.debug('Listing runs', params);
      return this.client.get('/runs', { 
        params,
        cancelToken: options?.cancelToken
      }).then((res: AxiosResponse) => res.data);
    },

    /**
     * Automatically fetch all pages of runs matching the filters
     * @param params - List parameters (limit will be used per page)
     * @param options - Request options including page limit
     */
    listAll: async function(this: TriggerAPI, params?: ListRunsParams, options?: { 
      cancelToken?: CancelToken,
      maxPages?: number,
      onPage?: (page: RunDetails[], pageNumber: number) => void | Promise<void>
    }): Promise<RunDetails[]> {
      const maxPages = options?.maxPages || Infinity;
      let currentPage = 1;
      let allResults: RunDetails[] = [];
      let currentParams = { ...params };
      let hasMore = true;
      
      this.logger.debug('Fetching all run pages', { maxPages, params });
      
      while (hasMore && currentPage <= maxPages) {
        const response: PaginatedResponse<RunDetails> = await this.runs.list(currentParams, {
          cancelToken: options?.cancelToken
        });
        
        allResults = [...allResults, ...response.data];
        
        if (options?.onPage) {
          await options.onPage(response.data, currentPage);
        }
        
        if (!response.pagination.hasMore || !response.pagination.cursor) {
          hasMore = false;
        } else {
          currentParams = { ...currentParams, cursor: response.pagination.cursor };
          currentPage++;
        }
      }
      
      return allResults;
    },

    /**
     * Retrieve a specific run
     * @param runId - The ID of the run
     * @param options - Request options
     */
    retrieve: async (runId: string, options?: { cancelToken?: CancelToken }): Promise<RunDetails> => {
      this.validateParams({ runId }, ['runId'], {
        runId: val => typeof val === 'string' && val.length > 0
      });
      
      this.logger.debug('Retrieving run', runId);
      return this.client.get(`/runs/${runId}`, {
        cancelToken: options?.cancelToken
      }).then((res: AxiosResponse) => res.data);
    },

    /**
     * Replay a run
     * @param runId - The ID of the run to replay
     * @param options - Request options
     */
    replay: async (runId: string, options?: { cancelToken?: CancelToken }) => {
      this.validateParams({ runId }, ['runId'], {
        runId: val => typeof val === 'string' && val.length > 0
      });
      
      this.logger.debug('Replaying run', runId);
      return this.client.post(`/runs/${runId}/replay`, undefined, {
        cancelToken: options?.cancelToken
      }).then((res: AxiosResponse) => res.data);
    },

    /**
     * Cancel a run
     * @param params - The parameters for cancellation
     * @returns {Promise<boolean>} - True if cancellation was successful
     */
    cancel: async (params: { runId: string }): Promise<boolean> => {
      this.validateParams(params, ['runId']);
      this.logger.debug('Cancelling run:', params);
      
      const response = await this.client.post(`/runs/${params.runId}/cancel`, undefined);
      return response.data;
    },

    /**
     * Reschedule a run
     * @param runId - The ID of the run to reschedule
     * @param params - Reschedule parameters
     * @param options - Request options
     */
    reschedule: async (runId: string, params: { delayUntil: string | Date }, options?: { cancelToken?: CancelToken }) => {
      this.validateParams({ runId, ...params }, ['runId', 'delayUntil']);
      
      this.logger.debug('Rescheduling run', { runId, params });
      return this.client.post(`/runs/${runId}/reschedule`, params, {
        cancelToken: options?.cancelToken
      }).then((res: AxiosResponse) => res.data);
    },

    /**
     * Update run metadata
     * @param runId - The ID of the run
     * @param metadata - Metadata to update
     * @param options - Request options
     */
    updateMetadata: async (runId: string, metadata: Record<string, unknown>, options?: { cancelToken?: CancelToken }) => {
      this.validateParams({ runId }, ['runId'], {
        runId: val => typeof val === 'string' && val.length > 0
      });
      
      this.logger.debug('Updating run metadata', { runId, metadata });
      return this.client.put(`/runs/${runId}/metadata`, { metadata }, {
        cancelToken: options?.cancelToken
      }).then((res: AxiosResponse) => res.data);
    },

    /**
     * @v4 - Poll a run until completion
     * @param runId - The ID of the run
     * @param options - Poll options
     */
    poll: async function(this: TriggerAPI, runId: string, options?: { 
      pollIntervalMs?: number,
      timeoutMs?: number,
      cancelToken?: CancelToken
    }): Promise<RunDetails> {
      this.validateParams({ runId }, ['runId'], {
        runId: val => typeof val === 'string' && val.length > 0
      });
      
      const intervalMs = options?.pollIntervalMs || 1000;
      const timeoutMs = options?.timeoutMs || 0; // 0 means no timeout
      const client = this.client;
      const startTime = Date.now();
      const logger = this.logger;
      
      logger.debug('Polling run until completion', { runId, intervalMs, timeoutMs });
      
      const poll = async (): Promise<RunDetails> => {
        // Check timeout
        if (timeoutMs > 0 && (Date.now() - startTime) > timeoutMs) {
          throw new Error(`Polling timed out after ${timeoutMs}ms`);
        }
        
        const response = await client.get(`/runs/${runId}`, {
          cancelToken: options?.cancelToken
        });
        const run = response.data;
        
        const completedStatuses = [
          'COMPLETED', 'CANCELED', 'FAILED', 'CRASHED', 'INTERRUPTED', 
          'SYSTEM_FAILURE', 'EXPIRED', 'TIMED_OUT'
        ];
        
        if (completedStatuses.includes(run.status)) {
          logger.debug('Run completed polling', { runId, status: run.status });
          return run;
        }
        
        logger.debug('Run not yet completed, waiting to poll again', { runId, status: run.status });
        await new Promise(resolve => setTimeout(resolve, intervalMs));
        return poll();
      };
      
      return poll();
    },

    /**
     * @v4 - Subscribe to run updates via WebSocket
     * @param runId - The ID of the run
     * @param options - Subscription options
     */
    subscribeToRun: async function* (this: TriggerAPI, runId: string, options?: { stopOnCompletion?: boolean }) {
      // Initialize WebSocket manager if not already created
      if (!this.wsManager) {
        this.wsManager = new WebSocketManager(
          this.websocketURL, 
          this.apiKey, 
          this.logger,
          this.options.websocketOptions
        );
      }
      
      // Retrieve the initial run state to yield it immediately
      const initialRun = await this.client.get(`/runs/${runId}`).then((res: AxiosResponse) => res.data);
      yield initialRun;
      
      const stopOnCompletion = options?.stopOnCompletion ?? true;
      
      // If run is already completed and stopOnCompletion is true, no need to subscribe
      if (stopOnCompletion && ['COMPLETED', 'CANCELED', 'FAILED', 'CRASHED', 
                               'INTERRUPTED', 'SYSTEM_FAILURE', 'EXPIRED', 
                               'TIMED_OUT'].includes(initialRun.status)) {
        return;
      }
      
      try {
        // Create a promise that will resolve when we're done
        const done = new Promise<void>((resolve) => {
          let unsubscribe: (() => void) | null = null;
          
          try {
            // Subscribe to run updates
            unsubscribe = this.wsManager!.subscribe('run', runId, (data) => {
              const run = data.run;
              
              // Yield the updated run
              const yieldResult = {
                value: run,
                done: false
              };
              
              // @ts-ignore - This is a workaround to make the generator yield within a callback
              this.subscribeToRun.next(yieldResult);
              
              // If the run is completed and stopOnCompletion is true, unsubscribe
              if (stopOnCompletion && ['COMPLETED', 'CANCELED', 'FAILED', 'CRASHED', 
                                       'INTERRUPTED', 'SYSTEM_FAILURE', 'EXPIRED', 
                                       'TIMED_OUT'].includes(run.status)) {
                if (unsubscribe) {
                  unsubscribe();
                  unsubscribe = null;
                }
                resolve();
              }
            });
          } catch (error) {
            this.logger.error('Error subscribing to run updates', error);
            if (unsubscribe) {
              unsubscribe();
            }
            resolve();
          }
        });
        
        // Wait for completion
        await done;
      } catch (error) {
        this.logger.error('Error in run subscription', error);
      }
    },

    /**
     * @v4 - Subscribe to runs with specific tags
     * @param tag - Tag or array of tags to filter runs
     */
    subscribeToRunsWithTag: async function* (this: TriggerAPI, tag: string | string[]) {
      // Initialize WebSocket manager if not already created
      if (!this.wsManager) {
        this.wsManager = new WebSocketManager(
          this.websocketURL, 
          this.apiKey, 
          this.logger,
          this.options.websocketOptions
        );
      }
      
      const tags = Array.isArray(tag) ? tag : [tag];
      
      try {
        // Create a promise that will resolve when we're done
        const done = new Promise<void>((resolve) => {
          const tagSubscriptions: (() => void)[] = [];
          
          // Subscribe to each tag
          for (const tagValue of tags) {
            try {
              const unsubscribe = this.wsManager!.subscribe('tag', tagValue, (data) => {
                // Yield the run
                const yieldResult = {
                  value: data.run,
                  done: false
                };
                
                // @ts-ignore - This is a workaround to make the generator yield within a callback
                this.subscribeToRunsWithTag.next(yieldResult);
              });
              
              tagSubscriptions.push(unsubscribe);
            } catch (error) {
              this.logger.error(`Error subscribing to tag: ${tagValue}`, error);
            }
          }
          
          // This generator doesn't automatically resolve, it needs to be manually cleaned up
          // by the caller when they're done with it
        });
        
        // Yield initial tag subscription confirmation
        yield { subscribed: true, tags };
        
        // Wait for completion (which won't happen automatically)
        await done;
      } catch (error) {
        this.logger.error('Error in tag subscription', error);
      }
    },

    /**
     * @v4 - Subscribe to runs in a batch
     * @param batchId - The batch ID
     */
    subscribeToBatch: async function* (this: TriggerAPI, batchId: string) {
      // Initialize WebSocket manager if not already created
      if (!this.wsManager) {
        this.wsManager = new WebSocketManager(
          this.websocketURL, 
          this.apiKey, 
          this.logger,
          this.options.websocketOptions
        );
      }
      
      // Retrieve the initial batch state
      const initialBatch = await this.client.get(`/batches/${batchId}`).then((res: AxiosResponse) => res.data);
      yield initialBatch;
      
      try {
        // Create a promise that will resolve when we're done
        const done = new Promise<void>((resolve) => {
          let unsubscribe: (() => void) | null = null;
          
          try {
            // Subscribe to batch updates
            unsubscribe = this.wsManager!.subscribe('batch', batchId, (data) => {
              const batch = data.batch;
              
              // Yield the updated batch
              const yieldResult = {
                value: batch,
                done: false
              };
              
              // @ts-ignore - This is a workaround to make the generator yield within a callback
              this.subscribeToBatch.next(yieldResult);
              
              // Check if all runs in the batch are completed
              const allCompleted = batch.runs?.every((run: RunDetails) => 
                ['COMPLETED', 'CANCELED', 'FAILED', 'CRASHED', 
                'INTERRUPTED', 'SYSTEM_FAILURE', 'EXPIRED', 
                'TIMED_OUT'].includes(run.status)
              );
              
              if (allCompleted) {
                if (unsubscribe) {
                  unsubscribe();
                  unsubscribe = null;
                }
                resolve();
              }
            });
          } catch (error) {
            this.logger.error('Error subscribing to batch updates', error);
            if (unsubscribe) {
              unsubscribe();
            }
            resolve();
          }
        });
        
        // Wait for completion
        await done;
      } catch (error) {
        this.logger.error('Error in batch subscription', error);
      }
    },

    /**
     * @v4 - Fetch a stream from a run
     * @param runId - The ID of the run
     * @param streamKey - The key of the stream
     */
    fetchStream: async (runId: string, streamKey: string) => {
      return this.client.get(`/runs/${runId}/streams/${streamKey}`).then((res: AxiosResponse) => res.data);
    }
  };

  /**
   * Schedules API
   */
  schedules = {
    /**
     * List schedules with optional filters
     * @param params - List parameters
     */
    list: async (params?: {
      limit?: number;
      cursor?: string;
      taskId?: string;
      active?: boolean;
    }) => {
      return this.client.get('/schedules', { params }).then((res: AxiosResponse) => res.data);
    },

    /**
     * Create a new schedule
     * @param params - Schedule parameters
     */
    create: async (params: {
      taskId: string;
      cron: string;
      timezone?: string;
      payload?: Record<string, any>;
      metadata?: Record<string, any>;
      active?: boolean;
      /** @v4 - Machine size for scheduled runs */
      machine?: 'micro' | 'small-1x' | 'small-2x' | 'medium-1x' | 'medium-2x' | 'large-1x' | 'large-2x';
      /** @v4 - Tags for scheduled runs */
      tags?: string[];
    }) => {
      validateWithZod(scheduleParamsSchema, params);
      return this.client.post('/schedules', params).then((res: AxiosResponse) => res.data);
    },

    /**
     * Retrieve a specific schedule
     * @param scheduleId - The ID of the schedule
     */
    retrieve: async (scheduleId: string) => {
      return this.client.get(`/schedules/${scheduleId}`).then((res: AxiosResponse) => res.data);
    },

    /**
     * Update a schedule
     * @param scheduleId - The ID of the schedule
     * @param params - Update parameters
     */
    update: async (scheduleId: string, params: {
      cron?: string;
      timezone?: string;
      payload?: Record<string, any>;
      metadata?: Record<string, any>;
      /** @v4 - Machine size for scheduled runs */
      machine?: 'micro' | 'small-1x' | 'small-2x' | 'medium-1x' | 'medium-2x' | 'large-1x' | 'large-2x';
      /** @v4 - Tags for scheduled runs */
      tags?: string[];
    }) => {
      return this.client.put(`/schedules/${scheduleId}`, params).then((res: AxiosResponse) => res.data);
    },

    /**
     * Delete a schedule
     * @param scheduleId - The ID of the schedule to delete
     */
    delete: async (scheduleId: string) => {
      return this.client.delete(`/schedules/${scheduleId}`).then((res: AxiosResponse) => res.data);
    },

    /**
     * Deactivate a schedule
     * @param scheduleId - The ID of the schedule to deactivate
     */
    deactivate: async (scheduleId: string) => {
      return this.client.post(`/schedules/${scheduleId}/deactivate`).then((res: AxiosResponse) => res.data);
    },

    /**
     * Activate a schedule
     * @param scheduleId - The ID of the schedule to activate
     */
    activate: async (scheduleId: string) => {
      return this.client.post(`/schedules/${scheduleId}/activate`).then((res: AxiosResponse) => res.data);
    },

    /**
     * Get available timezones
     */
    getTimezones: async () => {
      return this.client.get('/schedules/timezones').then((res: AxiosResponse) => res.data);
    }
  };

  /**
   * Environment Variables API
   */
  envVars = {
    /**
     * List environment variables
     * @param params - List parameters
     */
    list: async (params?: {
      limit?: number;
      cursor?: string;
    }) => {
      return this.client.get('/env-vars', { params }).then((res: AxiosResponse) => res.data);
    },

    /**
     * Import multiple environment variables
     * @param params - Import parameters
     */
    import: async (params: {
      environmentVariables: Array<{
        key: string;
        value: string;
        description?: string;
      }>;
    }) => {
      return this.client.post('/env-vars/import', params).then((res: AxiosResponse) => res.data);
    },

    /**
     * Create a new environment variable
     * @param params - Environment variable parameters
     */
    create: async (params: {
      key: string;
      value: string;
      description?: string;
    }) => {
      validateWithZod(envVarParamsSchema, params);
      return this.client.post('/env-vars', params).then((res: AxiosResponse) => res.data);
    },

    /**
     * Retrieve a specific environment variable
     * @param envVarId - The ID of the environment variable
     */
    retrieve: async (envVarId: string) => {
      return this.client.get(`/env-vars/${envVarId}`).then((res: AxiosResponse) => res.data);
    },

    /**
     * Update an environment variable
     * @param envVarId - The ID of the environment variable
     * @param params - Update parameters
     */
    update: async (envVarId: string, params: {
      value?: string;
      description?: string;
    }) => {
      return this.client.put(`/env-vars/${envVarId}`, params).then((res: AxiosResponse) => res.data);
    },

    /**
     * Delete an environment variable
     * @param envVarId - The ID of the environment variable to delete
     */
    delete: async (envVarId: string) => {
      return this.client.delete(`/env-vars/${envVarId}`).then((res: AxiosResponse) => res.data);
    }
  };

  /**
   * @v4 - Queues API
   */
  queues = {
    /**
     * List all queues
     * @param params - List parameters
     */
    list: async (params?: {
      limit?: number;
      cursor?: string;
    }) => {
      return this.client.get('/queues', { params }).then((res: AxiosResponse) => res.data);
    },

    /**
     * Create a new queue
     * @param params - Queue parameters
     */
    create: async (params: {
      name: string;
      concurrencyLimit?: number;
      description?: string;
    }) => {
      validateWithZod(queueParamsSchema, params);
      return this.client.post('/queues', params).then((res: AxiosResponse) => res.data);
    },

    /**
     * Get details about a queue
     * @param queueId - The ID of the queue
     */
    retrieve: async (queueId: string) => {
      return this.client.get(`/queues/${queueId}`).then((res: AxiosResponse) => res.data);
    },

    /**
     * Update a queue
     * @param queueId - The ID of the queue
     * @param params - Update parameters
     */
    update: async (queueId: string, params: {
      concurrencyLimit?: number;
      description?: string;
    }) => {
      return this.client.put(`/queues/${queueId}`, params).then((res: AxiosResponse) => res.data);
    },

    /**
     * Delete a queue
     * @param queueId - The ID of the queue to delete
     */
    delete: async (queueId: string) => {
      return this.client.delete(`/queues/${queueId}`).then((res: AxiosResponse) => res.data);
    }
  };

  /**
   * @v4 - Cache API - Simple key-value store for task runs
   */
  cache = {
    /**
     * Get a cached value
     * @param key - The cache key
     */
    get: async (key: string) => {
      return this.client.get(`/cache/${key}`).then((res: AxiosResponse) => res.data);
    },

    /**
     * Set a cached value
     * @param key - The cache key
     * @param value - The value to cache
     * @param ttl - Time-to-live in seconds
     */
    set: async (key: string, value: any, ttl?: number) => {
      return this.client.put(`/cache/${key}`, { value, ttl }).then((res: AxiosResponse) => res.data);
    },

    /**
     * Delete a cached value
     * @param key - The cache key to delete
     */
    delete: async (key: string) => {
      return this.client.delete(`/cache/${key}`).then((res: AxiosResponse) => res.data);
    }
  };

  /**
   * @v4 - Batch API for managing batch operations
   */
  batch = {
    /**
     * List all batches
     * @param params - List parameters
     */
    list: async (params?: {
      limit?: number;
      cursor?: string;
    }) => {
      return this.client.get('/batches', { params }).then((res: AxiosResponse) => res.data);
    },

    /**
     * Get details about a batch
     * @param batchId - The ID of the batch
     */
    retrieve: async (batchId: string) => {
      return this.client.get(`/batches/${batchId}`).then((res: AxiosResponse) => res.data);
    },

    /**
     * Cancel all runs in a batch
     * @param batchId - The ID of the batch
     */
    cancel: async (batchId: string) => {
      return this.client.post(`/batches/${batchId}/cancel`).then((res: AxiosResponse) => res.data);
    }
  };

  /**
   * @v4 - AI tools for working with AI tasks
   */
  ai = {
    /**
     * Create a tool from a task
     * @param params - Tool parameters
     */
    createTool: async (params: {
      taskId: string;
      description: string;
      parameters: Record<string, any>;
    }) => {
      return this.client.post('/ai/tools', params).then((res: AxiosResponse) => res.data);
    }
  };

  /**
   * @v4 - Metadata utilities
   */
  metadata = {
    /**
     * Set metadata on the current context
     * @param key - Metadata key
     * @param value - Metadata value
     */
    set: async (key: string, value: any) => {
      return this.client.put(`/metadata/${key}`, { value }).then((res: AxiosResponse) => res.data);
    },

    /**
     * Get metadata from the current context
     * @param key - Metadata key
     */
    get: async (key: string) => {
      return this.client.get(`/metadata/${key}`).then((res: AxiosResponse) => res.data);
    }
  };

  /**
   * Helper to configure the API with a different base URL (for testing or development)
   * @param baseURL - The custom base URL to use
   */
  setBaseURL(baseURL: string): void {
    this.client.defaults.baseURL = baseURL;
  }

  /**
   * Helper to set the WebSocket URL
   * @param websocketURL - The custom WebSocket URL to use
   */
  setWebSocketURL(websocketURL: string): void {
    this.websocketURL = websocketURL;
  }

  /**
   * Helper to add custom headers to requests
   * @param headers - Headers to add to requests
   */
  setHeaders(headers: Record<string, string>): void {
    Object.entries(headers).forEach(([key, value]) => {
      this.client.defaults.headers.common[key] = value;
    });
  }

  /**
   * @v4 - Set request timeout
   * @param timeoutMs - Timeout in milliseconds
   */
  setTimeout(timeoutMs: number): void {
    this.client.defaults.timeout = timeoutMs;
  }

  /**
   * Clean up WebSocket resources
   * This should be called when the API client is no longer needed
   */
  disposeWebSocket(): void {
    if (this.wsManager) {
      this.logger.debug('Disposing WebSocket connection');
      this.wsManager.disconnect();
      this.wsManager = null;
    }
  }

  /**
   * Register cleanup handlers to dispose of resources when the process exits
   * This is useful for long-running applications to avoid resource leaks
   * 
   * @returns A function that can be called to remove the exit handlers
   */
  disposeOnExit(): () => void {
    const exitHandler = () => {
      this.logger.debug('Process exit detected, cleaning up resources');
      this.disposeWebSocket();
    };
    
    // Register handlers for common exit signals
    process.on('exit', exitHandler);
    process.on('SIGINT', exitHandler);
    process.on('SIGTERM', exitHandler);
    process.on('uncaughtException', (error) => {
      this.logger.error('Uncaught exception', error);
      exitHandler();
      process.exit(1);
    });
    
    // Return a function to remove the handlers if needed
    return () => {
      process.removeListener('exit', exitHandler);
      process.removeListener('SIGINT', exitHandler);
      process.removeListener('SIGTERM', exitHandler);
      process.removeListener('uncaughtException', exitHandler);
    };
  }

  /**
   * @v4 - Enable automatic retries for failed requests
   * This will override any retry configuration from the constructor
   * 
   * @param options - Retry options
   */
  enableRetries(options: {
    maxRetries?: number;
    retryDelay?: number;
    retryStatusCodes?: number[];
    useJitter?: boolean;
  }): void {
    // Validate options with Zod
    const validatedOptions = validateWithZod(retryOptionsSchema, options);
    
    // Remove existing retry interceptors
    const interceptors = this.client.interceptors.response as any;
    if (interceptors.handlers) {
      // Keep only the error handling interceptor (first one)
      // and remove any retry interceptors
      for (let i = interceptors.handlers.length - 1; i > 0; i--) {
        this.client.interceptors.response.eject(i);
      }
    }
    
    // Configure new retry logic
    this.configureRetryLogic({
      maxRetries: validatedOptions.maxRetries ?? 3,
      retryDelay: validatedOptions.retryDelay ?? 300,
      retryStatusCodes: validatedOptions.retryStatusCodes ?? [408, 429, 500, 502, 503, 504],
      useJitter: validatedOptions.useJitter
    });
    
    this.logger.debug('Retry configuration updated', validatedOptions);
  }

  /**
   * Set up metrics collection
   */
  private setupMetrics() {
    if (!this.options.metrics?.enabled) return;
    
    this.logger.debug('Request timing metrics enabled');
    
    // Add request interceptor to track timing
    this.client.interceptors.request.use((config) => {
      (config as any)._requestStartTime = Date.now();
      return config;
    });
    
    // Add response interceptor to calculate and store metrics
    this.client.interceptors.response.use(
      (response) => {
        this.recordMetrics(response);
        return response;
      },
      (error) => {
        this.recordMetrics(undefined, error);
        return Promise.reject(error);
      }
    );
  }
  
  /**
   * Record request metrics
   */
  private recordMetrics(response?: AxiosResponse, error?: AxiosError) {
    try {
      const config = response?.config || error?.config;
      if (!config) return;
      
      const startTime = (config as any)._requestStartTime || Date.now();
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      const metrics: RequestMetrics = {
        url: config.url || 'unknown',
        method: config.method?.toUpperCase() || 'unknown',
        startTime,
        endTime,
        duration,
        status: response?.status || error?.response?.status,
        success: !!response,
        error: error ? error.message : undefined
      };
      
      // Add to history, maintaining max size
      this.metricsHistory.unshift(metrics);
      if (this.options.metrics?.historySize) {
        this.metricsHistory = this.metricsHistory.slice(0, this.options.metrics.historySize);
      }
      
      // Log timing if enabled
      if (this.options.metrics?.logTimings) {
        this.logger.info(
          `${metrics.method} ${metrics.url} - ${metrics.duration}ms - ${metrics.success ? 'SUCCESS' : 'FAILED'}`,
          { status: metrics.status, error: metrics.error }
        );
      }
      
      // Call telemetry hook if provided
      if (this.options.metrics?.telemetryHook) {
        try {
          this.options.metrics.telemetryHook(metrics);
        } catch (hookError) {
          this.logger.error('Error in metrics telemetry hook', hookError);
        }
      }
    } catch (metricsError) {
      this.logger.error('Error recording metrics', metricsError);
    }
  }
  
  /**
   * Get performance metrics history
   * @returns Array of request metrics
   */
  getMetricsHistory(): RequestMetrics[] {
    return [...this.metricsHistory];
  }
  
  /**
   * Clear metrics history
   */
  clearMetricsHistory(): void {
    this.metricsHistory = [];
  }
  
  /**
   * Get performance statistics
   * @returns Performance statistics across all recorded requests
   */
  getPerformanceStats(): {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    averageDuration: number;
    minDuration: number;
    maxDuration: number;
    totalDuration: number;
  } {
    const metrics = this.metricsHistory;
    
    if (metrics.length === 0) {
      return {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        averageDuration: 0,
        minDuration: 0,
        maxDuration: 0,
        totalDuration: 0
      };
    }
    
    const successfulRequests = metrics.filter(m => m.success).length;
    const durations = metrics.map(m => m.duration);
    const totalDuration = durations.reduce((sum, duration) => sum + duration, 0);
    
    return {
      totalRequests: metrics.length,
      successfulRequests,
      failedRequests: metrics.length - successfulRequests,
      averageDuration: totalDuration / metrics.length,
      minDuration: Math.min(...durations),
      maxDuration: Math.max(...durations),
      totalDuration
    };
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

/**
 * Create a configured API client
 * 
 * @param secretKey - Your Trigger.dev secret key or environment variable name
 * @param options - Optional configuration for the client
 * 
 * @returns A configured TriggerAPI client instance
 * 
 * @example
 * ```typescript
 * // Default configuration using environment variable
 * const client = createTriggerClient();
 * 
 * // Custom secret key
 * const client = createTriggerClient('your-secret-key');
 * 
 * // Custom configuration
 * const client = createTriggerClient(process.env.TRIGGER_SECRET_KEY, {
 *   baseURL: 'https://your-trigger-instance.example.com/api/v3',
 *   timeout: 60000,
 *   logging: { enabled: true, level: 'debug' },
 *   retry: { maxRetries: 5, useJitter: true }
 * });
 * ```
 */
export const createTriggerClient = (
  secretKey: string = process.env.TRIGGER_SECRET_KEY || '', 
  options?: TriggerAPIOptions
): TriggerAPI => {
  if (!secretKey) {
    throw new ValidationError("API key is required. Please provide a valid Trigger.dev secret key.");
  }
  
  // Options will be validated in the TriggerAPI constructor
  return new TriggerAPI(secretKey, options);
};

// Define a simplified WebSocket interface for environments where it's not available
interface WebSocketLike {
  onopen: ((event: any) => void) | null;
  onclose: ((event: any) => void) | null;
  onmessage: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  close(): void;
  send(data: string): void;
}

/**
 * WebSocket message types
 */
interface WebSocketBaseMessage {
  type: string;
  version?: string;
}

interface WebSocketAuthMessage extends WebSocketBaseMessage {
  type: 'authenticate';
  payload: {
    apiKey: string;
  };
}

interface WebSocketPingMessage extends WebSocketBaseMessage {
  type: 'ping';
  payload: {
    timestamp: number;
  };
}

interface WebSocketPongMessage extends WebSocketBaseMessage {
  type: 'pong';
  payload: {
    timestamp: number;
  };
}

interface WebSocketSubscribeMessage extends WebSocketBaseMessage {
  type: 'subscribe';
  payload: {
    type: string;
    resourceId: string;
  };
}

interface WebSocketUnsubscribeMessage extends WebSocketBaseMessage {
  type: 'unsubscribe';
  payload: {
    type: string;
    resourceId: string;
  };
}

interface WebSocketAuthResponseMessage extends WebSocketBaseMessage {
  type: 'auth_response';
  success: boolean;
  error?: string;
}

interface WebSocketUpdateMessage extends WebSocketBaseMessage {
  type: 'update';
  resourceType: string;
  resourceId: string;
  payload: any;
}

type WebSocketOutgoingMessage = 
  | WebSocketAuthMessage
  | WebSocketPingMessage
  | WebSocketSubscribeMessage
  | WebSocketUnsubscribeMessage;

type WebSocketIncomingMessage = 
  | WebSocketPongMessage
  | WebSocketAuthResponseMessage
  | WebSocketUpdateMessage;

/**
 * WebSocket connection manager with reconnection logic
 */
class WebSocketManager {
  private ws: WebSocketLike | null = null;
  private url: string;
  private apiKey: string;
  private isConnecting: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private initialReconnectDelay: number = 1000;
  private maxReconnectDelay: number = 30000;
  private reconnectBackoffFactor: number = 1.5;
  private reconnectTimeoutId: NodeJS.Timeout | null = null;
  private messageHandlers: Map<string, (data: any) => void> = new Map();
  private logger: any;
  
  // Connection status
  private _isConnected: boolean = false;
  
  // Ping/heartbeat mechanism
  private pingIntervalId: NodeJS.Timeout | null = null;
  private pingIntervalMs: number = 30000; // 30 seconds
  private lastPongTime: number = 0;
  private pongTimeoutMs: number = 10000; // 10 seconds
  
  // Connection timeout
  private connectionTimeoutMs: number = 15000; // 15 seconds
  private connectionTimeoutId: NodeJS.Timeout | null = null;
  
  // Protocol version
  private protocolVersion: string = 'v1';
  
  // Store active subscriptions for reconnection
  private activeSubscriptions: Map<string, { type: string, resourceId: string, callback: (data: any) => void }> = new Map();
  
  constructor(url: string, apiKey: string, logger: any, options?: WebSocketManagerOptions) {
    this.url = url;
    this.apiKey = apiKey;
    this.logger = logger;
    
    // Validate options with Zod if provided
    if (options) {
      try {
        const validatedOptions = validateWithZod(webSocketManagerOptionsSchema, options);
        
        // Apply validated options
        this.pingIntervalMs = validatedOptions.pingInterval ?? this.pingIntervalMs;
        this.pongTimeoutMs = validatedOptions.pongTimeout ?? this.pongTimeoutMs;
        this.connectionTimeoutMs = validatedOptions.connectionTimeout ?? this.connectionTimeoutMs;
        this.maxReconnectAttempts = validatedOptions.maxReconnectAttempts ?? this.maxReconnectAttempts;
        this.initialReconnectDelay = validatedOptions.initialReconnectDelay ?? this.initialReconnectDelay;
        this.maxReconnectDelay = validatedOptions.maxReconnectDelay ?? this.maxReconnectDelay;
        this.reconnectBackoffFactor = validatedOptions.reconnectBackoffFactor ?? this.reconnectBackoffFactor;
      } catch (error) {
        if (logger) {
          logger.error('Invalid WebSocketManager options', error);
        } else {
          console.error('Invalid WebSocketManager options', error);
        }
        throw error;
      }
    }
  }
  
  /**
   * Get the current connection status
   */
  get isConnected(): boolean {
    return this._isConnected;
  }
  
  /**
   * Connect to the WebSocket server
   */
  public connect(): Promise<void> {
    if (this.isConnected || this.isConnecting) {
      return Promise.resolve();
    }
    
    this.isConnecting = true;
    
    return new Promise((resolve, reject) => {
      try {
        if (!isWebSocketAvailable()) {
          this.logger.warn('WebSocket is not available in this environment');
          reject(new Error('WebSocket is not available in this environment'));
          return;
        }
        
        this.logger.debug('Connecting to WebSocket', this.url);
        
        // Create WebSocket connection
        const ws = new WebSocket(this.url);
        this.ws = ws;
        
        // Set connection timeout
        this.setConnectionTimeout(reject);
        
        // Setup event handlers
        ws.onopen = (event) => {
          this.clearConnectionTimeout();
          this.logger.debug('WebSocket connection opened');
          this._isConnected = true;
          this.isConnecting = false;
          this.reconnectAttempts = 0;
          
          // Send authentication
          this.send({
            type: 'authenticate',
            version: this.protocolVersion,
            payload: { apiKey: this.apiKey }
          });
          
          // Start heartbeat
          this.startHeartbeat();
          
          // Restore subscriptions after reconnection
          this.restoreSubscriptions();
          
          resolve();
        };
        
        ws.onclose = (event) => {
          this.clearConnectionTimeout();
          this.stopHeartbeat();
          this.logger.debug('WebSocket connection closed', event);
          this._isConnected = false;
          this.isConnecting = false;
          
          // Attempt to reconnect
          this.reconnect();
        };
        
        ws.onerror = (event) => {
          this.logger.error('WebSocket error', event);
          this.isConnecting = false;
          
          if (!this._isConnected) {
            this.clearConnectionTimeout();
            reject(new Error('Failed to connect to WebSocket server'));
          }
        };
        
        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            this.handleMessage(data);
          } catch (error) {
            this.logger.error('Error parsing WebSocket message', error);
          }
        };
      } catch (error) {
        this.clearConnectionTimeout();
        this.isConnecting = false;
        this.logger.error('Error connecting to WebSocket', error);
        reject(error);
      }
    });
  }
  
  /**
   * Close the WebSocket connection
   */
  public disconnect(): void {
    this.clearConnectionTimeout();
    this.stopHeartbeat();
    
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }
    
    if (this.ws) {
      this.logger.debug('Closing WebSocket connection');
      this.ws.onclose = null; // Prevent auto-reconnect
      this.ws.close();
      this.ws = null;
    }
    
    this._isConnected = false;
    this.isConnecting = false;
    this.messageHandlers.clear();
  }
  
  /**
   * Send data over the WebSocket connection
   */
  public send(data: WebSocketOutgoingMessage): void {
    if (!this.isConnected || !this.ws) {
      this.logger.warn('Cannot send message: WebSocket not connected');
      return;
    }
    
    try {
      const message = JSON.stringify(data);
      this.ws.send(message);
    } catch (error) {
      this.logger.error('Error sending WebSocket message', error);
    }
  }
  
  /**
   * Subscribe to a specific event or resource
   */
  public subscribe(type: string, resourceId: string, callback: (data: any) => void): () => void {
    const subscriptionId = `${type}:${resourceId}`;
    
    // Register message handler
    this.messageHandlers.set(subscriptionId, callback);
    
    // Store subscription for reconnection
    this.activeSubscriptions.set(subscriptionId, { type, resourceId, callback });
    
    // Send subscription request
    this.connect().then(() => {
      this.send({
        type: 'subscribe',
        version: this.protocolVersion,
        payload: { type, resourceId }
      });
    }).catch(error => {
      this.logger.error('Failed to subscribe', { error, type, resourceId });
    });
    
    // Return unsubscribe function
    return () => {
      this.messageHandlers.delete(subscriptionId);
      this.activeSubscriptions.delete(subscriptionId);
      
      if (this.isConnected) {
        this.send({
          type: 'unsubscribe',
          version: this.protocolVersion,
          payload: { type, resourceId }
        });
      }
    };
  }
  
  /**
   * Set connection timeout
   */
  private setConnectionTimeout(rejectCallback: (reason?: any) => void): void {
    this.clearConnectionTimeout();
    
    this.connectionTimeoutId = setTimeout(() => {
      this.logger.warn(`WebSocket connection timeout after ${this.connectionTimeoutMs}ms`);
      
      if (this.ws) {
        this.ws.close();
        this.ws = null;
      }
      
      this._isConnected = false;
      this.isConnecting = false;
      this.connectionTimeoutId = null;
      
      rejectCallback(new Error('WebSocket connection timeout'));
    }, this.connectionTimeoutMs);
  }
  
  /**
   * Clear connection timeout
   */
  private clearConnectionTimeout(): void {
    if (this.connectionTimeoutId) {
      clearTimeout(this.connectionTimeoutId);
      this.connectionTimeoutId = null;
    }
  }
  
  /**
   * Start heartbeat mechanism
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.lastPongTime = Date.now();
    
    this.pingIntervalId = setInterval(() => {
      if (!this.isConnected) {
        this.stopHeartbeat();
        return;
      }
      
      // Check if we've received a pong within the timeout period
      const timeSinceLastPong = Date.now() - this.lastPongTime;
      if (timeSinceLastPong > this.pongTimeoutMs) {
        this.logger.warn(`No pong received for ${timeSinceLastPong}ms, reconnecting...`);
        this.reconnectNow();
        return;
      }
      
      // Send ping
      this.send({
        type: 'ping',
        version: this.protocolVersion,
        payload: { timestamp: Date.now() }
      });
    }, this.pingIntervalMs);
  }
  
  /**
   * Stop heartbeat mechanism
   */
  private stopHeartbeat(): void {
    if (this.pingIntervalId) {
      clearInterval(this.pingIntervalId);
      this.pingIntervalId = null;
    }
  }
  
  /**
   * Immediately reconnect (used when heartbeat fails)
   */
  private reconnectNow(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    this._isConnected = false;
    this.isConnecting = false;
    
    // Force reconnect
    this.reconnect();
  }
  
  /**
   * Restore active subscriptions after reconnection
   */
  private restoreSubscriptions(): void {
    if (!this.isConnected) return;
    
    this.logger.debug(`Restoring ${this.activeSubscriptions.size} subscriptions`);
    
    for (const [subscriptionId, { type, resourceId }] of this.activeSubscriptions.entries()) {
      this.send({
        type: 'subscribe',
        version: this.protocolVersion,
        payload: { type, resourceId }
      });
    }
  }
  
  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(data: any): void {
    if (!data || !data.type) return;
    
    // Handle pong response
    if (data.type === 'pong') {
      this.lastPongTime = Date.now();
      return;
    }
    
    // Handle authentication response
    if (data.type === 'auth_response') {
      if (data.success) {
        this.logger.debug('WebSocket authentication successful');
      } else {
        this.logger.error('WebSocket authentication failed', data.error);
        this.disconnect();
      }
      return;
    }
    
    // Handle resource updates
    if (data.type === 'update' && data.resourceType && data.resourceId) {
      const subscriptionId = `${data.resourceType}:${data.resourceId}`;
      const handler = this.messageHandlers.get(subscriptionId);
      
      if (handler) {
        try {
          handler(data.payload);
        } catch (error) {
          this.logger.error('Error in subscription handler', { 
            error, 
            subscriptionId,
            resourceType: data.resourceType, 
            resourceId: data.resourceId 
          });
        }
      }
    }
  }
  
  /**
   * Attempt to reconnect with exponential backoff
   */
  private reconnect(): void {
    if (this.isConnecting || this.reconnectTimeoutId) {
      return;
    }
    
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.logger.warn(`Maximum reconnection attempts (${this.maxReconnectAttempts}) reached`);
      return;
    }
    
    const delay = Math.min(
      this.initialReconnectDelay * Math.pow(this.reconnectBackoffFactor, this.reconnectAttempts),
      this.maxReconnectDelay
    );
    
    // Add jitter to prevent thundering herd problem
    const jitteredDelay = delay * (0.8 + Math.random() * 0.4);
    
    this.logger.debug(`Reconnecting in ${Math.round(jitteredDelay)}ms (attempt ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`);
    
    this.reconnectTimeoutId = setTimeout(() => {
      this.reconnectTimeoutId = null;
      this.reconnectAttempts++;
      this.connect().catch(() => {});
    }, jitteredDelay);
  }
}
