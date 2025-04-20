import { AxiosInstance, AxiosResponse } from 'axios';
import { Logger } from '../types';

/**
 * MetadataAPI - Manages context metadata
 */
export class MetadataAPI {
  private client: AxiosInstance;
  private logger: Logger;
  
  constructor(client: AxiosInstance, logger: Logger) {
    this.client = client;
    this.logger = logger;
  }

  /**
   * Set metadata on the current context
   * @param key - Metadata key
   * @param value - Metadata value
   */
  async set(key: string, value: any): Promise<any> {
    this.validateKey(key);
    this.logger.debug('Setting metadata', { key });
    
    return this.client.put(`/metadata/${key}`, { value }).then((res: AxiosResponse) => res.data);
  }

  /**
   * Get metadata from the current context
   * @param key - Metadata key
   */
  async get(key: string): Promise<any> {
    this.validateKey(key);
    this.logger.debug('Getting metadata', { key });
    
    return this.client.get(`/metadata/${key}`).then((res: AxiosResponse) => res.data);
  }

  /**
   * Validate metadata key
   * @private
   */
  private validateKey(key: string): void {
    if (!key || typeof key !== 'string') {
      throw new Error('Metadata key must be a non-empty string');
    }
  }
} 