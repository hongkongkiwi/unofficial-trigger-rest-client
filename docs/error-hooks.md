# Error Hooks

## Overview

Error hooks provide a way to integrate external error monitoring and reporting systems with the Trigger.dev client without requiring direct dependencies on those systems. This allows for flexible error handling and enables forwarding errors to services like Sentry, Datadog, or custom logging systems.

## Configuration

Error hooks are configured as part of the client options:

```typescript
import { createTriggerClient, ApiError } from '@your-org/trigger-rest-client';
import * as Sentry from '@sentry/node'; // Example using Sentry

// Initialize your error reporting tool
Sentry.init({
  dsn: 'your-sentry-dsn',
  environment: process.env.NODE_ENV
});

// Create client with error hook
const client = createTriggerClient(process.env.TRIGGER_SECRET_KEY, {
  errorHook: (error: ApiError) => {
    // Forward error to Sentry with additional context
    Sentry.captureException(error, {
      extra: {
        status: error.status,
        data: error.data,
        originalError: error.originalError
      },
      tags: {
        errorType: error.name,
        endpoint: error.originalError?.config?.url
      }
    });
  }
});
```

## Error Hook Function

The error hook receives an `ApiError` object that contains comprehensive information about the error:

```typescript
type ErrorHook = (error: ApiError) => void;
```

The `ApiError` object includes:

- `name`: Error class name (e.g., 'AuthenticationError', 'RateLimitError')
- `message`: Human-readable error message
- `status`: HTTP status code (if applicable)
- `data`: Original response data from the API
- `originalError`: The underlying error (usually an AxiosError)

## Error Types

The error hook is called for all API errors, including:

- Network errors (no response received)
- Authentication errors (401)
- Permission errors (403)
- Resource not found errors (404)
- Rate limit errors (429)
- Server errors (500, 502, 503, 504)
- Validation errors
- And other API-specific errors

## Examples

### Integration with Sentry

```typescript
import { createTriggerClient } from '@your-org/trigger-rest-client';
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV
});

const client = createTriggerClient(process.env.TRIGGER_SECRET_KEY, {
  errorHook: (error) => {
    Sentry.captureException(error, {
      extra: {
        status: error.status,
        data: error.data
      },
      tags: {
        errorType: error.name,
        apiEndpoint: error.originalError?.config?.url?.split('?')[0] || 'unknown'
      }
    });
  }
});
```

### Custom Error Reporting

```typescript
const client = createTriggerClient(process.env.TRIGGER_SECRET_KEY, {
  errorHook: (error) => {
    // Send to custom error reporting system
    fetch('https://your-error-reporting-service.com/api/errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service: 'trigger-client',
        errorType: error.name,
        message: error.message,
        status: error.status,
        timestamp: new Date().toISOString(),
        data: error.data
      })
    }).catch(e => console.error('Failed to report error:', e));
  }
});
```

### Selective Error Filtering

You can selectively filter which errors to report:

```typescript
const client = createTriggerClient(process.env.TRIGGER_SECRET_KEY, {
  errorHook: (error) => {
    // Ignore 404 errors
    if (error.status === 404) return;
    
    // Only report server errors and rate limit errors to Slack
    if (error.status >= 500 || error.status === 429) {
      notifySlackChannel({
        channel: '#api-alerts',
        text: `⚠️ Trigger.dev API Error: ${error.name} - ${error.message}`,
        severity: error.status >= 500 ? 'high' : 'medium'
      });
    }
    
    // Report all errors to your monitoring system
    reportToMonitoring(error);
  }
});
```

### Error Aggregation and Batching

For high-traffic applications, you might want to aggregate errors before reporting:

```typescript
// Simple error aggregator
class ErrorAggregator {
  private errors = new Map<string, { count: number, lastError: ApiError }>();
  private flushInterval: NodeJS.Timeout;
  
  constructor(private reporter: (errors: any[]) => void, flushIntervalMs = 60000) {
    this.flushInterval = setInterval(() => this.flush(), flushIntervalMs);
  }
  
  addError(error: ApiError) {
    const key = `${error.name}:${error.status}:${error.originalError?.config?.url || 'unknown'}`;
    if (!this.errors.has(key)) {
      this.errors.set(key, { count: 0, lastError: error });
    }
    
    const entry = this.errors.get(key)!;
    entry.count++;
    entry.lastError = error;
  }
  
  flush() {
    if (this.errors.size === 0) return;
    
    const errorReport = Array.from(this.errors.entries()).map(([key, data]) => ({
      key,
      count: data.count,
      name: data.lastError.name,
      message: data.lastError.message,
      status: data.lastError.status,
      lastOccurred: new Date().toISOString()
    }));
    
    this.reporter(errorReport);
    this.errors.clear();
  }
  
  dispose() {
    clearInterval(this.flushInterval);
  }
}

// Usage with Trigger client
const errorAggregator = new ErrorAggregator(
  (errors) => sendToMonitoringSystem(errors)
);

const client = createTriggerClient(process.env.TRIGGER_SECRET_KEY, {
  errorHook: (error) => errorAggregator.addError(error)
});

// Clean up when done
process.on('exit', () => {
  errorAggregator.flush();
  errorAggregator.dispose();
});
```

## Best Practices

1. **Error Hook Safety**: The client ensures error hooks don't affect the main application flow by wrapping them in try/catch. Any errors in your hook will be logged but won't disrupt normal operation.

2. **Minimal Dependencies**: Design your error hooks to initialize external dependencies lazily to keep the client lightweight.

3. **Context Enrichment**: Add relevant context to reported errors like user information, request details, or environment.

4. **Error Sampling**: For high-volume applications, consider sampling errors to prevent overwhelming your monitoring system.

5. **Critical Error Alerting**: Set up different reporting paths for critical errors (like authentication failures) versus routine errors. 