import { AxiosInstance, AxiosRequestConfig, AxiosResponse, CancelToken } from 'axios';
import { ListRunsParams } from '../schemas';
import { Logger, PaginatedResponse, RunDetails } from '../types';
import { validateWithZod } from '../utils';

// Type definition for AsyncIterableStream
interface AsyncIterableStream<T> extends AsyncIterable<T> {
  close(): void;
}

/**
 * RunsAPI - Manages run-related operations
 */
export class RunsAPI {
  private client: AxiosInstance;
  private logger: Logger;
  
  constructor(client: AxiosInstance, logger: Logger) {
    this.client = client;
    this.logger = logger;
    
    // Bind methods that need to access 'this'
    this.poll = this.poll.bind(this);
    this.subscribeToRun = this.subscribeToRun.bind(this);
    this.subscribeToRunsWithTag = this.subscribeToRunsWithTag.bind(this);
    this.subscribeToBatch = this.subscribeToBatch.bind(this);
    this.listAll = this.listAll.bind(this);
  }
  
  /**
   * List runs with optional filters
   * @param params - List parameters
   * @param options - Request options
   */
  async list(params?: ListRunsParams, options?: { 
    cancelToken?: CancelToken,
    requestConfig?: AxiosRequestConfig 
  }): Promise<PaginatedResponse<RunDetails>> {
    this.logger.debug('Listing runs', params);
    return this.client.get('/runs', { 
      params,
      cancelToken: options?.cancelToken,
      ...options?.requestConfig
    }).then((res: AxiosResponse) => res.data);
  }

