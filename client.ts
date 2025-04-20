import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, AxiosError, CancelToken } from 'axios';
import { 
  TriggerAPIOptions, 
  RequestMetrics,
  TriggerTaskParams,
  BatchTriggerParams,
  ListRunsParams,
  triggerTaskParamsSchema,
  batchTriggerParamsSchema,
  scheduleParamsSchema,
  envVarParamsSchema,
  queueParamsSchema,
  RetryOptions
} from './schemas';
import { 
  Logger,
  RunDetails,
  PaginatedResponse
} from './types';
import { 
  TriggerAPIError, 
  ValidationError, 
  AuthenticationError, 
  PermissionDeniedError,
  NotFoundError,
  RateLimitError,
  ServerError,
  BadRequestError,
  ConflictError,
  UnprocessableEntityError,
  InternalServerError
} from './errors';
import { validateWithZod } from './utils';
import { triggerAPIOptionsSchema, retryOptionsSchema } from './schemas';
import { WebSocketManager } from './websocket';
import { createWait } from './modules/wait';
import { z } from "zod";

// Import API modules
import { RunsAPI } from './modules/runs';
import { TasksAPI } from './modules/tasks';
import { SchedulesAPI } from './modules/schedules';
import { CacheAPI } from './modules/cache';
import { BatchAPI } from './modules/batch';
import { EnvVarsAPI } from './modules/envvars';
import { QueuesAPI } from './modules/queues';
import { MetadataAPI } from './modules/metadata';
import { AIAPI } from './modules/ai';

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
 * Add these type definitions before the TriggerClient class
 */
export type ScheduleDetails = {
  id: string;
  taskId: string;
  cron: string;
  timezone: string;
  payload?: Record<string, any>;
  metadata?: Record<string, any>;
  active: boolean;
  machine?: 'micro' | 'small-1x' | 'small-2x' | 'medium-1x' | 'medium-2x' | 'large-1x' | 'large-2x';
  tags?: string[];
  createdAt: string;
  updatedAt: string;
};

export type CreateScheduleParams = {
  taskId: string;
  cron: string;
  timezone?: string;
  payload?: Record<string, any>;
  metadata?: Record<string, any>;
  active?: boolean;
  machine?: 'micro' | 'small-1x' | 'small-2x' | 'medium-1x' | 'medium-2x' | 'large-1x' | 'large-2x';
  tags?: string[];
};

export type UpdateScheduleParams = {
  cron?: string;
  timezone?: string;
  payload?: Record<string, any>;
  metadata?: Record<string, any>;
  active?: boolean;
  machine?: 'micro' | 'small-1x' | 'small-2x' | 'medium-1x' | 'medium-2x' | 'large-1x' | 'large-2x';
  tags?: string[];
};

export type ListSchedulesParams = {
  limit?: number;
  cursor?: string;
  taskId?: string;
  active?: boolean;
};

/**
 * Add these schema definitions before the TriggerClient class
 */
export const createScheduleParamsSchema = z.object({
  taskId: z.string().min(1),
  cron: z.string().min(1),
  timezone: z.string().optional(),
  payload: z.record(z.any()).optional(),
  metadata: z.record(z.any()).optional(),
  active: z.boolean().optional(),
  machine: z.enum(['micro', 'small-1x', 'small-2x', 'medium-1x', 'medium-2x', 'large-1x', 'large-2x']).optional(),
  tags: z.array(z.string()).optional()
});

