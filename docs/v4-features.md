# Trigger.dev v4 Improvements

This document outlines the v4 enhancements implemented in our unofficial Trigger.dev API client. This client provides a comprehensive interface for the Trigger.dev Management API, enabling you to leverage v4 features through a powerful and flexible client.

> **Note:** This document covers our unofficial client-side implementation that works with Trigger.dev's API. For information about all v4 features and task definition changes, see the [official Trigger.dev v4 upgrade guide](https://trigger.dev/docs/upgrade-to-v4).

## Key v4 API Client Capabilities

Our unofficial API client offers the following enterprise-grade features for working with Trigger.dev's v4 API:

### Real-time Updates via WebSockets

We've implemented a robust WebSocket system to enable real-time updates:

```typescript
// Subscribe to a specific run and process live updates
for await (const update of client.runs.subscribeToRun('run-123', { stopOnCompletion: true })) {
  console.log(`Run status: ${update.status}, Progress: ${update.progress || 0}%`);
  
  if (update.status === 'RUNNING') {
    // Take action while the run is in progress
    updateDashboard(update);
  }
  
  if (update.isCompleted) {
    if (update.status === 'COMPLETED') {
      notifySuccess(update);
    } else if (update.status === 'FAILED') {
      notifyFailure(update.error);
    }
  }
}

// Subscribe to all runs with specific tags
for await (const run of client.runs.subscribeToRunsWithTag(['production', 'critical'])) {
  console.log(`New run detected: ${run.id} for task ${run.taskId}`);
  logRunToMonitoring(run);
}

// Monitor batch progress in real-time
for await (const batch of client.runs.subscribeToBatch('batch-123')) {
  const progress = Math.round((batch.completedRuns / batch.totalRuns) * 100);
  updateProgressBar(progress);
  
  console.log(`Batch status: ${progress}% complete`);
  console.log(`- Completed: ${batch.completedRuns}/${batch.totalRuns}`);
  console.log(`- Failed: ${batch.failedRuns}`);
  console.log(`- Running: ${batch.runningRuns}`);
  
  if (batch.isCompleted) {
    showCompletionNotification(batch);
  }
}
```

### Advanced Run Management

Enhanced methods for run control with powerful monitoring capabilities:

```typescript
// Poll a run until completion with exponential backoff
const result = await client.runs.poll('run-123', {
  pollIntervalMs: 1000,             // Start polling every 1 second
  timeoutMs: 120000,                // Stop after 2 minutes
  backoff: {
    type: 'exponential',            // Increase interval exponentially
    maxInterval: 10000,             // Maximum 10 seconds between polls
    factor: 1.5                     // Multiply interval by this factor each attempt
  },
  onPoll: (run) => {                // Optional callback on each poll
    console.log(`Current status: ${run.status}, Progress: ${run.progress || 0}%`);
  }
});

// Execute a run and stream logs in real-time
const run = await client.tasks.trigger({
  taskId: 'process-large-file',
  payload: { fileId: '123' }
});

// Get stream data from a run
const stream = await client.runs.getStream(run.id, {
  streamType: 'logs',              // 'logs' or 'output'
  follow: true                     // Continue streaming as new data arrives
});

for await (const data of stream) {
  console.log(`[${data.timestamp}] ${data.message}`);
}

// Retry a failed run with modified parameters
const rerun = await client.runs.replay('failed-run-123', {
  modifyPayload: {
    retryCount: 3,
    forceReprocess: true
  }
});

// Cancel multiple runs at once
await client.runs.batchCancel({
  runIds: ['run-1', 'run-2', 'run-3'],
  reason: 'Deployment in progress'
});
```

### Powerful API Modules

Our client offers comprehensive access to Trigger.dev's v4 API modules:

#### Queues API

Manage task queues for controlled execution:

