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
  queueParamsSchema
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
  ServerError
} from './errors';
import { validateWithZod } from './utils';
import { triggerAPIOptionsSchema, retryOptionsSchema } from './schemas';
import { WebSocketManager } from './websocket';
import { z } from "zod";

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
     * @param options - Request options
     * @returns {Promise<RunDetails>} - Run details
     */
    trigger: async (params: TriggerTaskParams, options?: {
      cancelToken?: CancelToken,
      requestConfig?: AxiosRequestConfig
    }): Promise<RunDetails> => {
      validateWithZod(triggerTaskParamsSchema, params);
      this.logger.debug('Triggering task:', params);
      
      const response = await this.client.post('/tasks/trigger', params, {
        cancelToken: options?.cancelToken,
        ...options?.requestConfig
      });
      return response.data;
    },

    /**
     * Batch trigger multiple tasks
     * @param params - Batch parameters
     * @param options - Request options
     * @returns {Promise<RunDetails[]>} - Array of run details
     */
    batchTrigger: async (params: BatchTriggerParams, options?: { 
      cancelToken?: CancelToken,
      requestConfig?: AxiosRequestConfig
    }): Promise<RunDetails[]> => {
      validateWithZod(batchTriggerParamsSchema, params);
      this.logger.debug('Batch triggering tasks:', params);
      
      const response = await this.client.post('/tasks/batch-trigger', params, {
        cancelToken: options?.cancelToken,
        ...options?.requestConfig
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
    batchRequests: async (requests: TriggerTaskParams[], options?: { 
      cancelToken?: CancelToken,
      requestConfig?: AxiosRequestConfig
    }) => {
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
    list: async (params?: ListRunsParams, options?: { 
      cancelToken?: CancelToken,
      requestConfig?: AxiosRequestConfig 
    }): Promise<PaginatedResponse<RunDetails>> => {
      this.logger.debug('Listing runs', params);
      return this.client.get('/runs', { 
        params,
        cancelToken: options?.cancelToken,
        ...options?.requestConfig
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
    retrieve: async (runId: string, options?: { 
      cancelToken?: CancelToken,
      requestConfig?: AxiosRequestConfig 
    }): Promise<RunDetails> => {
      this.validateParams({ runId }, ['runId'], {
        runId: val => typeof val === 'string' && val.length > 0
      });
      
      this.logger.debug('Retrieving run', runId);
      return this.client.get(`/runs/${runId}`, {
        cancelToken: options?.cancelToken,
        ...options?.requestConfig
      }).then((res: AxiosResponse) => res.data);
    },

    /**
     * Replay a run
     * @param runId - The ID of the run to replay
     * @param options - Request options
     */
    replay: async (runId: string, options?: { 
      cancelToken?: CancelToken,
      requestConfig?: AxiosRequestConfig 
    }) => {
      this.validateParams({ runId }, ['runId'], {
        runId: val => typeof val === 'string' && val.length > 0
      });
      
      this.logger.debug('Replaying run', runId);
      return this.client.post(`/runs/${runId}/replay`, undefined, {
        cancelToken: options?.cancelToken,
        ...options?.requestConfig
      }).then((res: AxiosResponse) => res.data);
    },

    /**
     * Cancel a run
     * @param runId - The ID of the run to cancel
     * @param options - Request options
     * @returns {Promise<boolean>} - True if cancellation was successful
     */
    cancel: async (runId: string, options?: {
      cancelToken?: CancelToken,
      requestConfig?: AxiosRequestConfig
    }): Promise<boolean> => {
      this.validateParams({ runId }, ['runId'], {
        runId: val => typeof val === 'string' && val.length > 0
      });
      
      this.logger.debug('Cancelling run:', runId);
      
      const response = await this.client.post(`/runs/${runId}/cancel`, undefined, {
        cancelToken: options?.cancelToken,
        ...options?.requestConfig
      });
      return response.data;
    },

    /**
     * Reschedule a run
     * @param runId - The ID of the run to reschedule
     * @param params - Reschedule parameters
     * @param options - Request options
     */
    reschedule: async (runId: string, params: { delayUntil: string | Date }, options?: { 
      cancelToken?: CancelToken,
      requestConfig?: AxiosRequestConfig 
    }) => {
      this.validateParams({ runId, ...params }, ['runId', 'delayUntil']);
      
      this.logger.debug('Rescheduling run', { runId, params });
      return this.client.post(`/runs/${runId}/reschedule`, params, {
        cancelToken: options?.cancelToken,
        ...options?.requestConfig
      }).then((res: AxiosResponse) => res.data);
    },

    /**
     * Update run metadata
     * @param runId - The ID of the run
     * @param metadata - Metadata to update
     * @param options - Request options
     */
    updateMetadata: async (runId: string, metadata: Record<string, unknown>, options?: { 
      cancelToken?: CancelToken,
      requestConfig?: AxiosRequestConfig 
    }) => {
      this.validateParams({ runId }, ['runId'], {
        runId: val => typeof val === 'string' && val.length > 0
      });
      
      this.logger.debug('Updating run metadata', { runId, metadata });
      return this.client.put(`/runs/${runId}/metadata`, { metadata }, {
        cancelToken: options?.cancelToken,
        ...options?.requestConfig
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
      cancelToken?: CancelToken,
      requestConfig?: AxiosRequestConfig
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
          cancelToken: options?.cancelToken,
          ...options?.requestConfig
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
     * Create a schedule
     * @param params - Schedule parameters
     * @param options - Request options
     */
    create: async (params: CreateScheduleParams, options?: { 
      cancelToken?: CancelToken,
      requestConfig?: AxiosRequestConfig 
    }): Promise<ScheduleDetails> => {
      validateWithZod(createScheduleParamsSchema, params);
      this.logger.debug('Creating schedule', params);
      
      return this.client.post('/schedules', params, {
        cancelToken: options?.cancelToken,
        ...options?.requestConfig
      }).then((res: AxiosResponse) => res.data);
    },
    
    /**
     * List schedules with optional filters
     * @param params - List parameters
     * @param options - Request options
     */
    list: async (params?: ListSchedulesParams, options?: { 
      cancelToken?: CancelToken,
      requestConfig?: AxiosRequestConfig 
    }): Promise<PaginatedResponse<ScheduleDetails>> => {
      this.logger.debug('Listing schedules', params);
      
      return this.client.get('/schedules', { 
        params,
        cancelToken: options?.cancelToken,
        ...options?.requestConfig
      }).then((res: AxiosResponse) => res.data);
    },
    
    /**
     * Retrieve a specific schedule
     * @param id - Schedule ID
     * @param options - Request options
     */
    get: async (id: string, options?: { 
      cancelToken?: CancelToken,
      requestConfig?: AxiosRequestConfig 
    }): Promise<ScheduleDetails> => {
      this.validateParams({ id }, ['id']);
      this.logger.debug('Retrieving schedule', id);
      
      return this.client.get(`/schedules/${id}`, {
        cancelToken: options?.cancelToken,
        ...options?.requestConfig
      }).then((res: AxiosResponse) => res.data);
    },
    
    /**
     * Update a schedule
     * @param id - Schedule ID
     * @param params - Update parameters
     * @param options - Request options
     */
    update: async (id: string, params: UpdateScheduleParams, options?: { 
      cancelToken?: CancelToken,
      requestConfig?: AxiosRequestConfig 
    }): Promise<ScheduleDetails> => {
      this.validateParams({ id, ...params }, ['id']);
      validateWithZod(updateScheduleParamsSchema, params);
      this.logger.debug('Updating schedule', { id, params });
      
      return this.client.patch(`/schedules/${id}`, params, {
        cancelToken: options?.cancelToken,
        ...options?.requestConfig
      }).then((res: AxiosResponse) => res.data);
    },
    
    /**
     * Delete a schedule
     * @param id - Schedule ID
     * @param options - Request options
     */
    delete: async (id: string, options?: { 
      cancelToken?: CancelToken,
      requestConfig?: AxiosRequestConfig 
    }): Promise<void> => {
      this.validateParams({ id }, ['id']);
      this.logger.debug('Deleting schedule', id);
      
      return this.client.delete(`/schedules/${id}`, {
        cancelToken: options?.cancelToken,
        ...options?.requestConfig
      }).then(() => undefined);
    },

    /**
     * Trigger a schedule immediately
     * @param id - Schedule ID
     * @param options - Request options
     */
    trigger: async (id: string, options?: { 
      cancelToken?: CancelToken,
      requestConfig?: AxiosRequestConfig 
    }): Promise<RunDetails> => {
      this.validateParams({ id }, ['id']);
      this.logger.debug('Triggering schedule', id);
      
      return this.client.post(`/schedules/${id}/trigger`, undefined, {
        cancelToken: options?.cancelToken,
        ...options?.requestConfig
      }).then((res: AxiosResponse) => res.data);
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