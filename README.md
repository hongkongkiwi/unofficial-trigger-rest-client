# Trigger.dev Unofficial REST Client

A standalone, powerful API client for the Trigger.dev v4 Management API that enables working with multiple Trigger.dev projects simultaneously and provides advanced features for professional development workflows.

## Overview

This client provides a comprehensive interface for the Trigger.dev Management API with enterprise-grade features including:

- ✅ **Multiple Project Support** - Work with multiple Trigger.dev projects using different API keys
- ✅ **Automatic Retries** - Configurable retry policy with exponential backoff and jitter
- ✅ **Real-time Updates** - WebSocket support with reliable reconnection handling
- ✅ **Robust Error Handling** - Specialized error classes for precise error management
- ✅ **Error Hooks** - Forward errors to external monitoring systems like Sentry
- ✅ **Performance Monitoring** - Detailed request metrics, telemetry, and logging
- ✅ **TypeScript Integration** - Full TypeScript support with Zod schema validation
- ✅ **Resource Management** - Automatic cleanup of connections and resources
- ✅ **Request Optimization** - Automatic response compression and cancellable requests

Unlike the official Trigger.dev client, this unofficial client was specifically designed for scenarios where you need to interact with multiple Trigger.dev projects or environments (development, staging, production) simultaneously, with distinct access keys per client and you can create as many clients as you want.

I have tried to follow the official SDK public facing methods as much as possible however we are limited to documentation (so we used the v3 API documentation with additions of v4 features found in the SDK).

Since this is unofficial and trigger.dev is in active development it's likely this could break! But I'll update it later when the trigger.dev REST API docs for v4 are released.

## Documentation

* [v4 Features](./docs/v4-features.md) - Comprehensive overview of the v4 enhancements in this client
* [Wait Token API](./docs/wait-token-api.md) - Guide to using our client with v4's wait token feature
* [Error Hooks](./docs/error-hooks.md) - How to use error hooks for external monitoring systems
* [Examples](./examples/) - Practical code examples demonstrating client usage

## Installation

```bash
npm install @hongkongkiwi/trigger-rest-client
# or
yarn add @hongkongkiwi/trigger-rest-client
# or
pnpm add @hongkongkiwi/trigger-rest-client
```

## Quick Start

```typescript
import { createTriggerClient } from '@hongkongkiwi/trigger-rest-client';

// Create a client using env var (TRIGGER_SECRET_KEY)
const client = createTriggerClient();

// Trigger a task
async function runTask() {
  try {
    const run = await client.tasks.trigger({
      taskId: 'your-task-id',
      payload: {
        userName: 'John Doe',
        action: 'signup'
      }
    });
    
    console.log(`Run created with ID: ${run.id}`);
    
    // Poll until completion
    const result = await client.runs.poll(run.id);
    console.log(`Run completed with status: ${result.status}`);
    
  } catch (error) {
    console.error('Error executing task:', error);
  }
}

runTask();
```

## Configuration Options

The client offers extensive configuration options to adapt to your specific requirements:

```typescript
const client = createTriggerClient('your-api-key', {
  // Base API URL (defaults to https://api.trigger.dev/api/v3)
  baseURL: 'https://your-trigger-instance.example.com/api/v3',
  
  // WebSocket URL for real-time updates
  websocketURL: 'wss://your-trigger-instance.example.com/api/v3/ws',
  
  // Request timeout in milliseconds (default: 30000)
  timeout: 60000,
  
  // Logging configuration
  logging: {
    enabled: true,
    level: 'debug' // 'error' | 'warn' | 'info' | 'debug'
  },
  
  // Retry configuration
  retry: {
    maxRetries: 5,        // Maximum number of retry attempts
    retryDelay: 300,      // Base delay in ms between retries
    retryStatusCodes: [408, 429, 500, 502, 503, 504],
    useJitter: true       // Add randomness to prevent thundering herd
  },
  
  // Response compression
  enableCompression: true,
  
  // Request metrics
  metrics: {
    enabled: true,
    logTimings: true,     // Log timing information for requests
    historySize: 100      // Number of requests to keep in history
  },
  
  // WebSocket configuration
  websocketOptions: {
    reconnectIntervalMs: 1000,
    maxReconnectAttempts: 10,
    pingIntervalMs: 30000
  },
  
  // Error hook for external monitoring systems
  errorHook: (error) => {
    // Forward errors to external monitoring systems
    yourMonitoringSystem.captureException(error);
  },
  
  // Custom Axios instance
  axiosInstance: customAxios
});
```