```typescript
// Create a queue with specific processing limits
const queue = await client.queues.create({
  name: "image-processing-queue",
  concurrencyLimit: 5,
  description: "Processes image uploads and transformations",
  tags: ["media", "processing"]
});

// List all queues with filtering
const { data: queues } = await client.queues.list({
  tags: ["media"],
  limit: 10
});

// Update queue configuration
await client.queues.update(queue.id, {
  concurrencyLimit: 10,               // Increase capacity
  description: "Updated description",
  tags: ["media", "processing", "high-priority"]
});

// Pause/resume queue processing
await client.queues.pause(queue.id);  // Pause queue
await client.queues.resume(queue.id); // Resume processing

// Delete a queue
await client.queues.delete(queue.id);
```

#### Cache API

Advanced key-value store with expiration support:

```typescript
// Store a complex object with 1 hour TTL
await client.cache.set(
  "user:profile:123", 
  { 
    name: "John Doe", 
    preferences: { theme: "dark", language: "en" },
    permissions: ["read", "write"],
    lastActive: new Date().toISOString()
  },
  3600  // TTL in seconds
);

// Retrieve the cached value
const userData = await client.cache.get("user:profile:123");

// Store multiple values atomically
await client.cache.setMany([
  { key: "config:api-key", value: "abc123", ttl: 86400 },
  { key: "config:endpoint", value: "https://api.example.com", ttl: 86400 }
]);

// Get multiple values in a single request
const results = await client.cache.getMany([
  "config:api-key", 
  "config:endpoint"
]);

// Check if a key exists without retrieving the value
const exists = await client.cache.has("user:profile:123");

// Delete a key
await client.cache.delete("user:profile:123");

// Delete multiple keys
await client.cache.deleteMany(["config:api-key", "config:endpoint"]);

// Set a key only if it doesn't exist (useful for locks)
const created = await client.cache.setIfNotExists("job:lock:123", { 
  worker: "worker-1",
  timestamp: Date.now()
}, 300);  // 5 minute lock
```

#### Batch API

Comprehensive batch operation management:

```typescript
// Get detailed information about a batch
const batchDetails = await client.batch.retrieve("batch-123");
console.log(`Batch Summary:
- Total Runs: ${batchDetails.totalRuns}
- Completed: ${batchDetails.completedRuns}
- Failed: ${batchDetails.failedRuns}
- Status: ${batchDetails.status}
- Created: ${new Date(batchDetails.createdAt).toLocaleString()}
`);

// List all runs in a batch
const { data: batchRuns } = await client.runs.list({
  batchId: "batch-123",
  limit: 100
});

// Cancel all pending runs in a batch
await client.batch.cancel("batch-123", {
  cancelPending: true,
  cancelRunning: false,
  reason: "Configuration error detected"
});

// Get batch statistics
const stats = await client.batch.getStatistics("batch-123");
console.log(`Execution Statistics:
- Average Duration: ${stats.averageDuration}ms
- Success Rate: ${stats.successRate * 100}%
- Failures by Error Type:`, stats.errorBreakdown);
```

#### AI Tools API

Integration with AI capabilities for creating workflow tools:

```typescript
// Create an AI tool from a task
const tool = await client.ai.createTool({
  taskId: "summarize-text",
  name: "summarize",
  description: "Summarize a long text into a concise version",
  parameters: {
    properties: {
      text: {
        type: "string",
        description: "The text to summarize"
      },
      maxLength: {
        type: "number",
        description: "Maximum length of the summary in characters"
      },
      format: {
        type: "string",
        enum: ["paragraph", "bullet-points"],
        description: "Format of the summary"
      }
    },
    required: ["text"]
  },
  displayOptions: {
    icon: "📝",
    color: "#3498db"
  }
});

// List all AI tools
const { data: tools } = await client.ai.listTools();

// Update an existing tool
await client.ai.updateTool(tool.id, {
  description: "Generate a concise summary of long-form content",
  parameters: {
    // Updated parameters
  }
});

// Delete a tool
await client.ai.deleteTool(tool.id);
```

#### Metadata API

Utilities for managing context metadata:

```typescript
// Set metadata values
await client.metadata.set("request-context", { 
  userId: "user-123",
  orgId: "org-456",
  permissions: ["admin", "editor"],
  source: "api"
});

// Get metadata by key
const context = await client.metadata.get("request-context");

// Check if a metadata key exists
const hasContext = await client.metadata.has("request-context");

// Delete metadata
await client.metadata.delete("request-context");

// Set metadata with auto-expiration
await client.metadata.set("user-session", {
  authenticated: true,
  lastActive: Date.now()
}, 3600);  // Expires in 1 hour
```

