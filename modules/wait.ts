import { AxiosInstance, AxiosRequestConfig, CancelToken } from 'axios';
import { Logger } from '../types';

/**
 * Wait token status
 */
export enum WaitTokenStatus {
  WAITING = 'WAITING',
  COMPLETED = 'COMPLETED',
  TIMED_OUT = 'TIMED_OUT'
}

/**
 * Wait token create options
 */
export interface CreateWaitTokenOptions {
  /**
   * Optional timeout for the token (e.g. "10m", "1h", "1d")
   */
  timeout?: string;
  
  /**
   * Optional idempotency key to prevent duplicate tokens
   */
  idempotencyKey?: string;
  
  /**
   * Optional TTL for the idempotency key
   */
  idempotencyKeyTTL?: string;
  
  /**
   * Optional tags for the token
   */
  tags?: string[];
  
  /**
   * Optional metadata for the token
   */
  metadata?: Record<string, unknown>;
}

/**
 * Wait token details
 */
export interface WaitToken {
  /**
   * Unique identifier of the token
   */
  id: string;
  
  /**
   * Current status of the token
   */
  status: WaitTokenStatus;
  
  /**
   * When the token was created
   */
  createdAt: Date;
  
  /**
   * When the token was completed (if applicable)
   */
  completedAt?: Date;
  
  /**
   * When the token will time out (if applicable)
   */
  timeoutAt?: Date;
  
  /**
   * Idempotency key for the token (if provided)
   */
  idempotencyKey?: string;
  
  /**
   * When the idempotency key expires (if applicable)
   */
  idempotencyKeyExpiresAt?: Date;
  
  /**
   * Tags associated with the token
   */
  tags: string[];
  
  /**
   * Metadata associated with the token
   */
  metadata?: Record<string, unknown>;
}

/**
 * Retrieved wait token with output or error
 */
export interface RetrievedWaitToken<T = any> extends WaitToken {
  /**
   * Output data if the token was completed
   */
  output?: T;
  
  /**
   * Error details if the token timed out
   */
  error?: {
    message: string;
    name?: string;
    stack?: string;
  };
}

/**
 * Wait token list filter options
 */
export interface ListWaitTokensOptions {
  /**
   * Filter by token status
   */
  status?: WaitTokenStatus;
  
  /**
   * Filter by idempotency key
   */
  idempotencyKey?: string;
  
  /**
   * Filter by tags (AND condition)
   */
  tags?: string[];
  
  /**
   * Filter by time period (e.g. "24h", "7d")
   */
  period?: string;
  
  /**
   * Filter by start date
   */
  from?: Date;
  
  /**
   * Filter by end date
   */
  to?: Date;
  
  /**
   * Number of tokens per page
   */
  limit?: number;
  
  /**
   * Cursor for next page
   */
  cursor?: string;
}

/**
 * Pagination details
 */
export interface PaginationInfo {
  /**
   * Whether there are more items
   */
  hasMore: boolean;
  
  /**
   * Cursor for next page
   */
  cursor?: string;
}

/**
 * Paginated response
 */
export interface PaginatedResponse<T> {
  /**
   * Array of items
   */
  data: T[];
  
  /**
   * Pagination information
   */
  pagination: PaginationInfo;
}

/**
 * Wait token result
 */
export interface WaitTokenResult<T = any> {
  /**
   * Whether the token completed successfully
   */
  ok: boolean;
  
  /**
   * Output data if the token was completed
   */
  output?: T;
  
  /**
   * Error details if the token timed out
   */
  error?: Error;
}

/**
 * WaitAPI - Manages wait token operations
 */
export class WaitAPI {
  private client: AxiosInstance;
  private logger: Logger;
  
  constructor(client: AxiosInstance, logger: Logger) {
    this.client = client;
    this.logger = logger;
  }
  
  /**
   * Create a wait token
   * 
   * @param options - Token creation options
   * @param requestOptions - Request options
   * @returns - Created token details
   */
  async createToken(
    options?: CreateWaitTokenOptions,
    requestOptions?: {
      cancelToken?: CancelToken;
      requestConfig?: AxiosRequestConfig;
    }
  ): Promise<WaitToken> {
    this.logger.debug('Creating wait token', options);
    
    const response = await this.client.post('/wait/tokens', options, {
      cancelToken: requestOptions?.cancelToken,
      ...requestOptions?.requestConfig
    });
    
    return this.formatTokenResponse(response.data);
  }
  
  /**
   * Complete a wait token with data
   * 
   * @param token - Token ID or token object
   * @param data - Data to complete the token with
   * @param requestOptions - Request options
   * @returns - Completion result
   */
  async completeToken<T>(
    token: string | { id: string },
    data: T,
    requestOptions?: {
      cancelToken?: CancelToken;
      requestConfig?: AxiosRequestConfig;
    }
  ): Promise<{ success: true }> {
    const tokenId = typeof token === 'string' ? token : token.id;
    this.logger.debug('Completing wait token', { tokenId });
    
    const response = await this.client.post(`/wait/tokens/${tokenId}/complete`, { data }, {
      cancelToken: requestOptions?.cancelToken,
      ...requestOptions?.requestConfig
    });
    
    return response.data;
  }
  
