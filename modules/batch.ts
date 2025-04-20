import { AxiosInstance, AxiosResponse, CancelToken, AxiosRequestConfig } from 'axios';
import { Logger, PaginatedResponse, RunDetails } from '../types';
import { BatchTriggerParams } from '../schemas';
import { validateWithZod } from '../utils';
import { batchTriggerParamsSchema } from '../schemas';

/**
 * BatchAPI - Manages batch operations
 */
export class BatchAPI {
  private client: AxiosInstance;
  private logger: Logger;
  
  constructor(client: AxiosInstance, logger: Logger) {
    this.client = client;
    this.logger = logger;
  }

  /**
   * List all batches
   * @param params - List parameters
   */
  async list(params?: {
    limit?: number;
    cursor?: string;
  }): Promise<PaginatedResponse<any>> {
    this.logger.debug('Listing batches', params);
    
    return this.client.get('/batches', { params }).then((res: AxiosResponse) => res.data);
  }

  /**
   * Get details about a batch
   * @param batchId - The ID of the batch
   */
  async retrieve(batchId: string): Promise<any> {
    if (!batchId) {
      throw new Error('Batch ID is required');
    }
    
    this.logger.debug('Retrieving batch', { batchId });
    
    return this.client.get(`/batches/${batchId}`).then((res: AxiosResponse) => res.data);
  }

  /**
   * Trigger a batch of tasks
   * @param params - Batch parameters
   * @param options - Request options
   * @returns {Promise<{ batchId: string, runs: RunDetails[] }>} - Batch details
   */
  async trigger(params: BatchTriggerParams, options?: { 
    cancelToken?: CancelToken,
    requestConfig?: AxiosRequestConfig
  }): Promise<{ batchId: string, runs: RunDetails[] }> {
    validateWithZod(batchTriggerParamsSchema, params);
    this.logger.debug('Triggering batch:', params);
    
    // Get the tasks API to use the batch trigger method
    const parent = (this.client as any).__parent;
    if (!parent || !parent.tasks) {
      throw new Error('Unable to access tasks API. Make sure the client is properly configured.');
    }
    
    // Use tasks.batchTrigger to trigger the batch
    const runs = await parent.tasks.batchTrigger(params, options);
    
    // Extract batch ID from the first run, if available
    const batchId = runs.length > 0 && runs[0].batchId ? runs[0].batchId : null;
    
    if (!batchId) {
      throw new Error('No batch ID was returned from the API');
    }
    
    return { batchId, runs };
  }
  
  /**
   * Trigger a batch and poll until all runs complete
   * @param params - Batch parameters
   * @param options - Polling and request options
   * @returns {Promise<RunDetails[]>} - Completed runs
   */
  async triggerAndPoll(params: BatchTriggerParams, options?: {
    pollIntervalMs?: number,
    timeoutMs?: number,
    cancelToken?: CancelToken,
    requestConfig?: AxiosRequestConfig
  }): Promise<RunDetails[]> {
    // First trigger the batch
    const { batchId, runs } = await this.trigger(params, {
      cancelToken: options?.cancelToken,
      requestConfig: options?.requestConfig
    });
    
    this.logger.debug('Batch triggered, starting polling', { batchId, runCount: runs.length });
    
    // Use the parent reference to get to the runs API
    const parent = (this.client as any).__parent;
    if (!parent || !parent.runs || !parent.runs.subscribeToBatch) {
      throw new Error('Unable to access runs.subscribeToBatch method. Make sure the client is properly configured.');
    }
    
    // Poll for completion using batch subscription
    try {
      const completedRuns: RunDetails[] = [];
      const batchSubscription = parent.runs.subscribeToBatch(batchId);
      
      let timeoutId: NodeJS.Timeout | null = null;
      if (options?.timeoutMs) {
        timeoutId = setTimeout(() => {
          batchSubscription.return?.();
          throw new Error(`Batch polling timed out after ${options.timeoutMs}ms`);
        }, options.timeoutMs);
      }
      
      try {
        // Use the async iterator from subscribeToBatch
        for await (const batchUpdate of batchSubscription) {
          if (batchUpdate.isCompleted) {
            // Get the final run details for all runs in the batch
            const finalRuns = await this.retrieve(batchId);
            return finalRuns.runs || [];
          }
        }
      } finally {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      }
      
      // Fallback if the iterator completes without getting completion status
      return await this.retrieve(batchId).then(batch => batch.runs || []);
    } catch (error) {
      this.logger.error('Error polling for batch completion', { error, batchId });
      throw error;
    }
  }

  /**
   * Cancel all runs in a batch
   * @param batchId - The ID of the batch
   */
  async cancel(batchId: string): Promise<any> {
    if (!batchId) {
      throw new Error('Batch ID is required');
    }
    
    this.logger.debug('Cancelling batch', { batchId });
    
    return this.client.post(`/batches/${batchId}/cancel`).then((res: AxiosResponse) => res.data);
  }
} 