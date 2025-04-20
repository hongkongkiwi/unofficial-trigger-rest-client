import axios, { AxiosInstance, AxiosRequestConfig, AxiosError } from 'axios';
import { TriggerAPI, createTriggerClient } from '../client';
import { randomUUID } from 'crypto';

/**
 * Example of creating a custom Axios instance for use with the Trigger.dev client
 * This demonstrates customization possibilities:
 * - Add request/response interceptors
 * - Configure timeouts and headers
 * - Add retry logic for specific error codes
 * - Implement authentication refresh
 */

/**
 * Create a configured Axios instance with custom interceptors and settings
 */
function createCustomAxiosInstance(options: {
  baseURL?: string;
  timeout?: number;
  headers?: Record<string, string>;
  authToken?: string;
}): AxiosInstance {
  // Default configuration
  const config: AxiosRequestConfig = {
    baseURL: options.baseURL || 'https://api.trigger.dev/api/v3',
    timeout: options.timeout || 30000,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...options.headers,
    },
  };

  // Create the Axios instance
  const axiosInstance = axios.create(config);

  // Add correlation ID to each request for tracing
  axiosInstance.interceptors.request.use((config) => {
    const correlationId = generateCorrelationId();
    config.headers = config.headers || {};
    config.headers['X-Correlation-ID'] = correlationId;
    
    // Log requests in development
    if (process.env.NODE_ENV === 'development') {
      console.log(`[API Request] ${config.method?.toUpperCase()} ${config.url}`);
    }
    
    return config;
  });

  // Handle responses and errors
  axiosInstance.interceptors.response.use(
    (response) => {
      // Log successful responses if needed
      if (process.env.NODE_ENV === 'development') {
        console.log(
          `[API Response] ${response.status} ${response.config.method?.toUpperCase()} ${response.config.url}`
        );
      }
      return response;
    },
    async (error: AxiosError) => {
      if (!error.config) {
        console.error('[API Error] No config in error object', error.message);
        return Promise.reject(error);
      }

      // Log error details
      console.error(
        `[API Error] ${error.response?.status || 'Network Error'} ${error.config.method?.toUpperCase()} ${error.config.url}: ${error.message}`,
        error.response?.data
      );

      // Handle authentication errors (401)
      if (error.response?.status === 401) {
        // Get a new token
        const newToken = await refreshAuthToken();
        
        // Update token in the original request and retry
        error.config.headers = error.config.headers || {};
        error.config.headers['Authorization'] = `Bearer ${newToken}`;
        
        // Retry the request with the new token
        return axiosInstance(error.config);
      }

      // Handle rate limiting (429) with exponential backoff
      if (error.response?.status === 429) {
        const retryAfter = error.response.headers['retry-after'];
        const delay = retryAfter ? parseInt(retryAfter, 10) * 1000 : 1000;
        
        console.log(`Rate limited. Retrying after ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
        
        // Retry the request
        return axiosInstance(error.config);
      }

      // For server errors (500+), implement automatic retry with backoff
      if (error.response?.status && error.response.status >= 500) {
        const retryCount = (error.config as any)._retryCount || 0;
        
        if (retryCount < 3) {
          (error.config as any)._retryCount = retryCount + 1;
          
          const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff
          console.log(`Server error. Retry ${retryCount + 1}/3 after ${delay}ms`);
          
          await new Promise(resolve => setTimeout(resolve, delay));
          return axiosInstance(error.config);
        }
      }

      return Promise.reject(error);
    }
  );

  return axiosInstance;
}

/**
 * Create a Trigger.dev client with our custom Axios instance
 */
function createCustomTriggerClient(apiKey: string): TriggerAPI {
  // Create our custom Axios instance
  const axiosInstance = createCustomAxiosInstance({
    timeout: 60000,
    headers: {
      'User-Agent': 'Custom-Trigger-Client/1.0',
      'X-Client-Version': '1.0.0',
    },
  });
  
  // Use it in the Trigger client
  const client = createTriggerClient(apiKey, {
    logging: { 
      enabled: true,
      level: "info" 
    },
    axiosInstance,
  });
  
  return client;
}

// Example usage
async function main() {
  const client = createCustomTriggerClient('trigger_dev_secret_key_here');

  try {
    // Use the client with our custom Axios instance
    const tasks = await client.tasks.list({ limit: 10 });
    console.log(`Found ${tasks.data.length} tasks`);
    
    // Get runs
    const runs = await client.runs.list({ 
      limit: 5,
      taskId: 'example-task-id'
    });
    console.log(`Found ${runs.data.length} runs`);
    
  } catch (error) {
    console.error('Error using Trigger client:', error);
  }
}

/**
 * Helper to generate correlation IDs for request tracing
 */
function generateCorrelationId(): string {
  return randomUUID();
}

/**
 * Mock function to simulate refreshing an auth token
 */
async function refreshAuthToken(): Promise<string> {
  console.log('Refreshing authentication token...');
  
  // In a real implementation, you would call your auth service
  // This is just a mock
  return 'new_mock_token_' + Date.now();
}

// Only run if executed directly
if (require.main === module) {
  main().catch(console.error);
}

// Export for use in other modules
export { createCustomAxiosInstance, createCustomTriggerClient }; 