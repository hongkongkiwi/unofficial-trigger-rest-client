# Trigger.dev Unofficial REST Client

A standalone unofficial API client for Trigger.dev v4 Management API that enables working with multiple Trigger.dev projects simultaneously.

## Overview

This client provides a flexible interface for the Trigger.dev Management API with features including:

- Multiple client instances with different API keys
- Automatic retries with exponential backoff
- WebSocket support for real-time updates
- Comprehensive error handling
- Detailed request metrics and logging
- Full TypeScript support with Zod schema validation

Unlike the official Trigger.dev client, this unofficial client was designed to support scenarios where you need to work with multiple Trigger.dev projects simultaneously, with distinct access keys per client.

For details on the v4 enhancements implemented in this client, see the [v4 Features document](./v4-features.md).

## Documentation

* [v4 Features](./v4-features.md) - Overview of v4 improvements in this client
* [Working with Wait Tokens](./examples/wait-token-api.md) - How to use our client with v4's wait token feature

## Key Advantages

Our unofficial client offers several unique features not available in the official SDK:

- **Multi-Project Support** - Work with multiple Trigger.dev projects simultaneously
- **Advanced Metrics** - Collect and analyze detailed request metrics with history
- **Enhanced Error Handling** - Specialized error classes with detailed information
- **Cancellable Requests** - Cancel in-progress API calls
- **WebSocket Reliability** - Robust WebSocket implementation with reconnection
- **Resource Management** - Automatic cleanup of connections and resources
- **Request Compression** - Automatic response compression for better performance
- **Schema Validation** - Client-side parameter validation with detailed errors

## Installation

```bash
npm install @your-org/trigger-rest-client
# or
yarn add @your-org/trigger-rest-client
```

## Basic Usage

```typescript
import { createTriggerClient } from '@your-org/trigger-rest-client';

// Create a client using env var (TRIGGER_SECRET_KEY)
const client = createTriggerClient();

// Or with explicit API key
const client = createTriggerClient('your-trigger-api-key');

// Trigger a task
const run = await client.tasks.trigger({
  taskId: 'your-task-id',
  payload: {
    // Your payload data
  }
});

console.log(`Run created with ID: ${run.id}`);
```

## Configuration

The client accepts various configuration options:

```typescript
const client = createTriggerClient('your-api-key', {
  // Base API URL (defaults to https://api.trigger.dev/api/v3)
  baseURL: 'https://your-trigger-instance.example.com/api/v3',
  
  // WebSocket URL for real-time updates
  websocketURL: 'wss://your-trigger-instance.example.com/api/v3/ws',
  
  // Request timeout in milliseconds
  timeout: 60000,
  
  // Logging configuration
  logging: {
    enabled: true,
    level: 'debug' // 'error' | 'warn' | 'info' | 'debug'
  },
  
  // Retry configuration
  retry: {
    maxRetries: 5,
    retryDelay: 300,
    retryStatusCodes: [408, 429, 500, 502, 503, 504],
    useJitter: true
  },
  
  // Response compression
  enableCompression: true,
  
  // Request metrics
  metrics: {
    enabled: true,
    logTimings: true,
    historySize: 100
  }
});
```

## API Overview

### Tasks API

```typescript
// Trigger a task
const run = await client.tasks.trigger({
  taskId: 'your-task-id',
  payload: { key: 'value' },
  run: {
    idempotencyKey: 'unique-key',
    tags: ['tag1', 'tag2'],
    machine: 'small-1x'
  }
});

// Batch trigger multiple tasks
const runs = await client.tasks.batchTrigger({
  runs: [
    { taskId: 'task-1', payload: { key: 'value1' } },
    { taskId: 'task-2', payload: { key: 'value2' } }
  ]
});

// Helper method for batch requests
const runs = await client.tasks.batchRequests([
  { taskId: 'task-1', payload: { key: 'value1' } },
  { taskId: 'task-2', payload: { key: 'value2' } }
]);
```