### Using a Custom Axios Instance

You can provide your own pre-configured Axios instance to the client:

```typescript
import axios from 'axios';
import { createTriggerClient } from '@hongkongkiwi/trigger-rest-client';

// Create a custom Axios instance with your own middleware/interceptors
const customAxios = axios.create();

// Add your own request interceptors
customAxios.interceptors.request.use((config) => {
  // Add custom headers, authentication, etc.
  config.headers['X-Custom-Header'] = 'custom-value';
  return config;
});

// Add your own response interceptors
customAxios.interceptors.response.use((response) => {
  // Process response data
  return response;
});

// Create Trigger client with custom Axios instance
const client = createTriggerClient(process.env.TRIGGER_SECRET_KEY, {
  axiosInstance: customAxios
});

// The client will use your custom Axios instance
// but will still apply its own configuration for baseURL,
// authorization headers, and error handling
```

This is useful for:
- Using existing Axios middleware in your application
- Adding custom headers to all requests
- Integrating with authentication flows
- Adding your own logging or metrics

## API Reference

### Tasks API

The Tasks API allows you to trigger job execution and manage tasks:

```typescript
// Trigger a task with full options
const run = await client.tasks.trigger({
  taskId: 'your-task-id',
  payload: { 
    user: { id: 1234, email: 'user@example.com' },
    items: [1, 2, 3]
  },
  run: {
    idempotencyKey: 'order-processed-1234',  // Prevent duplicate runs
    tags: ['production', 'order-processing'],
    machine: 'small-1x',                     // Specify machine size
    context: { orderId: '1234' }             // Additional context
  }
});

// Execute multiple tasks in a single batch
const batchResult = await client.tasks.batchTrigger({
  runs: [
    { 
      taskId: 'send-welcome-email',
      payload: { user: 'user1@example.com' } 
    },
    { 
      taskId: 'provision-account',
      payload: { userId: 'user-1234' } 
    }
  ],
  options: {
    batchOptions: {
      concurrency: 2,            // Run up to 2 tasks concurrently
      retryMode: 'individual',   // Retry individual tasks on failure
      abortOnError: false        // Continue batch even if one task fails
    }
  }
});

// Convert array of tasks to batch request format
const requests = [
  { taskId: 'task-1', payload: { key: 'value1' } },
  { taskId: 'task-2', payload: { key: 'value2' } }
];

const batchedRuns = await client.tasks.batchRequests(requests);
```

### Runs API

The Runs API provides methods to query, monitor, and manage task executions:

```typescript
// List runs with filtering options
const { data: runs, pagination } = await client.runs.list({
  status: ['COMPLETED', 'FAILED'],
  taskId: 'your-task-id',
  tags: ['production'],
  limit: 25,
  cursor: 'next-page-cursor'
});

// Get details of a specific run
const run = await client.runs.retrieve('run-id');

// Replay a failed run
const replayedRun = await client.runs.replay('run-id', {
  modifyPayload: {
    retry: true,
    maxAttempts: 5
  }
});

// Cancel an in-progress run
await client.runs.cancel({ runId: 'run-id' });

// Poll a run until completion with timeout
const completedRun = await client.runs.poll('run-id', {
  pollIntervalMs: 2000,   // Check every 2 seconds
  timeoutMs: 60000,       // Timeout after 1 minute
  backoff: {
    type: 'exponential',  // Increase interval exponentially
    maxInterval: 10000    // Max 10s between polls
  }
});

// Real-time monitoring via WebSocket
// Subscribe to a specific run and get real-time updates
for await (const update of client.runs.subscribeToRun('run-id', { stopOnCompletion: true })) {
  console.log(`Run status: ${update.status}`);
  
  if (update.status === 'FAILED') {
    console.error(`Error: ${update.error?.message}`);
  }
  
  if (update.isCompleted) {
    console.log(`Run completed in ${update.duration}ms`);
  }
}

// Subscribe to all runs with specific tags
for await (const run of client.runs.subscribeToRunsWithTag(['production', 'critical'])) {
  console.log(`New run started: ${run.id} for task ${run.taskId}`);
  
  // Take action based on the run
  if (run.isHighPriority) {
    await notifyTeam(run);
  }
}

// Subscribe to batch progress updates
for await (const batch of client.runs.subscribeToBatch('batch-id')) {
  const progress = Math.round((batch.completedRuns / batch.totalRuns) * 100);
  console.log(`Batch progress: ${progress}% (${batch.completedRuns}/${batch.totalRuns})`);
  
  // Check for failed runs
  if (batch.failedRuns > 0) {
    console.warn(`${batch.failedRuns} runs failed in this batch`);
  }
  
  if (batch.isCompleted) {
    console.log('Batch processing complete!');
  }
}
```