### Enhanced Scheduling Capabilities

Powerful scheduling options for resource optimization:

```typescript
// Create a schedule with advanced configuration
const schedule = await client.schedules.create({
  taskId: "generate-report",
  cron: "0 9 * * 1-5",             // Weekdays at 9am
  timezone: "America/New_York",
  payload: { 
    reportType: "daily-summary",
    includeMetrics: true
  },
  metadata: {
    owner: "finance-team",
    priority: "high",
    description: "Daily financial report generation"
  },
  machine: "medium-1x",            // Specify compute resources
  tags: ["scheduled", "report", "finance"],
  active: true                     // Enable immediately
});

// Update schedule with different compute resources based on needs
await client.schedules.update(schedule.id, {
  cron: "0 6 * * 1-5",             // Changed to 6am
  machine: "large-1x",             // Upgraded machine for faster processing
  payload: {
    reportType: "daily-summary",
    includeMetrics: true,
    includeForecast: true          // Added new feature
  }
});

// Deactivate during maintenance window
await client.schedules.deactivate(schedule.id);

// Reactivate when maintenance complete
await client.schedules.activate(schedule.id);

// List all schedules with filtering
const { data: financeSchedules } = await client.schedules.list({
  tags: ["finance"],
  active: true
});

// Delete a schedule
await client.schedules.delete(schedule.id);
```

### Enterprise Client Features

Our client includes several enterprise-grade features:

#### Configurable Retry Strategies

Advanced retry capabilities with custom strategies:

```typescript
// Create client with custom retry configuration
const client = createTriggerClient(process.env.TRIGGER_API_KEY, {
  retry: {
    maxRetries: 5,                  // Maximum number of retries
    retryDelay: 300,                // Base delay in ms
    retryStatusCodes: [408, 429, 500, 502, 503, 504],  // Status codes to retry
    useJitter: true,                // Add randomness to prevent thundering herd
    retryMultiplier: 2,             // Exponential backoff multiplier
    maxRetryDelay: 30000            // Maximum retry delay (30 seconds)
  }
});

// Update retry configuration dynamically
client.enableRetries({
  maxRetries: 3,
  retryDelay: 500,
  useJitter: true
});

// Configure per-request retry options
await client.runs.retrieve('run-123', {
  requestConfig: {
    // Request-specific retry configuration
    retry: {
      maxRetries: 10,
      retryDelay: 200
    }
  }
});
```

#### WebSocket Connection Management

Robust WebSocket handling for reliable realtime updates:

```typescript
// Configure WebSocket behavior
const client = createTriggerClient(process.env.TRIGGER_API_KEY, {
  websocketURL: 'wss://api.trigger.dev/api/v4/ws',
  websocketOptions: {
    reconnectIntervalMs: 1000,      // Reconnection attempt delay
    maxReconnectAttempts: 10,       // Maximum reconnection attempts
    connectionTimeout: 10000,       // Connection timeout
    pingIntervalMs: 30000,          // Keep-alive ping interval
    subscriptionBufferSize: 100     // Maximum subscription buffer
  }
});

// Manual WebSocket lifecycle management
// Dispose WebSocket connection when not needed
client.disposeWebSocket();

// Setup automatic cleanup when process exits
const removeHandlers = client.disposeOnExit();

// Later, if needed, remove the exit handlers
removeHandlers();
```

#### Resource Cleanup and Management

Proper resource management for production applications:

```typescript
// In server applications
const server = createServer();

// Setup API client
const client = createTriggerClient(process.env.TRIGGER_API_KEY);

// Register cleanup on server shutdown
function shutdownHandler() {
  console.log('Server shutting down, cleaning resources...');
  
  // Clean up WebSocket connections
  client.disposeWebSocket();
  
  // Close database connections, etc.
  // ...
  
  server.close(() => {
    console.log('Server shutdown complete');
    process.exit(0);
  });
}

// Register handlers for various shutdown signals
process.on('SIGTERM', shutdownHandler);
process.on('SIGINT', shutdownHandler);

// Or use the built-in helper
const cleanup = client.disposeOnExit();
```