### Runs API

```typescript
// List runs
const { data: runs, pagination } = await client.runs.list({
  status: ['COMPLETED', 'FAILED'],
  limit: 10,
  tags: ['production']
});

// Get a specific run
const run = await client.runs.retrieve('run-id');

// Replay a run
const replayedRun = await client.runs.replay('run-id');

// Cancel a run
const canceled = await client.runs.cancel({ runId: 'run-id' });

// Poll a run until completion
const completedRun = await client.runs.poll('run-id', {
  pollIntervalMs: 2000,
  timeoutMs: 60000
});

// Subscribe to run updates via WebSocket
for await (const run of client.runs.subscribeToRun('run-id')) {
  console.log(`Run status: ${run.status}`);
  if (run.isCompleted) break;
}

// Subscribe to runs with a specific tag
for await (const run of client.runs.subscribeToRunsWithTag('production')) {
  console.log(`New run with tag 'production': ${run.id}`);
}

// Subscribe to batch updates
for await (const batch of client.runs.subscribeToBatch('batch-id')) {
  console.log(`Batch progress: ${batch.completedRuns}/${batch.totalRuns}`);
}
```

### Schedules API

```typescript
// List schedules
const schedules = await client.schedules.list();

// Create a schedule
const schedule = await client.schedules.create({
  taskId: 'your-task-id',
  cron: '0 9 * * 1-5', // Weekdays at 9am
  timezone: 'America/New_York',
  payload: { scheduled: true }
});

// Update a schedule
const updatedSchedule = await client.schedules.update('schedule-id', {
  cron: '0 10 * * 1-5', // Changed to 10am
});

// Activate/deactivate schedules
await client.schedules.activate('schedule-id');
await client.schedules.deactivate('schedule-id');

// Delete a schedule
await client.schedules.delete('schedule-id');
```

### Environment Variables API

```typescript
// List environment variables
const envVars = await client.envVars.list();

// Create an environment variable
const envVar = await client.envVars.create({
  key: 'API_KEY',
  value: 'secret-value',
  description: 'API key for service X'
});

// Import multiple environment variables
await client.envVars.import({
  environmentVariables: [
    { key: 'API_KEY', value: 'secret1' },
    { key: 'DATABASE_URL', value: 'postgres://...' }
  ]
});
```

### Queues, Cache, and Batch APIs

```typescript
// Queues
const queue = await client.queues.create({
  name: 'high-priority',
  concurrencyLimit: 5
});

// Cache (key-value store)
await client.cache.set('user:123', { name: 'John' }, 3600); // TTL in seconds
const userData = await client.cache.get('user:123');

// Batch operations
const batch = await client.batch.retrieve('batch-id');
await client.batch.cancel('batch-id');
```

## Error Handling

The client provides detailed error classes for different types of failures:

```typescript
import { 
  TriggerAPIError,
  ValidationError, 
  AuthenticationError, 
  NotFoundError,
  RateLimitError
} from '@your-org/trigger-rest-client';

try {
  await client.tasks.trigger({ /* ... */ });
} catch (error) {
  if (error instanceof AuthenticationError) {
    console.error('Authentication failed:', error.message);
  } else if (error instanceof NotFoundError) {
    console.error('Resource not found:', error.message);
  } else if (error instanceof RateLimitError) {
    console.error(`Rate limit exceeded, retry after ${error.retryAfter} seconds`);
  } else if (error instanceof ValidationError) {
    console.error('Invalid parameters:', error.message);
  } else if (error instanceof TriggerAPIError) {
    console.error(`API error (${error.status}):`, error.message);
  } else {
    console.error('Unknown error:', error);
  }
}
```

## Advanced Usage

### Custom Request Configuration

You can pass Axios request configuration to any API method:

```typescript
const run = await client.runs.retrieve('run-id', {
  requestConfig: {
    headers: { 'X-Custom-Header': 'value' },
    timeout: 60000
  }
});
```

