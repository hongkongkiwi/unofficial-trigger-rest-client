/**
 * Trigger.dev REST Client - Error Hooks Demo
 * This example demonstrates how to use error hooks to forward errors to external monitoring systems.
 */

import { createTriggerClient, TriggerAPIError } from '../index';
import { ApiError } from '../errors';

/**
 * Example: Simple mock of a Sentry-like error reporting system
 */
class MockErrorReporter {
  public reportedErrors: any[] = [];

  captureException(error: Error, context?: any) {
    console.log(`📡 [MOCK REPORTER] Capturing exception: ${error.name} - ${error.message}`);
    if (context) {
      console.log(`📋 Context:`, JSON.stringify(context, null, 2));
    }
    this.reportedErrors.push({ error, context, timestamp: new Date() });
    return true;
  }

  getReportedErrors() {
    return this.reportedErrors;
  }

  clearReportedErrors() {
    this.reportedErrors = [];
  }
}

// Create mock reporter instance
const errorReporter = new MockErrorReporter();

/**
 * Example 1: Basic error hook implementation
 */
async function demoBasicErrorHook() {
  console.log("\n🔍 DEMO: Basic Error Hook");
  console.log("=========================");

  const client = createTriggerClient('invalid-api-key', {
    // Configure error hook
    errorHook: (error: ApiError) => {
      errorReporter.captureException(error, {
        extra: {
          status: error.status,
          data: error.data
        },
        tags: {
          errorType: error.name
        }
      });
    }
  });

  try {
    // This will fail with an authentication error due to invalid API key
    console.log("🔄 Triggering API request with invalid API key...");
    await client.runs.list();
  } catch (error) {
    // Error is still thrown as usual
    console.log(`❌ Expected error caught: ${(error as Error).message}`);
  }

  // Check that error was reported
  console.log(`📊 Errors reported to monitoring system: ${errorReporter.reportedErrors.length}`);
}

/**
 * Example 2: Advanced error filtering and context enrichment
 */
async function demoAdvancedErrorHook() {
  console.log("\n🔍 DEMO: Advanced Error Hook with Filtering");
  console.log("==========================================");

  // Clear previous errors
  errorReporter.clearReportedErrors();

  // Mock user context
  const userContext = {
    userId: 'user-123',
    email: 'user@example.com',
    role: 'admin',
    environment: 'development'
  };

  // Store the error hook for later manual calling
  let errorHook: ((error: ApiError) => void) | undefined;

  const client = createTriggerClient('invalid-api-key', {
    // Advanced error hook with filtering
    errorHook: (error: ApiError) => {
      // Store reference to hook
      errorHook = (error: ApiError) => {
        // Skip 404 errors
        if (error.status === 404) {
          console.log("⏭️ Skipping 404 error (filtered)");
          return;
        }

        // Add different severity levels based on error type
        let severity = 'info';
        if (error.status === 401 || error.status === 403) {
          severity = 'warning'; // Auth issues
        } else if (error.status === 429) {
          severity = 'warning'; // Rate limiting
        } else if (error.status && error.status >= 500) {
          severity = 'error';   // Server errors
        }

        // Enrich error with user context and severity
        errorReporter.captureException(error, {
          extra: {
            status: error.status,
            data: error.data
          },
          tags: {
            errorType: error.name,
            severity
          },
          user: userContext
        });
      };
      
      // Call the hook with the current error
      errorHook(error);
    }
  });

  // Demo 401 error (should be reported)
  try {
    console.log("🔄 Triggering API request with invalid API key...");
    await client.runs.retrieve('some-id');
  } catch (error) {
    console.log(`❌ Expected authentication error caught: ${(error as Error).message}`);
  }

  // Demo 404 error (should be filtered out)
  try {
    // Mock a 404 response
    console.log("🔄 Simulating a 404 error (should be filtered out)...");
    throw new TriggerAPIError("Resource not found", 404, { error: "not_found" });
  } catch (error) {
    if (error instanceof TriggerAPIError && errorHook) {
      // Manually call the error hook for demo purposes
      errorHook(error);
    }
    console.log(`❌ Expected 404 error caught: ${(error as Error).message}`);
  }

  // Check that only one error was reported (the 401, not the 404)
  console.log(`📊 Errors reported to monitoring system: ${errorReporter.reportedErrors.length}`);
  console.log(`📋 Reported error types: ${errorReporter.reportedErrors.map(e => e.error.name).join(', ')}`);
}