### Schedules API

The Schedules API enables you to create and manage recurring tasks:

```typescript
// List all schedules
const { data: schedules } = await client.schedules.list();

// List schedules for a specific task
const taskSchedules = await client.schedules.list({
  taskId: 'your-task-id',
  active: true
});

// Create a schedule with cron expression
const schedule = await client.schedules.create({
  taskId: 'your-task-id',
  cron: '0 9 * * 1-5',        // Weekdays at 9am
  timezone: 'America/New_York',
  payload: { 
    scheduled: true,
    reportType: 'daily-summary' 
  },
  metadata: { 
    owner: 'finance-team',
    priority: 'high' 
  },
  machine: 'medium-1x',       // Specify machine size
  tags: ['scheduled', 'daily-report']
});

// Update an existing schedule
const updatedSchedule = await client.schedules.update('schedule-id', {
  cron: '0 10 * * 1-5',       // Changed to 10am
  active: true,               // Ensure it's active
  payload: {
    scheduled: true,
    reportType: 'daily-summary',
    includeMetrics: true      // Added new option
  }
});

// Activate or deactivate schedules
await client.schedules.activate('schedule-id');
await client.schedules.deactivate('schedule-id');

// Delete a schedule
await client.schedules.delete('schedule-id');
```

### Environment Variables API

The Environment Variables API allows you to manage configuration across environments:

```typescript
// List all environment variables
const { data: envVars } = await client.envVars.list();

// Create a new environment variable
const envVar = await client.envVars.create({
  key: 'API_KEY',
  value: 'secret-value',
  description: 'API key for external service'
});

// Update an existing environment variable
const updatedVar = await client.envVars.update('env-var-id', {
  value: 'new-secret-value'
});

// Bulk import environment variables (e.g., from .env file)
await client.envVars.import({
  environmentVariables: [
    { key: 'DATABASE_URL', value: 'postgres://user:pass@localhost:5432/db' },
    { key: 'REDIS_URL', value: 'redis://localhost:6379' },
    { key: 'API_KEY', value: 'my-api-key' }
  ],
  overwrite: true  // Replace existing variables with same key
});

// Delete an environment variable
await client.envVars.delete('env-var-id');
```

### Queues, Cache, and Batch APIs

```typescript
// === Queues API ===
// Create a new processing queue
const queue = await client.queues.create({
  name: 'high-priority-jobs',
  concurrencyLimit: 5,
  description: 'Queue for critical processing tasks'
});

// List existing queues
const { data: queues } = await client.queues.list();

// Update a queue's configuration
await client.queues.update('queue-id', {
  concurrencyLimit: 10,  // Increase concurrency
  description: 'Updated queue description'
});

// === Cache API ===
// Store a value in the cache
await client.cache.set(
  'user:profile:123', 
  { name: 'John Doe', preferences: { theme: 'dark' } },
  3600  // TTL in seconds (1 hour)
);

// Retrieve a cached value
const userData = await client.cache.get('user:profile:123');

// Delete a cache entry
await client.cache.delete('user:profile:123');

// === Batch API ===
// Get details of a batch operation
const batch = await client.batch.retrieve('batch-id');

// Cancel an in-progress batch
await client.batch.cancel('batch-id');
```

## Comprehensive Error Handling

The client provides specialized error classes for precise error handling:

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
} from '@hongkongkiwi/trigger-rest-client';