### Cancellable Requests

```typescript
import { createCancellableRequest } from '@your-org/trigger-rest-client';

const { cancelToken, cancel } = createCancellableRequest();

// Start the request
const runsPromise = client.runs.list({}, { cancelToken });

// Cancel the request if needed
setTimeout(() => {
  cancel('Operation canceled by user');
}, 5000);

try {
  const result = await runsPromise;
} catch (error) {
  if (axios.isCancel(error)) {
    console.log('Request canceled:', error.message);
  }
}
```

### WebSocket Resource Cleanup

```typescript
// Set up automatic cleanup when process exits
const cleanup = client.disposeOnExit();

// Or manually dispose of WebSocket connections when done
client.disposeWebSocket();

// Remove exit handlers if needed
cleanup();
```

### Multiple Client Instances

One of the key advantages of our client is the ability to work with multiple Trigger.dev projects:

```typescript
// Create clients for different environments
const prodClient = createTriggerClient(process.env.PROD_API_KEY);
const stagingClient = createTriggerClient(process.env.STAGING_API_KEY);
const devClient = createTriggerClient(process.env.DEV_API_KEY);

// Use them independently
async function triggerAcrossEnvironments(payload) {
  // Trigger in dev first
  const devRun = await devClient.tasks.trigger({
    taskId: 'test-task',
    payload
  });
  
  // If successful, trigger in staging
  if (devRun.status === 'COMPLETED') {
    const stagingRun = await stagingClient.tasks.trigger({
      taskId: 'test-task',
      payload
    });
    
    // Monitor staging run
    for await (const update of stagingClient.runs.subscribeToRun(stagingRun.id)) {
      console.log(`Staging run status: ${update.status}`);
      if (update.status === 'COMPLETED') {
        // Finally trigger in production
        await prodClient.tasks.trigger({
          taskId: 'test-task',
          payload
        });
        break;
      }
    }
  }
}
```

### Request Metrics and Telemetry

```typescript
// Configure metrics collection
const client = createTriggerClient(process.env.TRIGGER_API_KEY, {
  metrics: {
    enabled: true,
    logTimings: true,
    historySize: 100,
    telemetryHook: (metrics) => {
      // Send to your monitoring system
      myMonitoringSystem.record({
        name: `trigger.${metrics.method}.${metrics.url}`,
        duration: metrics.duration,
        success: metrics.success
      });
    }
  }
});

// Later, get performance stats
const stats = client.getPerformanceStats();
console.log(`Average API call duration: ${stats.averageDuration}ms`);
console.log(`Success rate: ${(stats.successfulRequests / stats.totalRequests) * 100}%`);
console.log(`Total API calls: ${stats.totalRequests}`);
```

## Comparison with Official Client

This unofficial client differs from the official Trigger.dev client in several ways:

| Feature | Our Unofficial Client | Official Client |
|---------|------------------------|-----------------|
| **Multiple Projects** | ✅ Support for multiple client instances with different API keys | ❌ Single project per instance |
| **Framework Independence** | ✅ No dependencies on any specific framework | ❌ Tied to the Trigger.dev framework |
| **Metrics Collection** | ✅ Detailed request metrics and telemetry | ❌ Limited metrics |
| **WebSocket Support** | ✅ Full WebSocket support with reconnection | ❌ Limited WebSocket capabilities in v3 |
| **Request Cancellation** | ✅ Ability to cancel in-progress requests | ❌ No cancellation support |
| **Compression** | ✅ Configurable request/response compression | ❌ No compression options |
| **Resource Management** | ✅ Automatic cleanup of resources | ❌ Manual cleanup required |
| **Zod Validation** | ✅ Client-side schema validation | ❌ Limited client-side validation |
| **Error Classification** | ✅ Detailed error classes | ❌ Basic error handling |

## License

[MIT License](LICENSE)