  /**
   * Automatically fetch all pages of runs matching the filters
   * @param params - List parameters (limit will be used per page)
   * @param options - Request options including page limit
   */
  async listAll(params?: ListRunsParams, options?: { 
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
      const response: PaginatedResponse<RunDetails> = await this.list(currentParams, {
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
  }

  /**
   * Retrieve a specific run
   * @param runId - The ID of the run
   * @param options - Request options
   */
  async retrieve(runId: string, options?: { 
    cancelToken?: CancelToken,
    requestConfig?: AxiosRequestConfig 
  }): Promise<RunDetails> {
    this.validateParams({ runId }, ['runId'], {
      runId: val => typeof val === 'string' && val.length > 0
    });
    
    this.logger.debug('Retrieving run', runId);
    return this.client.get(`/runs/${runId}`, {
      cancelToken: options?.cancelToken,
      ...options?.requestConfig
    }).then((res: AxiosResponse) => res.data);
  }

  /**
   * Replay a run
   * @param runId - The ID of the run to replay
   * @param options - Request options
   */
  async replay(runId: string, options?: { 
    cancelToken?: CancelToken,
    requestConfig?: AxiosRequestConfig 
  }) {
    this.validateParams({ runId }, ['runId'], {
      runId: val => typeof val === 'string' && val.length > 0
    });
    
    this.logger.debug('Replaying run', runId);
    return this.client.post(`/runs/${runId}/replay`, undefined, {
      cancelToken: options?.cancelToken,
      ...options?.requestConfig
    }).then((res: AxiosResponse) => res.data);
  }

  /**
   * Cancel a run
   * @param runId - The ID of the run to cancel
   * @param options - Request options
   * @returns {Promise<boolean>} - True if cancellation was successful
   */
  async cancel(runId: string, options?: {
    cancelToken?: CancelToken,
    requestConfig?: AxiosRequestConfig
  }): Promise<boolean> {
    this.validateParams({ runId }, ['runId'], {
      runId: val => typeof val === 'string' && val.length > 0
    });
    
    this.logger.debug('Cancelling run:', runId);
    
    const response = await this.client.post(`/runs/${runId}/cancel`, undefined, {
      cancelToken: options?.cancelToken,
      ...options?.requestConfig
    });
    return response.data;
  }

  /**
   * Reschedule a run
   * @param runId - The ID of the run to reschedule
   * @param params - Reschedule parameters
   * @param options - Request options
   */
  async reschedule(runId: string, params: { delayUntil: string | Date }, options?: { 
    cancelToken?: CancelToken,
    requestConfig?: AxiosRequestConfig 
  }) {
    this.validateParams({ runId, ...params }, ['runId', 'delayUntil']);
    
    this.logger.debug('Rescheduling run', { runId, params });
    return this.client.post(`/runs/${runId}/reschedule`, params, {
      cancelToken: options?.cancelToken,
      ...options?.requestConfig
    }).then((res: AxiosResponse) => res.data);
  }

  /**
   * Update run metadata
   * @param runId - The ID of the run
   * @param metadata - Metadata to update
   * @param options - Request options
   */
  async updateMetadata(runId: string, metadata: Record<string, unknown>, options?: { 
    cancelToken?: CancelToken,
    requestConfig?: AxiosRequestConfig 
  }) {
    this.validateParams({ runId }, ['runId'], {
      runId: val => typeof val === 'string' && val.length > 0
    });
    
    this.logger.debug('Updating run metadata', { runId, metadata });
    return this.client.put(`/runs/${runId}/metadata`, { metadata }, {
      cancelToken: options?.cancelToken,
      ...options?.requestConfig
    }).then((res: AxiosResponse) => res.data);
  }

  /**
   * @v4 - Poll a run until completion
   * @param runId - The ID of the run
   * @param options - Poll options
   */
  async poll(runId: string, options?: { 
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
  }

  /**
   * @v4 - Subscribe to run updates via WebSocket
   * @param runId - The ID of the run
   * @param options - Subscription options
   */
  async *subscribeToRun(runId: string, options?: { stopOnCompletion?: boolean }, wsManager?: any) {
    if (!wsManager) {
      throw new Error('WebSocketManager is required for subscription operations');
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
          unsubscribe = wsManager.subscribe('run', runId, (data: any) => {
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
  }

  /**
   * @v4 - Subscribe to runs with specific tags
   * @param tag - Tag or array of tags to filter runs
   */
  async *subscribeToRunsWithTag(tag: string | string[], wsManager?: any) {
    if (!wsManager) {
      throw new Error('WebSocketManager is required for subscription operations');
    }
    
    const tags = Array.isArray(tag) ? tag : [tag];
    
    try {
      // Create a promise that will resolve when we're done
      const done = new Promise<void>((resolve) => {
        const tagSubscriptions: (() => void)[] = [];
        
        // Subscribe to each tag
        for (const tagValue of tags) {
          try {
            const unsubscribe = wsManager.subscribe('tag', tagValue, (data: any) => {
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
  }

  /**
   * @v4 - Subscribe to runs in a batch
   * @param batchId - The batch ID
   */
  async *subscribeToBatch(batchId: string, wsManager?: any) {
    if (!wsManager) {
      throw new Error('WebSocketManager is required for subscription operations');
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
          unsubscribe = wsManager.subscribe('batch', batchId, (data: any) => {
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
  }

  /**
   * Validate required parameters and apply custom validations
   * @private
   */
  private validateParams(
    params: Record<string, any>, 
    requiredFields: string[] = [], 
    customValidations?: Record<string, (val: any) => boolean>
  ) {
    // Check for required fields
    for (const field of requiredFields) {
      if (params[field] === undefined || params[field] === null || params[field] === '') {
        throw new Error(`Required parameter ${field} is missing or empty`);
      }
    }
    
    // Apply custom validations if provided
    if (customValidations) {
      for (const [field, validator] of Object.entries(customValidations)) {
        if (params[field] !== undefined && !validator(params[field])) {
          throw new Error(`Invalid value for parameter ${field}`);
        }
      }
    }
    
    return true;
  }

  /**
   * @v4 - Fetch stream data from a run
   * 
   * @param runId - The ID of the run
   * @param streamKey - The key of the stream to fetch
   * @returns {Promise<AsyncIterableStream<T>>} - A stream that can be consumed with for-await-of
   */
  async fetchStream<T>(runId: string, streamKey: string): Promise<AsyncIterableStream<T>> {
    this.validateParams({ runId, streamKey }, ['runId', 'streamKey']);
    
    this.logger.debug('Fetching stream', { runId, streamKey });
    
    // Fetch the stream URL
    const response = await this.client.get(`/runs/${runId}/streams/${streamKey}`);
    const { url } = response.data;
    
    if (!url) {
      throw new Error(`No stream URL found for stream ${streamKey} on run ${runId}`);
    }
    
    // Create and return an async iterable that connects to the stream
    return this.createStreamIterable<T>(url);
  }
  
  /**
   * Creates an async iterable for consuming a stream
   * @private
   */
  private createStreamIterable<T>(url: string): AsyncIterableStream<T> {
    const logger = this.logger;
    
    // Create a custom async iterable
    const iterable: AsyncIterableStream<T> = {
      [Symbol.asyncIterator]() {
        let controller: AbortController | null = new AbortController();
        let finished = false;
        
        return {
          async next() {
            if (finished || !controller) {
              return { done: true, value: undefined };
            }
            
            try {
              // Fetch the next chunk from the stream
              const response = await fetch(url, {
                signal: controller.signal,
                headers: {
                  'Accept': 'application/json'
                }
              });
              
              if (!response.ok) {
                throw new Error(`Stream request failed with status ${response.status}`);
              }
              
              // Parse the response and return the next value
              const data = await response.json() as { done?: boolean; value?: T };
              
              // Check if this is the end of the stream
              if (data.done === true) {
                finished = true;
                return { done: true, value: undefined };
              }
              
              return { done: false, value: data.value as T };
            } catch (error) {
              logger.error('Error fetching from stream', error);
              finished = true;
              throw error;
            }
          },
          
          async return() {
            // Clean up resources when the iterator is terminated early
            if (controller) {
              controller.abort();
              controller = null;
            }
            finished = true;
            return { done: true, value: undefined };
          }
        };
      },
      
      // Method to close the stream early
      close() {
        const asyncIterator = this[Symbol.asyncIterator]();
        if (asyncIterator.return) {
          asyncIterator.return();
        }
      }
    };
    
    return iterable;
  }
} 