try {
  await client.tasks.trigger({ /* ... */ });
} catch (error) {
  if (error instanceof AuthenticationError) {
    console.error('Authentication failed. Check your API key:', error.message);
    // Handle auth error (e.g., prompt for new credentials)
    
  } else if (error instanceof NotFoundError) {
    console.error('Resource not found:', error.message);
    // Handle missing resource (e.g., create if needed)
    
  } else if (error instanceof RateLimitError) {
    const retryAfter = error.retryAfter || 60;
    console.error(`Rate limit exceeded, retry after ${retryAfter} seconds`);
    
    // Implement backoff strategy
    setTimeout(() => retryOperation(), retryAfter * 1000);
    
  } else if (error instanceof ValidationError) {
    console.error('Invalid parameters:', error.message);
    // Fix parameters and retry
    
  } else if (error instanceof PermissionDeniedError) {
    console.error('Permission denied:', error.message);
    // Handle permissions issue
    
  } else if (error instanceof ConflictError) {
    console.error('Conflict with existing resource:', error.message);
    // Handle conflict (e.g., update instead of create)
    
  } else if (error instanceof ServerError) {
    console.error(`Server error (${error.status}):`, error.message);
    // Handle server error (report to monitoring system)
    
  } else if (error instanceof TriggerAPIError) {
    // Generic API error handler
    console.error(`API error (${error.status}):`, error.message);
    
    // Access the raw error data if needed
    if (error.data) {
      console.error('Additional error details:', error.data);
    }
    
  } else {
    // Unknown error (not from the API client)
    console.error('Unexpected error:', error);
  }
}
```

## Advanced Usage Examples

### Custom Request Configuration

Customize individual requests with Axios options:

```typescript
// Add custom headers, timeout, etc. for a specific request
const run = await client.runs.retrieve('run-id', {
  requestConfig: {
    headers: { 
      'X-Custom-Header': 'value',
      'X-Request-ID': generateRequestId()
    },
    timeout: 60000,  // Override timeout just for this request
    responseType: 'json'
  }
});
```

### Cancellable Requests

Cancel long-running requests when needed:

```typescript
import { createCancellableRequest } from '@hongkongkiwi/trigger-rest-client';

// Create a cancellation token
const { cancelToken, cancel } = createCancellableRequest();

// User interface cancel button
const cancelButton = document.getElementById('cancel-button');
cancelButton.addEventListener('click', () => {
  cancel('Operation canceled by user');
});

// Start the potentially long-running request
try {
  const runsPromise = client.runs.list(
    { limit: 1000, status: ['RUNNING', 'WAITING'] },
    { cancelToken }
  );
  
  // Show loading indicator
  showLoadingSpinner();
  
  const result = await runsPromise;
  // Process results
  displayResults(result.data);
  
} catch (error) {
  if (axios.isCancel(error)) {
    console.log('Request canceled:', error.message);
    showCanceledMessage();
  } else {
    console.error('Error fetching runs:', error);
    showErrorMessage(error);
  }
} finally {
  hideLoadingSpinner();
}
```

### Resource Management

Ensure proper cleanup of WebSocket and other resources:

```typescript
// Set up automatic cleanup when process exits
const cleanup = client.disposeOnExit();

// For server applications that need long-term connections
const app = express();

app.get('/status', async (req, res) => {
  // Use the client for API calls
  const stats = await client.getPerformanceStats();
  res.json({ status: 'ok', stats });
});

// Clean up when the server shuts down
process.on('SIGTERM', () => {
  console.log('Server shutting down, cleaning up resources');
  client.disposeWebSocket();
  server.close();
});

// Or remove the automatic handlers if needed
cleanup();
```

### Multi-Environment Workflows

Work with multiple environments simultaneously:

```typescript
// Create clients for different environments
const devClient = createTriggerClient(process.env.DEV_API_KEY, {
  logging: { enabled: true, level: 'debug' }
});

const stagingClient = createTriggerClient(process.env.STAGING_API_KEY, {
  retry: { maxRetries: 5 }
});

const prodClient = createTriggerClient(process.env.PROD_API_KEY, {
  metrics: { enabled: true }
});

