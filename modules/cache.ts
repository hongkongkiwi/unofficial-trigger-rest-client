import { AxiosInstance, AxiosResponse } from 'axios';
import { Logger } from '../types';

/**
 * CacheAPI - Manages cache operations (key-value store)
 */
export class CacheAPI {
  private client: AxiosInstance;
  private logger: Logger;
  
  constructor(client: AxiosInstance, logger: Logger) {
    this.client = client;
    this.logger = logger;
  }

  /**
   * Get a cached value
   * @param key - The cache key
   */
  async get(key: string): Promise<any> {
    this.validateKey(key);
    this.logger.debug('Getting cached value', { key });
    
    return this.client.get(`/cache/${key}`).then((res: AxiosResponse) => res.data);
  }

  /**
   * Set a cached value
   * @param key - The cache key
   * @param value - The value to cache
   * @param ttl - Time-to-live in seconds
   */
  async set(key: string, value: any, ttl?: number): Promise<any> {
    this.validateKey(key);
    this.logger.debug('Setting cached value', { key, ttl });
    
    return this.client.put(`/cache/${key}`, { value, ttl }).then((res: AxiosResponse) => res.data);
  }

  /**
   * Delete a cached value
   * @param key - The cache key to delete
   */
  async delete(key: string): Promise<void> {
    this.validateKey(key);
    this.logger.debug('Deleting cached value', { key });
    
    return this.client.delete(`/cache/${key}`).then(() => undefined);
  }

  /**
   * Validate cache key
   * @private
   */
  private validateKey(key: string): void {
    if (!key || typeof key !== 'string') {
      throw new Error('Cache key must be a non-empty string');
    }
  }
} 