export const updateScheduleParamsSchema = z.object({
  cron: z.string().min(1).optional(),
  timezone: z.string().optional(),
  payload: z.record(z.any()).optional(),
  metadata: z.record(z.any()).optional(),
  active: z.boolean().optional(),
  machine: z.enum(['micro', 'small-1x', 'small-2x', 'medium-1x', 'medium-2x', 'large-1x', 'large-2x']).optional(),
  tags: z.array(z.string()).optional()
});

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

  // API modules
  public runs: RunsAPI;
  public tasks: TasksAPI;
  public schedules: SchedulesAPI;
  public cache: CacheAPI;
  public batch: BatchAPI;
  public envVars: EnvVarsAPI;
  public queues: QueuesAPI;
  public metadata: MetadataAPI;
  public ai: AIAPI;
  
  /**
   * Wait tokens API
   * @v4 - New API for managing wait tokens
   */
  public wait: ReturnType<typeof createWait>;

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
    
    // Set up logging
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
    
    // Use custom Axios instance if provided, otherwise create new one
    if (this.options.axiosInstance) {
      this.logger.debug('Using provided Axios instance');
      this.client = this.options.axiosInstance;
      
      // Update the base URL if it doesn't match
      if (this.client.defaults.baseURL !== this.baseURL) {
        this.client.defaults.baseURL = this.baseURL;
        this.logger.debug(`Updated Axios instance baseURL to ${this.baseURL}`);
      }
      
      // Ensure authorization headers are set
      this.client.defaults.headers.common['Authorization'] = `Bearer ${secretKey}`;
      this.client.defaults.headers.common['Content-Type'] = 'application/json';
      
      // Apply timeout if specified
      if (this.options.timeout) {
        this.client.defaults.timeout = this.options.timeout;
      }
    } else {
      // Create a new Axios instance with our configuration
    this.client = axios.create({
      baseURL: this.baseURL,
      headers,
      timeout: this.options.timeout,
    });
    }

    // Add a reference to this instance on the client for cross-module access
    (this.client as any).__parent = this;

    // Add response interceptor to handle errors
    this.setupErrorHandling();

    // Configure automatic retries if enabled
    this.setupRetry();
    
    // Set up metrics collection if enabled
    this.setupMetrics();

    // Initialize API modules
    this.runs = new RunsAPI(this.client, this.logger);
    this.tasks = new TasksAPI(this.client, this.logger);
    this.schedules = new SchedulesAPI(this.client, this.logger);
    this.cache = new CacheAPI(this.client, this.logger);
    this.batch = new BatchAPI(this.client, this.logger);
    this.envVars = new EnvVarsAPI(this.client, this.logger);
    this.queues = new QueuesAPI(this.client, this.logger);
    this.metadata = new MetadataAPI(this.client, this.logger);
    this.ai = new AIAPI(this.client, this.logger);
    
    // Initialize v4 modules
    this.wait = createWait(this.client, this.logger);
    
    // Setup WebSocket for subscription APIs
    this.setupWebSocket();
  }
  
  /**
   * Configuration method
   */
  configure(options: TriggerAPIOptions): TriggerAPI {
    // Apply configuration options
    if (options.baseURL) {
      this.setBaseURL(options.baseURL);
    }
    
    if (options.websocketURL) {
      this.setWebSocketURL(options.websocketURL);
    }
    
    if (options.timeout) {
      this.setTimeout(options.timeout);
    }
    
    if (options.logging) {
      // Configure logging
      // For now, we'll need to create a new logger
      this.logger = this.createLogger();
    }
    
    if (options.retry) {
      this.enableRetries(options.retry);
    }
    
    // Update options
    this.options = { ...this.options, ...options };
    
    // Return this for method chaining
    return this;
  }

  /**
   * Creates a configured logger based on options
   */
  private createLogger(): Logger {
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
  private setupErrorHandling(): void {
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
            case 400:
              apiError = new BadRequestError(
                `Bad request: ${errorMsg}`,
                data, 
                error
              );
              break;
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
            case 409:
              apiError = new ConflictError(
                `Conflict: ${errorMsg}`,
                data,
                error
              );
              break;
            case 422:
              apiError = new UnprocessableEntityError(
                `Unprocessable entity: ${errorMsg}`,
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
              apiError = new InternalServerError(
                `Server error: ${errorMsg}`,
                data,
                error
              );
              break;
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
          
          // Call the error hook if provided
          if (this.options.errorHook) {
            try {
              this.options.errorHook(apiError);
            } catch (hookError) {
              this.logger.error(`Error in errorHook: ${hookError}`);
            }
          }
          
          return Promise.reject(apiError);
        } else if (error.request) {
          const networkError = new TriggerAPIError(
            'Network error: No response received', 
            undefined, 
            undefined, 
            error
          );
          this.logger.error(`Network Error: ${error.message}`);
          
          // Call the error hook for network errors if provided
          if (this.options.errorHook) {
            try {
              this.options.errorHook(networkError);
            } catch (hookError) {
              this.logger.error(`Error in errorHook: ${hookError}`);
            }
          }
          
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
  private setupRetry(): void {
    const retryConfig = this.options.retry || DEFAULT_OPTIONS.retry!;
    this.configureRetryLogic({
      maxRetries: retryConfig.maxRetries!,
      retryDelay: retryConfig.retryDelay!,
      retryStatusCodes: retryConfig.retryStatusCodes!,
      useJitter: retryConfig.useJitter
    });
  }

  /**
   * Setup WebSocket connection for subscription APIs
   */
  private setupWebSocket(): void {
    // Don't initialize immediately, wait until needed
    this.wsManager = null;
    
    // Create wrapper methods to get WebSocket manager
    const getWsManager = () => {
      if (!this.wsManager) {
        this.wsManager = new WebSocketManager(
          this.websocketURL, 
          this.apiKey, 
          this.logger,
          this.options.websocketOptions
        );
      }
      return this.wsManager;
    };
    
    // Instead of replacing the methods, create proxy methods that use the original methods
    // This approach preserves the original methods and avoids prototype manipulation
    const runsAPI = this.runs;
    
    // Store original methods
    const originalSubscribeToRun = runsAPI.subscribeToRun;
    const originalSubscribeToRunsWithTag = runsAPI.subscribeToRunsWithTag;
    const originalSubscribeToBatch = runsAPI.subscribeToBatch;
    
    // Create a proxy object with the same methods but ensuring WebSocket manager is provided
    const wsProxy = {
      subscribeToRun: (runId: string, options?: { stopOnCompletion?: boolean }) => {
        return originalSubscribeToRun.call(runsAPI, runId, options, getWsManager());
      },
      
      subscribeToRunsWithTag: (tag: string | string[]) => {
        return originalSubscribeToRunsWithTag.call(runsAPI, tag, getWsManager());
      },
      
      subscribeToBatch: (batchId: string) => {
        return originalSubscribeToBatch.call(runsAPI, batchId, getWsManager());
      }
    };
    
    // Replace subscription methods with proxy methods
    // These are instance methods, not prototype methods, so they only affect this instance
    this.runs.subscribeToRun = wsProxy.subscribeToRun;
    this.runs.subscribeToRunsWithTag = wsProxy.subscribeToRunsWithTag;
    this.runs.subscribeToBatch = wsProxy.subscribeToBatch;
  }

  /**
   * Set up metrics collection
   */
  private setupMetrics(): void {
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
  private recordMetrics(response?: AxiosResponse, error?: AxiosError): void {
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
   * Helper to configure the API with a different base URL
   */
  setBaseURL(baseURL: string): void {
    this.client.defaults.baseURL = baseURL;
    this.baseURL = baseURL;
  }

  /**
   * Helper to set the WebSocket URL
   */
  setWebSocketURL(websocketURL: string): void {
    this.websocketURL = websocketURL;
    
    // Dispose existing WebSocket connection if there is one
    if (this.wsManager) {
      this.disposeWebSocket();
    }
  }

  /**
   * Helper to add custom headers to requests
   */
  setHeaders(headers: Record<string, string>): void {
    Object.entries(headers).forEach(([key, value]) => {
      this.client.defaults.headers.common[key] = value;
    });
  }

  /**
   * Set request timeout
   */
  setTimeout(timeoutMs: number): void {
    this.client.defaults.timeout = timeoutMs;
  }

  /**
   * Clean up WebSocket resources
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
   * Enable automatic retries for failed requests
   * This will override any retry configuration from the constructor
   * 
   * @param options - Retry options
   */
  enableRetries(options: RetryOptions): void {
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