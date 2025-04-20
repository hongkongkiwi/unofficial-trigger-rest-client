import { AxiosInstance, AxiosRequestConfig, AxiosResponse, CancelToken } from 'axios';
import { 
  ScheduleParams,
  scheduleParamsSchema
} from '../schemas';
import { Logger, PaginatedResponse, RunDetails, ScheduleDetails } from '../types';
import { validateWithZod } from '../utils';

/**
 * SchedulesAPI - Manages schedule-related operations
 */
export class SchedulesAPI {
  private client: AxiosInstance;
  private logger: Logger;
  
  constructor(client: AxiosInstance, logger: Logger) {
    this.client = client;
    this.logger = logger;
  }
  
  /**
   * Create a schedule
   * @param params - Schedule parameters
   * @param options - Request options
   */
  async create(params: ScheduleParams, options?: { 
    cancelToken?: CancelToken,
    requestConfig?: AxiosRequestConfig 
  }): Promise<ScheduleDetails> {
    validateWithZod(scheduleParamsSchema, params);
    this.logger.debug('Creating schedule', params);
    
    return this.client.post('/schedules', params, {
      cancelToken: options?.cancelToken,
      ...options?.requestConfig
    }).then((res: AxiosResponse) => res.data);
  }
  
  /**
   * List schedules with optional filters
   * @param params - List parameters
   * @param options - Request options
   */
  async list(params?: { 
    limit?: number;
    cursor?: string;
    taskId?: string;
    active?: boolean;
  }, options?: { 
    cancelToken?: CancelToken,
    requestConfig?: AxiosRequestConfig 
  }): Promise<PaginatedResponse<ScheduleDetails>> {
    this.logger.debug('Listing schedules', params);
    
    return this.client.get('/schedules', { 
      params,
      cancelToken: options?.cancelToken,
      ...options?.requestConfig
    }).then((res: AxiosResponse) => res.data);
  }
  
  /**
   * Retrieve a specific schedule
   * @param id - Schedule ID
   * @param options - Request options
   */
  async retrieve(id: string, options?: { 
    cancelToken?: CancelToken,
    requestConfig?: AxiosRequestConfig 
  }): Promise<ScheduleDetails> {
    this.validateParams({ id }, ['id']);
    this.logger.debug('Retrieving schedule', id);
    
    return this.client.get(`/schedules/${id}`, {
      cancelToken: options?.cancelToken,
      ...options?.requestConfig
    }).then((res: AxiosResponse) => res.data);
  }
  
  /**
   * Update a schedule
   * @param id - Schedule ID
   * @param params - Update parameters
   * @param options - Request options
   */
  async update(id: string, params: Partial<ScheduleParams>, options?: { 
    cancelToken?: CancelToken,
    requestConfig?: AxiosRequestConfig 
  }): Promise<ScheduleDetails> {
    this.validateParams({ id }, ['id']);
    this.logger.debug('Updating schedule', { id, params });
    
    return this.client.patch(`/schedules/${id}`, params, {
      cancelToken: options?.cancelToken,
      ...options?.requestConfig
    }).then((res: AxiosResponse) => res.data);
  }
  
  /**
   * Delete a schedule
   * @param id - Schedule ID
   * @param options - Request options
   */
  async delete(id: string, options?: { 
    cancelToken?: CancelToken,
    requestConfig?: AxiosRequestConfig 
  }): Promise<void> {
    this.validateParams({ id }, ['id']);
    this.logger.debug('Deleting schedule', id);
    
    return this.client.delete(`/schedules/${id}`, {
      cancelToken: options?.cancelToken,
      ...options?.requestConfig
    }).then(() => undefined);
  }

  /**
   * Trigger a schedule immediately
   * @param id - Schedule ID
   * @param options - Request options
   */
  async trigger(id: string, options?: { 
    cancelToken?: CancelToken,
    requestConfig?: AxiosRequestConfig 
  }): Promise<RunDetails> {
    this.validateParams({ id }, ['id']);
    this.logger.debug('Triggering schedule', id);
    
    return this.client.post(`/schedules/${id}/trigger`, undefined, {
      cancelToken: options?.cancelToken,
      ...options?.requestConfig
    }).then((res: AxiosResponse) => res.data);
  }

  /**
   * Validate parameters for required fields and custom validation
   * @private
   */
  private validateParams(
    params: unknown, 
    requiredFields: string[] = [], 
    customValidations?: Record<string, (val: unknown) => boolean>
  ) {
    if (!params || typeof params !== 'object') {
      throw new Error('Parameters must be an object');
    }
    
    const paramsObj = params as Record<string, unknown>;
    
    // Check required fields
    for (const field of requiredFields) {
      if (!(field in paramsObj) || paramsObj[field] === undefined || paramsObj[field] === null) {
        throw new Error(`Missing required parameter: ${field}`);
      }
    }
    
    // Run custom validations
    if (customValidations) {
      for (const [field, validator] of Object.entries(customValidations)) {
        if (field in paramsObj && !validator(paramsObj[field])) {
          throw new Error(`Invalid value for parameter: ${field}`);
        }
      }
    }
    
    return true;
  }
} 