  /**
   * Retrieve a wait token
   * 
   * @param token - Token ID or token object
   * @param requestOptions - Request options
   * @returns - Retrieved token with output or error
   */
  async retrieveToken<T = any>(
    token: string | { id: string },
    requestOptions?: {
      cancelToken?: CancelToken;
      requestConfig?: AxiosRequestConfig;
    }
  ): Promise<RetrievedWaitToken<T>> {
    const tokenId = typeof token === 'string' ? token : token.id;
    this.logger.debug('Retrieving wait token', { tokenId });
    
    const response = await this.client.get(`/wait/tokens/${tokenId}`, {
      cancelToken: requestOptions?.cancelToken,
      ...requestOptions?.requestConfig
    });
    
    return this.formatTokenResponse(response.data);
  }
  
  /**
   * List wait tokens with filtering options
   * 
   * @param options - List filter options
   * @param requestOptions - Request options
   * @returns - Paginated list of tokens
   */
  async listTokens(
    options?: ListWaitTokensOptions,
    requestOptions?: {
      cancelToken?: CancelToken;
      requestConfig?: AxiosRequestConfig;
    }
  ): Promise<PaginatedResponse<WaitToken>> {
    this.logger.debug('Listing wait tokens', options);
    
    const response = await this.client.get('/wait/tokens', {
      params: options,
      cancelToken: requestOptions?.cancelToken,
      ...requestOptions?.requestConfig
    });
    
    return {
      data: response.data.data.map((token: any) => this.formatTokenResponse(token)),
      pagination: response.data.pagination
    };
  }
  
  /**
   * Wait for a token to complete
   * 
   * @param token - Token ID or token object
   * @param options - Wait options
   * @returns - Wait result with output or error
   */
  async forToken<T = any>(
    token: string | { id: string },
    options?: {
      releaseConcurrency?: boolean;
      pollIntervalMs?: number;
      timeoutMs?: number;
      cancelToken?: CancelToken;
      requestConfig?: AxiosRequestConfig;
    }
  ): Promise<WaitTokenResult<T>> {
    const tokenId = typeof token === 'string' ? token : token.id;
    this.logger.debug('Waiting for token completion', { tokenId, options });
    
    const parent = (this.client as any).__parent;
    if (!parent || !parent.runs || !parent.runs.poll) {
      throw new Error('Unable to find poll method. Make sure the client is properly configured.');
    }
    
    // In a REST context, we need to poll the token until it completes
    const pollIntervalMs = options?.pollIntervalMs || 1000;
    const timeoutMs = options?.timeoutMs || 0; // 0 means no timeout
    const startTime = Date.now();
    
    // Polling function
    const poll = async (): Promise<WaitTokenResult<T>> => {
      // Check timeout
      if (timeoutMs > 0 && (Date.now() - startTime) > timeoutMs) {
        return { 
          ok: false, 
          error: new Error(`Polling timed out after ${timeoutMs}ms`)
        };
      }
      
      const token = await this.retrieveToken<T>(tokenId, {
        cancelToken: options?.cancelToken,
        requestConfig: options?.requestConfig
      });
      
      if (token.status === WaitTokenStatus.COMPLETED) {
        return { 
          ok: true,
          output: token.output as T
        };
      } else if (token.status === WaitTokenStatus.TIMED_OUT) {
        return { 
          ok: false,
          error: new Error(token.error?.message || 'Token timed out')
        };
      }
      
      // Token is still waiting, continue polling
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
      return poll();
    };
    
    return poll();
  }
  
  /**
   * Format token response to ensure date objects
   * @private
   */
  private formatTokenResponse<T>(token: any): RetrievedWaitToken<T> {
    return {
      ...token,
      createdAt: token.createdAt ? new Date(token.createdAt) : new Date(),
      completedAt: token.completedAt ? new Date(token.completedAt) : undefined,
      timeoutAt: token.timeoutAt ? new Date(token.timeoutAt) : undefined,
      idempotencyKeyExpiresAt: token.idempotencyKeyExpiresAt ? new Date(token.idempotencyKeyExpiresAt) : undefined
    };
  }
}

// Factory to create all wait-related functionality
export const createWait = (client: AxiosInstance, logger: Logger) => {
  const waitApi = new WaitAPI(client, logger);
  
  return {
    /**
     * Create a wait token
     */
    createToken: waitApi.createToken.bind(waitApi),
    
    /**
     * Complete a wait token
     */
    completeToken: waitApi.completeToken.bind(waitApi),
    
    /**
     * Retrieve a wait token
     */
    retrieveToken: waitApi.retrieveToken.bind(waitApi),
    
    /**
     * List wait tokens
     */
    listTokens: waitApi.listTokens.bind(waitApi),
    
    /**
     * Wait for a token to complete
     */
    forToken: waitApi.forToken.bind(waitApi)
  };
}; 