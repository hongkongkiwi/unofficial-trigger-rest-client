import { AxiosInstance, AxiosRequestConfig, CancelToken } from 'axios';
import { BatchTriggerParams, TriggerTaskParams } from '../schemas';
import { Logger, RunDetails } from '../types';
import { validateWithZod } from '../utils';
import { triggerTaskParamsSchema, batchTriggerParamsSchema } from '../schemas';

/**
 * TasksAPI - Manages task-related operations
 */
export class TasksAPI {
  private client: AxiosInstance;
  private logger: Logger;
  
  constructor(client: AxiosInstance, logger: Logger) {
    this.client = client;
    this.logger = logger;
  }

  /**
   * Trigger a task
   * @param params - Task parameters
   * @param options - Request options
   * @returns {Promise<RunDetails>} - Run details
   */
  async trigger(params: TriggerTaskParams, options?: {
    cancelToken?: CancelToken,
    requestConfig?: AxiosRequestConfig
  }): Promise<RunDetails> {
    validateWithZod(triggerTaskParamsSchema, params);
    this.logger.debug('Triggering task:', params);
    
    const response = await this.client.post('/tasks/trigger', params, {
      cancelToken: options?.cancelToken,
      ...options?.requestConfig
    });
    return response.data;
  }

  /**
   * Trigger a task and poll until completion
   * 
   * @param params - Task parameters
   * @param options - Polling and request options
   * @returns {Promise<RunDetails>} - Completed run details
   */
  async triggerAndPoll(params: TriggerTaskParams, options?: {
    pollIntervalMs?: number,
    timeoutMs?: number,
    cancelToken?: CancelToken,
    requestConfig?: AxiosRequestConfig
  }): Promise<RunDetails> {
    // First trigger the task
    const run = await this.trigger(params, {
      cancelToken: options?.cancelToken,
      requestConfig: options?.requestConfig
    });
    
    this.logger.debug('Task triggered, starting polling', { runId: run.id });
    
    // Then poll until completion
    try {
      // We need to access the runs API, which should be available on the TriggerAPI instance
      // Get it through the client's parent reference
      // We first need to check if we can access the 'runs' property on the client's parent
      const parent = (this.client as any).__parent as { runs?: { poll: (runId: string, options?: any) => Promise<RunDetails> } };
      
      if (!parent || !parent.runs || !parent.runs.poll) {
        throw new Error('Unable to access runs.poll method. Make sure the client is properly configured.');
      }
      
      // Then poll for completion
      return await parent.runs.poll(run.id, {
        pollIntervalMs: options?.pollIntervalMs,
        timeoutMs: options?.timeoutMs,
        cancelToken: options?.cancelToken,
        requestConfig: options?.requestConfig
      });
    } catch (error) {
      this.logger.error('Error polling for task completion', { error, runId: run.id });
      throw error;
    }
  }

  /**
   * Batch trigger multiple tasks
   * @param params - Batch parameters
   * @param options - Request options
   * @returns {Promise<RunDetails[]>} - Array of run details
   */
  async batchTrigger(params: BatchTriggerParams, options?: { 
    cancelToken?: CancelToken,
    requestConfig?: AxiosRequestConfig
  }): Promise<RunDetails[]> {
    validateWithZod(batchTriggerParamsSchema, params);
    this.logger.debug('Batch triggering tasks:', params);
    
    const response = await this.client.post('/tasks/batch-trigger', params, {
      cancelToken: options?.cancelToken,
      ...options?.requestConfig
    });
    return response.data;
  }
  
  /**
   * Batch multiple task triggering requests into a single API call
   * 
   * This is helpful when you need to trigger many tasks in parallel
   * 
   * @param requests - Array of task parameters
   * @param options - Request options
   */
  async batchRequests(requests: TriggerTaskParams[], options?: { 
    cancelToken?: CancelToken,
    requestConfig?: AxiosRequestConfig
  }) {
    if (!Array.isArray(requests) || requests.length === 0) {
      throw new Error('Batch requests must be a non-empty array');
    }
    
    this.logger.debug('Batching requests', requests.length);
    return this.batchTrigger({ runs: requests }, options);
  }
} 