/**
 * Example 3: Error aggregation
 */
async function demoErrorAggregation() {
  console.log("\n🔍 DEMO: Error Aggregation");
  console.log("=======================");

  // Clear previous errors
  errorReporter.clearReportedErrors();

  // Create a simple error aggregator 
  class ErrorAggregator {
    private errorCounts = new Map<string, number>();
    private errorExamples = new Map<string, ApiError>();
    private flushTimeoutId: NodeJS.Timeout | null = null;

    constructor(private reporter: MockErrorReporter, private flushIntervalMs: number = 5000) {}

    addError(error: ApiError) {
      const errorKey = `${error.name}:${error.status || 'unknown'}`;
      
      // Update counts
      const currentCount = this.errorCounts.get(errorKey) || 0;
      this.errorCounts.set(errorKey, currentCount + 1);
      
      // Store example if first occurrence
      if (!this.errorExamples.has(errorKey)) {
        this.errorExamples.set(errorKey, error);
      }

      // Set up flush timeout if not already set
      if (!this.flushTimeoutId) {
        this.flushTimeoutId = setTimeout(() => this.flush(), this.flushIntervalMs);
      }
    }

    flush() {
      console.log("🔄 Flushing aggregated errors...");
      
      // Report each error type with count
      for (const [errorKey, count] of this.errorCounts.entries()) {
        const example = this.errorExamples.get(errorKey);
        if (example) {
          this.reporter.captureException(example, {
            extra: {
              status: example.status,
              data: example.data,
              occurrences: count,
              aggregated: true
            },
            tags: {
              errorType: example.name
            }
          });
          
          console.log(`📡 Reported aggregated error: ${errorKey} (${count} occurrences)`);
        }
      }
      
      // Reset state
      this.errorCounts.clear();
      this.errorExamples.clear();
      this.flushTimeoutId = null;
    }

    dispose() {
      if (this.flushTimeoutId) {
        clearTimeout(this.flushTimeoutId);
        this.flush();
      }
    }
  }

  // Create aggregator instance
  const aggregator = new ErrorAggregator(errorReporter, 1000); // 1 second flush for demo

  const client = createTriggerClient('invalid-api-key', {
    errorHook: (error: ApiError) => {
      // Send to aggregator instead of immediately reporting
      aggregator.addError(error);
    }
  });

  // Generate several errors
  console.log("🔄 Generating multiple errors for aggregation...");
  
  for (let i = 0; i < 5; i++) {
    try {
      // This will fail with an authentication error
      await client.runs.list();
    } catch (error) {
      // Just log count
      console.log(`❌ Error ${i+1} generated (to be aggregated)`);
    }
  }

  // Wait for flush interval
  console.log("⏳ Waiting for aggregator to flush...");
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  // Clean up
  aggregator.dispose();
  
  // Check final results
  console.log(`📊 Aggregated error reports: ${errorReporter.reportedErrors.length}`);
  if (errorReporter.reportedErrors.length > 0) {
    console.log(`📈 Occurrences in aggregated report: ${errorReporter.reportedErrors[0].context.extra.occurrences}`);
  }
}

/**
 * Run all demos
 */
async function runDemos() {
  console.log("🚀 TRIGGER.DEV ERROR HOOKS DEMO\n");
  
  try {
    await demoBasicErrorHook();
    await demoAdvancedErrorHook();
    await demoErrorAggregation();
    
    console.log("\n✅ All demos completed successfully!");
  } catch (error) {
    console.error("❌ Demo failed with unexpected error:", error);
  }
}

// Run the demos
runDemos(); 