## Advanced Features Unique to Our Client

Our unofficial client includes several powerful features not available in the official SDK:

### Multi-Environment Support

Seamlessly work with multiple Trigger.dev environments:

```typescript
// Create environment-specific clients
const devClient = createTriggerClient(process.env.DEV_API_KEY, {
  baseURL: 'https://dev-api.trigger.dev/api/v4',
  logging: { enabled: true, level: 'debug' }
});

const stagingClient = createTriggerClient(process.env.STAGING_API_KEY, {
  baseURL: 'https://staging-api.trigger.dev/api/v4',
  retry: { maxRetries: 5 }
});

const prodClient = createTriggerClient(process.env.PROD_API_KEY, {
  baseURL: 'https://api.trigger.dev/api/v4',
  metrics: { enabled: true }
});

// Execute tasks across environments
async function deployToEnvironments(payload) {
  // Start with development
  console.log('Deploying to development...');
  const devRun = await devClient.tasks.trigger({
    taskId: 'deploy-service',
    payload
  });
  
  // Wait for completion
  const devResult = await devClient.runs.poll(devRun.id);
  
  if (devResult.status === 'COMPLETED') {
    // Proceed to staging
    console.log('Deploying to staging...');
    const stagingRun = await stagingClient.tasks.trigger({
      taskId: 'deploy-service',
      payload
    });
    
    // Wait with real-time updates
    for await (const update of stagingClient.runs.subscribeToRun(stagingRun.id)) {
      console.log(`Staging: ${update.status} - ${update.progress || 0}%`);
      
      if (update.isCompleted && update.status === 'COMPLETED') {
        // Finally deploy to production
        console.log('Deploying to production...');
        const prodRun = await prodClient.tasks.trigger({
          taskId: 'deploy-service',
          payload,
          run: {
            tags: ['production', 'automated-deploy']
          }
        });
        
        console.log(`Production deployment started: ${prodRun.id}`);
      }
    }
  }
}
```

### Enterprise Metrics Collection

Comprehensive metrics for monitoring and performance analysis:

```typescript
// Configure detailed metrics collection
const client = createTriggerClient(process.env.TRIGGER_API_KEY, {
  metrics: {
    enabled: true,
    logTimings: true,                // Log timings to console
    historySize: 200,                // Store 200 most recent requests
    telemetryHook: (metrics) => {    // Custom telemetry handler
      // Send metrics to your observability platform
      sendToDatadog({
        metricName: `trigger.api.request`,
        value: metrics.duration,
        tags: [
          `method:${metrics.method}`,
          `endpoint:${normalizeEndpoint(metrics.url)}`,
          `status:${metrics.status || 'unknown'}`,
          `success:${metrics.success}`
        ]
      });
      
      // Alert on slow requests
      if (metrics.duration > 2000) {
        sendSlowRequestAlert(metrics);
      }
      
      // Log failed requests
      if (!metrics.success) {
        logAPIFailure(metrics);
      }
    }
  }
});

// Get performance metrics for analysis
function generatePerformanceReport() {
  // Get raw metrics history
  const history = client.getMetricsHistory();
  
  // Get aggregated statistics
  const stats = client.getPerformanceStats();
  
  // Calculate percentiles
  const durations = history.map(m => m.duration).sort((a, b) => a - b);
  const p50 = calculatePercentile(durations, 0.5);
  const p90 = calculatePercentile(durations, 0.9);
  const p95 = calculatePercentile(durations, 0.95);
  const p99 = calculatePercentile(durations, 0.99);
  
  return {
    totalRequests: stats.totalRequests,
    successRate: (stats.successfulRequests / stats.totalRequests) * 100,
    failureRate: (stats.failedRequests / stats.totalRequests) * 100,
    averageDuration: stats.averageDuration,
    medianDuration: p50,
    p90Duration: p90,
    p95Duration: p95,
    p99Duration: p99,
    slowestEndpoint: findSlowestEndpoint(history),
    mostErrorProneEndpoint: findMostErrorProneEndpoint(history)
  };
}

// Generate and email weekly performance report
schedule.weekly(() => {
  const report = generatePerformanceReport();
  emailPerformanceReport(report);
});
```

