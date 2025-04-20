import { AxiosInstance, AxiosResponse } from 'axios';
import { EnvVarParams } from '../schemas';
import { EnvVarDetails, Logger, PaginatedResponse } from '../types';
import { validateWithZod } from '../utils';
import { envVarParamsSchema } from '../schemas';

/**
 * EnvVarsAPI - Manages environment variables
 */
export class EnvVarsAPI {
  private client: AxiosInstance;
  private logger: Logger;
  
  constructor(client: AxiosInstance, logger: Logger) {
    this.client = client;
    this.logger = logger;
  }

  /**
   * List environment variables
   * @param params - List parameters
   */
  async list(params?: {
    limit?: number;
    cursor?: string;
  }): Promise<PaginatedResponse<EnvVarDetails>> {
    this.logger.debug('Listing environment variables', params);
    
    return this.client.get('/env-vars', { params }).then((res: AxiosResponse) => res.data);
  }

  /**
   * Import multiple environment variables
   * @param params - Import parameters
   */
  async import(params: {
    environmentVariables: Array<{
      key: string;
      value: string;
      description?: string;
    }>;
  }): Promise<any> {
    this.logger.debug('Importing environment variables', { count: params.environmentVariables.length });
    
    return this.client.post('/env-vars/import', params).then((res: AxiosResponse) => res.data);
  }

  /**
   * Create a new environment variable
   * @param params - Environment variable parameters
   */
  async create(params: EnvVarParams): Promise<EnvVarDetails> {
    validateWithZod(envVarParamsSchema, params);
    this.logger.debug('Creating environment variable', { key: params.key });
    
    return this.client.post('/env-vars', params).then((res: AxiosResponse) => res.data);
  }

  /**
   * Retrieve a specific environment variable
   * @param envVarId - The ID of the environment variable
   */
  async retrieve(envVarId: string): Promise<EnvVarDetails> {
    if (!envVarId) {
      throw new Error('Environment variable ID is required');
    }
    
    this.logger.debug('Retrieving environment variable', { id: envVarId });
    
    return this.client.get(`/env-vars/${envVarId}`).then((res: AxiosResponse) => res.data);
  }

  /**
   * Update an environment variable
   * @param envVarId - The ID of the environment variable
   * @param params - Update parameters
   */
  async update(envVarId: string, params: {
    value?: string;
    description?: string;
  }): Promise<EnvVarDetails> {
    if (!envVarId) {
      throw new Error('Environment variable ID is required');
    }
    
    this.logger.debug('Updating environment variable', { id: envVarId });
    
    return this.client.put(`/env-vars/${envVarId}`, params).then((res: AxiosResponse) => res.data);
  }

  /**
   * Delete an environment variable
   * @param envVarId - The ID of the environment variable to delete
   */
  async delete(envVarId: string): Promise<void> {
    if (!envVarId) {
      throw new Error('Environment variable ID is required');
    }
    
    this.logger.debug('Deleting environment variable', { id: envVarId });
    
    return this.client.delete(`/env-vars/${envVarId}`).then(() => undefined);
  }
} 