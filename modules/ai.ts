import { AxiosInstance, AxiosResponse } from 'axios';
import { Logger } from '../types';

/**
 * AIAPI - Manages AI-related operations
 */
export class AIAPI {
  private client: AxiosInstance;
  private logger: Logger;
  
  constructor(client: AxiosInstance, logger: Logger) {
    this.client = client;
    this.logger = logger;
  }

  /**
   * Create a tool from a task
   * @param params - Tool parameters
   */
  async createTool(params: {
    taskId: string;
    description: string;
    parameters: Record<string, any>;
  }): Promise<any> {
    if (!params.taskId) {
      throw new Error('Task ID is required');
    }
    
    if (!params.description) {
      throw new Error('Tool description is required');
    }
    
    this.logger.debug('Creating AI tool', { taskId: params.taskId });
    
    return this.client.post('/ai/tools', params).then((res: AxiosResponse) => res.data);
  }
} 