### Advanced Error Handling System

Specialized error classes for precise error handling:

```typescript
import { 
  TriggerAPIError,
  ValidationError, 
  AuthenticationError, 
  PermissionDeniedError,
  NotFoundError,
  RateLimitError,
  ServerError,
  BadRequestError,
  ConflictError,
  UnprocessableEntityError
} from '@your-org/trigger-rest-client';

async function executeTaskWithRetries(taskId, payload, options = {}) {
  const maxAttempts = options.maxAttempts || 3;
  let attempt = 0;
  
  while (attempt < maxAttempts) {
    try {
      attempt++;
      return await client.tasks.trigger({ taskId, payload });
      
    } catch (error) {
      // Handle different error types with specialized strategies
      if (error instanceof ValidationError) {
        console.error('Validation failed:', error.message);
        // Fix validation errors in payload
        payload = fixValidationIssues(payload, error);
        continue;
        
      } else if (error instanceof AuthenticationError) {
        console.error('Authentication failed:', error.message);
        // Refresh credentials and retry
        await refreshCredentials();
        continue;
        
      } else if (error instanceof RateLimitError) {
        const retryAfter = error.retryAfter || 60;
        console.log(`Rate limited, waiting ${retryAfter}s before retry`);
        
        // Wait for the retry-after period
        await sleep(retryAfter * 1000);
        continue;
        
      } else if (error instanceof PermissionDeniedError) {
        console.error('Permission denied:', error.message);
        // Escalate permissions if possible
        if (await requestElevatedPermissions()) {
          continue;
        }
        throw error; // Re-throw if we can't get permissions
        
      } else if (error instanceof NotFoundError) {
        console.error('Resource not found:', error.message);
        // Create missing resource if needed
        if (await createMissingResource(taskId)) {
          continue;
        }
        throw error;
        
      } else if (error instanceof ServerError) {
        // Only retry server errors if we have attempts left
        if (attempt < maxAttempts) {
          const backoffTime = Math.pow(2, attempt) * 1000;
          console.log(`Server error, retrying in ${backoffTime}ms`);
          await sleep(backoffTime);
          continue;
        }
        throw error;
        
      } else {
        // For other errors, just rethrow
        throw error;
      }
    }
  }
  
  throw new Error(`Failed after ${maxAttempts} attempts`);
}
```

### Request Cancellation System

Full control over in-flight requests:

```typescript
import { createCancellableRequest } from '@your-org/trigger-rest-client';

async function fetchLargeDatasetWithTimeout(timeoutMs = 10000) {
  // Create a cancellation token
  const { cancelToken, cancel } = createCancellableRequest();
  
  // Set up timeout cancellation
  const timeoutId = setTimeout(() => {
    cancel('Request took too long');
  }, timeoutMs);
  
  try {
    // Start potentially long-running request with cancel token
    const result = await client.runs.list(
      { limit: 1000, status: ['COMPLETED', 'FAILED'] },
      { cancelToken }
    );
    
    // Clear timeout since request completed successfully
    clearTimeout(timeoutId);
    
    return result;
    
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (axios.isCancel(error)) {
      console.log('Request was cancelled:', error.message);
      throw new Error(`Request cancelled: ${error.message}`);
    }
    
    throw error;
  }
}

// Example with user interface
function setupDataFetching() {
  const fetchButton = document.getElementById('fetch-data');
  const cancelButton = document.getElementById('cancel-fetch');
  const resultArea = document.getElementById('results');
  
  let activeCancel = null;
  
  fetchButton.addEventListener('click', async () => {
    fetchButton.disabled = true;
    cancelButton.disabled = false;
    resultArea.textContent = 'Loading...';
    
    const { cancelToken, cancel } = createCancellableRequest();
    activeCancel = cancel;
    
    try {
      const result = await client.runs.list(
        { limit: 500 },
        { cancelToken }
      );
      
      resultArea.textContent = `Loaded ${result.data.length} runs`;
      
    } catch (error) {
      if (axios.isCancel(error)) {
        resultArea.textContent = 'Request cancelled by user';
      } else {
        resultArea.textContent = `Error: ${error.message}`;
      }
    } finally {
      fetchButton.disabled = false;
      cancelButton.disabled = true;
      activeCancel = null;
    }
  });
  
  cancelButton.addEventListener('click', () => {
    if (activeCancel) {
      activeCancel('Cancelled by user');
    }
  });
}
```

