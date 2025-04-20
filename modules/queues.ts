import { AxiosInstance, AxiosResponse } from 'axios';
import { QueueParams } from '../schemas';
import { Logger, PaginatedResponse, QueueDetails } from '../types';
import { validateWithZod } from '../utils';
import { queueParamsSchema } from '../schemas';

/**
 * QueuesAPI - Manages task execution queues
 */
export class QueuesAPI {
  private client: AxiosInstance;
  private logger: Logger;
  
  constructor(client: AxiosInstance, logger: Logger) {
    this.client = client;
    this.logger = logger;
  }

  /**
   * List all queues
   * @param params - List parameters
   */
  async list(params?: {
    limit?: number;
    cursor?: string;
  }): Promise<PaginatedResponse<QueueDetails>> {
    this.logger.debug('Listing queues', params);
    
    return this.client.get('/queues', { params }).then((res: AxiosResponse) => res.data);
  }

  /**
   * Create a new queue
   * @param params - Queue parameters
   */
  async create(params: QueueParams): Promise<QueueDetails> {
    validateWithZod(queueParamsSchema, params);
    this.logger.debug('Creating queue', { name: params.name });
    
    return this.client.post('/queues', params).then((res: AxiosResponse) => res.data);
  }

  /**
   * Get details about a queue
   * @param queueId - The ID of the queue
   */
  async retrieve(queueId: string): Promise<QueueDetails> {
    if (!queueId) {
      throw new Error('Queue ID is required');
    }
    
    this.logger.debug('Retrieving queue', { id: queueId });
    
    return this.client.get(`/queues/${queueId}`).then((res: AxiosResponse) => res.data);
  }

  /**
   * Update a queue
   * @param queueId - The ID of the queue
   * @param params - Update parameters
   */
  async update(queueId: string, params: {
    concurrencyLimit?: number;
    description?: string;
  }): Promise<QueueDetails> {
    if (!queueId) {
      throw new Error('Queue ID is required');
    }
    
    this.logger.debug('Updating queue', { id: queueId, params });
    
    return this.client.put(`/queues/${queueId}`, params).then((res: AxiosResponse) => res.data);
  }

  /**
   * Delete a queue
   * @param queueId - The ID of the queue to delete
   */
  async delete(queueId: string): Promise<void> {
    if (!queueId) {
      throw new Error('Queue ID is required');
    }
    
    this.logger.debug('Deleting queue', { id: queueId });
    
    return this.client.delete(`/queues/${queueId}`).then(() => undefined);
  }
} 