// Progressive deployment workflow across environments
async function progressiveDeployment(payload) {
  console.log('Starting deployment in development environment');
  
  // 1. Test in development first
  const devRun = await devClient.tasks.trigger({
    taskId: 'deployment-task',
    payload,
    run: { tags: ['deployment', 'automated'] }
  });
  
  // Wait for completion
  const devResult = await devClient.runs.poll(devRun.id);
  
  if (devResult.status !== 'COMPLETED') {
    throw new Error(`Development deployment failed: ${devResult.error?.message}`);
  }
  
  console.log('Development deployment successful, proceeding to staging');
  
  // 2. Deploy to staging
  const stagingRun = await stagingClient.tasks.trigger({
    taskId: 'deployment-task',
    payload,
    run: { tags: ['deployment', 'automated'] }
  });
  
  // Monitor staging deployment in real-time
  for await (const update of stagingClient.runs.subscribeToRun(stagingRun.id, { stopOnCompletion: true })) {
    console.log(`Staging deployment status: ${update.status} (${update.progress || 0}%)`);
    
    if (update.status === 'FAILED') {
      throw new Error(`Staging deployment failed: ${update.error?.message}`);
    }
    
    if (update.isCompleted) {
      console.log('Staging deployment successful, proceeding to production');
      
      // 3. Finally deploy to production with approval
      const approved = await getApproval('Deploy to production?');
      
      if (approved) {
        const prodRun = await prodClient.tasks.trigger({
          taskId: 'deployment-task',
          payload,
          run: { 
            tags: ['deployment', 'production', 'approved'],
            metadata: { approvedBy: getCurrentUser() }
          }
        });
        
        console.log(`Production deployment started: ${prodRun.id}`);
      }
    }
  }
}
```

### Performance Monitoring and Metrics

Track and analyze client performance:

```typescript
// Configure metrics collection with telemetry
const client = createTriggerClient(process.env.TRIGGER_API_KEY, {
  metrics: {
    enabled: true,
    logTimings: true,
    historySize: 100,
    telemetryHook: (metrics) => {
      // Send to monitoring systems like Datadog, New Relic, etc.
      monitoringClient.recordMetric({
        name: `trigger.api.${metrics.method.toLowerCase()}`,
        value: metrics.duration,
        tags: [
          `endpoint:${metrics.url.replace(/\/[0-9a-f-]+/g, '/:id')}`,
          `status:${metrics.status || 'unknown'}`,
          `success:${metrics.success}`
        ]
      });
      
      // Log slow requests for investigation
      if (metrics.duration > 1000) {
        logger.warn(`Slow API call: ${metrics.method} ${metrics.url} took ${metrics.duration}ms`);
      }
    }
  }
});

// Get current performance statistics
function reportClientPerformance() {
  const history = client.getMetricsHistory();
  const stats = client.getPerformanceStats();
  
  console.log(`=== Trigger.dev Client Performance ===`);
  console.log(`Total Requests: ${stats.totalRequests}`);
  console.log(`Success Rate: ${((stats.successfulRequests / stats.totalRequests) * 100).toFixed(2)}%`);
  console.log(`Average Duration: ${Math.round(stats.averageDuration)}ms`);
  console.log(`Min/Max Duration: ${stats.minDuration}ms / ${stats.maxDuration}ms`);
  
  // Calculate percentiles
  const sortedDurations = history.map(m => m.duration).sort((a, b) => a - b);
  const p95 = sortedDurations[Math.floor(sortedDurations.length * 0.95)];
  const p99 = sortedDurations[Math.floor(sortedDurations.length * 0.99)];
  
  console.log(`P95 Duration: ${p95}ms`);
  console.log(`P99 Duration: ${p99}ms`);
  
  // Endpoint performance breakdown
  const endpointStats = new Map();
  history.forEach(metric => {
    const key = `${metric.method} ${metric.url.replace(/\/[0-9a-f-]+/g, '/:id')}`;
    if (!endpointStats.has(key)) {
      endpointStats.set(key, { count: 0, totalDuration: 0, failures: 0 });
    }
    const stats = endpointStats.get(key);
    stats.count++;
    stats.totalDuration += metric.duration;
    if (!metric.success) stats.failures++;
  });
  
  console.log('\nEndpoint Performance:');
  endpointStats.forEach((stats, endpoint) => {
    console.log(`${endpoint}:`);
    console.log(`  Calls: ${stats.count}, Avg: ${Math.round(stats.totalDuration / stats.count)}ms, Failures: ${stats.failures}`);
  });
}

// Report performance every hour
setInterval(reportClientPerformance, 60 * 60 * 1000);
```

## License

[MIT License](LICENSE)