## Advanced Error Context Enrichment

Add contextual information to your errors:

```typescript
const client = createTriggerClient(process.env.TRIGGER_API_KEY, {
  errorHook: (error) => {
    // Get current user information
    const user = getCurrentUser();
    
    // Get relevant application state
    const appState = {
      route: getCurrentRoute(),
      lastAction: getLastUserAction(),
      sessionDuration: getSessionDuration()
    };
    
    // Report with rich context
    errorReporter.captureException(error, {
      user,
      extra: {
        status: error.status,
        data: error.data,
        appState
      },
      tags: {
        errorType: error.name,
        component: 'trigger-api-client'
      }
    });
  }
});
```

### Custom Axios Instance Support

You can now provide your own pre-configured Axios instance to the client for advanced HTTP customization:

```typescript
import axios from 'axios';
import { createTriggerClient } from '@hongkongkiwi/trigger-rest-client';

// Create a custom Axios instance with advanced configuration
const customAxios = axios.create({
  // Your basic config here - the Trigger client will override some of these
});

// Add token refresh interceptor
customAxios.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    
    // Handle token expiration and refresh
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      
      try {
        // Get a new token
        const newToken = await refreshAuthToken();
        
        // Update the token in the original request
        originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
        
        // Retry the request with the new token
        return axios(originalRequest);
      } catch (refreshError) {
        return Promise.reject(refreshError);
      }
    }
    
    return Promise.reject(error);
  }
);

// Add custom request tracking
customAxios.interceptors.request.use((config) => {
  // Add correlation ID
  config.headers['X-Correlation-ID'] = generateCorrelationId();
  
  // Add application version
  config.headers['X-App-Version'] = process.env.APP_VERSION;
  
  // Track request in your monitoring system
  trackApiRequest({
    url: config.url,
    method: config.method,
    timestamp: new Date()
  });
  
  return config;
});

// Create client with the custom Axios instance
const client = createTriggerClient(process.env.TRIGGER_API_KEY, {
  axiosInstance: customAxios,
  // Other options...
});
```

This feature allows for:

1. **Auth Token Management**: Implement token refresh logic that works with your authentication system
2. **Custom Headers**: Add application-specific headers to every request
3. **Request/Response Transformations**: Transform request/response data consistently
4. **Corporate Proxies**: Configure proxy settings required in corporate environments
5. **Middleware Integration**: Reuse existing Axios middleware from your application

The client will use your custom instance while still applying critical configurations like:
- Setting the correct baseURL
- Adding the Trigger.dev authorization header
- Setting up error handling interceptors
- Configuring retry functionality

### Error Hooks Best Practices

1. **Graceful Fallbacks**: The error hook is wrapped in a try/catch, so any errors in your hook won't prevent the normal error flow.

2. **Be Selective**: Filter errors that don't need external reporting to reduce noise.

3. **Add Context**: Include relevant app/user context to make debugging easier.

4. **Consider Rate Limiting**: For high-frequency errors, implement rate limiting or sampling.

5. **Lazy Loading**: Consider lazy-loading your monitoring SDKs to avoid adding weight to your application.

## Conclusion

Our unofficial Trigger.dev client provides a comprehensive, production-ready implementation of the v4 API with additional enterprise features that go beyond the capabilities of the official client.

These enhancements make it particularly well-suited for:

- Working with multiple Trigger.dev environments simultaneously
- Enterprise applications requiring robust error handling
- Systems needing detailed performance monitoring and metrics
- Applications requiring granular control over resource management
- Production services with high reliability requirements

By leveraging our client, you get a powerful interface to Trigger.dev's v4 API with the additional benefits of our custom enhancements. 