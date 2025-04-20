import axios, { AxiosInstance, AxiosResponse, AxiosError } from 'axios';
import { TriggerAPIOptions, RequestMetrics, RetryOptions } from '../schemas';
import { Logger } from '../types';
import { validateWithZod } from '../utils';
import { triggerAPIOptionsSchema, retryOptionsSchema } from '../schemas';
import { WebSocketManager } from '../websocket';

// Import API modules
import { RunsAPI } from './runs';
import { TasksAPI } from './tasks';
import { SchedulesAPI } from './schedules';
import { CacheAPI } from './cache';
import { BatchAPI } from './batch';
import { EnvVarsAPI } from './envvars';
import { QueuesAPI } from './queues';
import { MetadataAPI } from './metadata';
import { AIAPI } from './ai';

// Import error classes for error handling
import {
  ApiError,
  BadRequestError,
  ValidationError,
  AuthenticationError,
  PermissionDeniedError,
  NotFoundError,
  ConflictError,
  UnprocessableEntityError,
  RateLimitError,
  InternalServerError,
  ServerError
} from '../errors';

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
    retryStrategy: 'exponential',
    retryInitialDelay: 300,
    retryMaxAttempts: 3,
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
    // Logger implementation
    return {} as Logger; // Simplified for this template
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
          let apiError: ApiError;
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
              apiError = new ApiError(
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
          const networkError = new ApiError(
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
   * Set up automatic retry with configurable options
   */
  private setupRetry(): void {
    const retryConfig = this.options.retry || DEFAULT_OPTIONS.retry!;
    const maxAttempts = retryConfig.retryMaxAttempts ?? 3;
    const initialDelay = retryConfig.retryInitialDelay ?? 300;
    const strategy = retryConfig.retryStrategy ?? 'exponential';
    const statusCodes = retryConfig.retryStatusCodes ?? [408, 429, 500, 502, 503, 504];
    const useJitter = retryConfig.useJitter ?? true;
    const multiplier = retryConfig.retryMultiplier ?? 2;
    
    // Add retry interceptor
    this.client.interceptors.response.use(undefined, async (error) => {
      if (!error.config) {
        return Promise.reject(error);
      }

      // Get retry attempt from config or initialize
      const retryAttempt = error.config.__retryAttempt || 0;
      
      // Check if we should retry
      if (
        retryAttempt >= maxAttempts ||
        !statusCodes.includes(error.response?.status || 0)
      ) {
        return Promise.reject(error);
      }

      // Calculate delay with exponential backoff or linear strategy
      let delay = initialDelay;
      if (strategy === 'exponential') {
        delay = delay * Math.pow(multiplier, retryAttempt);
      } else {
        // Linear strategy
        delay = delay * (retryAttempt + 1);
      }

      // Add jitter if enabled
      if (useJitter) {
        delay = delay * (0.5 + Math.random());
      }

      // Log retry attempt
      this.logger.debug(`Retrying request (attempt ${retryAttempt + 1}/${maxAttempts}) after ${delay}ms`);

      // Wait for delay
      await new Promise(resolve => setTimeout(resolve, delay));

      // Update retry attempt count
      error.config.__retryAttempt = retryAttempt + 1;

      // Retry request
      return this.client.request(error.config);
    });
  }

  /**
   * Set up metrics collection
   */
  private setupMetrics(): void {
    // Metrics setup implementation
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
    
    // Patch subscription methods to use the WebSocket manager
    const originalSubscribeToRun = this.runs.subscribeToRun;
    const originalSubscribeToRunsWithTag = this.runs.subscribeToRunsWithTag;
    const originalSubscribeToBatch = this.runs.subscribeToBatch;
    
    this.runs.subscribeToRun = function(this: RunsAPI, runId: string, options?: { stopOnCompletion?: boolean }) {
      return originalSubscribeToRun.call(this, runId, options, getWsManager());
    }.bind(this.runs);
    
    this.runs.subscribeToRunsWithTag = function(this: RunsAPI, tag: string | string[]) {
      return originalSubscribeToRunsWithTag.call(this, tag, getWsManager());
    }.bind(this.runs);
    
    this.runs.subscribeToBatch = function(this: RunsAPI, batchId: string) {
      return originalSubscribeToBatch.call(this, batchId, getWsManager());
    }.bind(this.runs);
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
   * Register cleanup handlers
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
   */
  enableRetries(options: RetryOptions): void {
    const validatedOptions = validateWithZod(retryOptionsSchema, options);
    // Implementation...
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
    // Implementation...
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
} 