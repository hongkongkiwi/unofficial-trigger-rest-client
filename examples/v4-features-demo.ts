/**
 * Advanced Trigger.dev v4 Features Demonstration
 * 
 * This example demonstrates key features of the Trigger.dev v4 API client,
 * including real-time monitoring, advanced queue management, caching,
 * batching, and performance metrics.
 * 
 * To run:
 * 1. Make sure TRIGGER_SECRET_KEY is set in your environment
 * 2. Run with ts-node: npx ts-node examples/v4-features-demo.ts
 */

import { createTriggerClient } from "../client";
import axios from "axios";

// Helper function to pause execution
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function demoV4Features() {
  console.log("🚀 Demonstrating Trigger.dev v4 Advanced Features\n");
  
  // Create client with comprehensive configuration
  const client = createTriggerClient(process.env.TRIGGER_SECRET_KEY, {
    metrics: {
      enabled: true,
      logTimings: true,
      historySize: 100,
      telemetryHook: (metrics) => {
        // Example telemetry hook - in production, you would send this to your monitoring system
        if (metrics.duration > 1000) {
          console.log(`⚠️ Slow API call: ${metrics.method} ${metrics.url} took ${metrics.duration}ms`);
        }
      }
    },
    logging: {
      enabled: true,
      level: 'info'
    },
    retry: {
      maxRetries: 3,
      retryDelay: 300,
      useJitter: true,
      retryStatusCodes: [408, 429, 500, 502, 503, 504]
    },
    websocketOptions: {
      connectionTimeout: 10000,
      maxReconnectAttempts: 5
    },
    // Add error hook for external monitoring
    errorHook: (error) => {
      console.log(`🔔 Error hook called: ${error.name} - ${error.message}`);
      console.log(`   Would forward to monitoring system in production`);
      
      // In production, you would send this to your monitoring system:
      // yourMonitoringSystem.captureException(error, {
      //   extra: { status: error.status, data: error.data },
      //   tags: { errorType: error.name }
      // });
    }
  });
  
  try {
    // =======================================
    // Demo 1: Advanced Queue Management
    // =======================================
    console.log("📊 1. Advanced Queue Management");
    const timestamp = Date.now();
    const queueName = `demo-queue-${timestamp}`;
    
    console.log("  ↳ Creating a production-style queue with concurrency limits...");
    const queue = await client.queues.create({
      name: queueName,
      concurrencyLimit: 3,
      description: "Demonstration queue for processing tasks"
    });
    console.log(`  ✓ Queue created: ${queue.id} (${queue.name})`);
    
    // List queues to confirm creation
    console.log("  ↳ Listing all queues...");
    const { data: queues } = await client.queues.list();
    console.log(`  ✓ Found ${queues.length} queues`);
    
    // =======================================
    // Demo 2: Batch Triggers with Queue Assignment
    // =======================================
    console.log("\n📦 2. Batch Task Operations");
    const taskId = process.env.DEMO_TASK_ID || "example-task";
    
    console.log("  ↳ Triggering a batch of tasks using the queue...");
    const batchResult = await client.tasks.batchTrigger({
      runs: [
        { 
          taskId, 
          payload: { item: "Item 1", timestamp },
          run: { 
            queue: queueName,
            tags: ["demo", "batch", "item-1"] 
          } 
        },
        { 
          taskId, 
          payload: { item: "Item 2", timestamp },
          run: { 
            queue: queueName,
            tags: ["demo", "batch", "item-2"] 
          } 
        },
        { 
          taskId, 
          payload: { item: "Item 3", timestamp },
          run: { 
            queue: queueName,
            tags: ["demo", "batch", "item-3"] 
          }
        }
      ]
    });
    
    console.log(`  ✓ Batch created (${batchResult.length} runs)`);
    
    // =======================================
    // Demo 3: Real-time monitoring via WebSockets
    // =======================================
    console.log("\n📡 3. Real-time Run Monitoring");
    
    // Filter to monitor just our recent batch
    if (batchResult.length > 0) {
      const runId = batchResult[0].id;
      
      console.log(`  ↳ Setting up real-time monitoring for run ${runId}...`);
      console.log("  ↳ Watching for 10 seconds (or until completion)...");
      
      // Set up cancellation after 10 seconds
      setTimeout(() => {
        console.log("  ↳ WebSocket monitoring stopped after timeout");
      }, 10000);
      
      try {
        // Monitor specific run with WebSocket
        for await (const update of client.runs.subscribeToRun(runId, { 
          stopOnCompletion: true // Auto-unsubscribe when run completes
        })) {
          console.log(`  ℹ️ Run ${runId} update: Status=${update.status}, Progress=${update.progress || 0}%`);
          
          if (update.isCompleted) {
            console.log(`  ✓ Run completed with status: ${update.status}`);
            break;
          }
        }
      } catch (error) {
        console.error("Error in WebSocket monitoring:", error);
      }
    }
    
    // =======================================
    // Demo 4: Advanced Caching Operations
    // =======================================
    console.log("\n🗄️ 4. Advanced Cache Operations");
    
    const cacheKeyPrefix = `demo-cache-${timestamp}`;
    
    console.log("  ↳ Storing multiple values in cache...");
    
    // Set multiple values with different TTLs
    await Promise.all([
      client.cache.set(`${cacheKeyPrefix}-config`, { 
        environment: "demo",
        features: ["websockets", "metrics", "batching"],
        version: "4.0.0"
      }, 3600), // 1 hour TTL
      
      client.cache.set(`${cacheKeyPrefix}-stats`, { 
        runs: 3,
        successes: 3,
        failures: 0,
        lastUpdated: new Date().toISOString()
      }, 600), // 10 minutes TTL
      
      client.cache.set(`${cacheKeyPrefix}-user`, {
        id: "demo-user",
        role: "admin",
        permissions: ["read", "write", "execute"]
      }, 1800) // 30 minutes TTL
    ]);
    
    console.log("  ✓ Successfully cached multiple values");
    
    // Get multiple values in one operation - get them one by one if getMany isn't available
    console.log("  ↳ Retrieving cached values...");
    const cachedValues = {
      [`${cacheKeyPrefix}-config`]: await client.cache.get(`${cacheKeyPrefix}-config`),
      [`${cacheKeyPrefix}-stats`]: await client.cache.get(`${cacheKeyPrefix}-stats`),
      [`${cacheKeyPrefix}-user`]: await client.cache.get(`${cacheKeyPrefix}-user`)
    };
    
    console.log("  ✓ Retrieved cached values:");
    for (const [key, value] of Object.entries(cachedValues)) {
      console.log(`    - ${key}: ${value ? "Found" : "Not found"}`);
    }
    
    // Clean up cache
    console.log("  ↳ Cleaning up cache entries...");
    await Promise.all([
      client.cache.delete(`${cacheKeyPrefix}-config`),
      client.cache.delete(`${cacheKeyPrefix}-stats`),
      client.cache.delete(`${cacheKeyPrefix}-user`)
    ]);
    console.log("  ✓ Cache entries deleted");
    
    // =======================================
    // Demo 5: Schedules API
    // =======================================
    console.log("\n⏰ 5. Advanced Scheduling");
    
    const scheduleName = `demo-schedule-${timestamp}`;
    
    console.log("  ↳ Creating a schedule with machine specification...");
    const schedule = await client.schedules.create({
      taskId,
      cron: "0 9 * * 1-5", // Weekdays at 9am
      timezone: "UTC",
      payload: {
        source: "v4-demo",
        scheduled: true,
        timestamp
      },
      metadata: {
        description: "Demo schedule for v4 features",
        owner: "example-user",
        environment: "demo"
      },
      machine: "small-1x", // v4 feature - specify machine size
      tags: ["demo", "scheduled"]
    });
    
    console.log(`  ✓ Schedule created: ${schedule.id}`);
    
    // List schedules to verify
    console.log("  ↳ Listing schedules...");
    const { data: schedules } = await client.schedules.list();
    
    if (schedules.length > 0) {
      console.log(`  ✓ Found schedule: ${schedules[0].id}`);
      
      // Demo updating a schedule to deactivate it
      console.log("  ↳ Updating schedule to deactivate it...");
      await client.schedules.update(schedules[0].id, {
        active: false
      });
      console.log("  ✓ Schedule deactivated");
      
      // Clean up by deleting the schedule
      await client.schedules.delete(schedules[0].id);
      console.log("  ✓ Schedule deleted");
    }
    
    // =======================================
    // Demo 6: Performance Metrics
    // =======================================
    console.log("\n📈 6. Performance Metrics Analysis");
    
    const stats = client.getPerformanceStats();
    const history = client.getMetricsHistory();
    
    console.log("  ↳ Client performance metrics:");
    console.log(`    - Total requests: ${stats.totalRequests}`);
    console.log(`    - Success rate: ${Math.round((stats.successfulRequests / stats.totalRequests) * 100)}%`);
    console.log(`    - Average duration: ${Math.round(stats.averageDuration)}ms`);
    console.log(`    - Min/Max duration: ${stats.minDuration}ms / ${stats.maxDuration}ms`);
    
    // Calculate endpoint performance
    console.log("  ↳ Endpoint performance breakdown:");
    
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
    
    endpointStats.forEach((stats, endpoint) => {
      console.log(`    - ${endpoint}:`);
      console.log(`      Calls: ${stats.count}, Avg: ${Math.round(stats.totalDuration / stats.count)}ms, Failures: ${stats.failures}`);
    });
    
    // =======================================
    // Demo 7: Error Handling
    // =======================================
    console.log("\n🛡️ 7. Error Handling Demonstration");
    
    console.log("  ↳ Demonstrating error handling with invalid request...");
    try {
      // Intentionally make an invalid request
      await client.runs.retrieve("non-existent-run-id");
    } catch (error: any) {  // Using any type to safely access properties
      console.log(`  ✓ Caught error: ${error.name || 'Unknown'}: ${error.message || 'No message'}`);
      
      if (error && typeof error === 'object' && 'status' in error) {
        console.log(`  ✓ Status code: ${error.status}`);
      }
      
      if (error && typeof error === 'object' && 'data' in error) {
        console.log(`  ✓ Error data available: ${JSON.stringify(error.data).substring(0, 100)}...`);
      }
      
      // In real code, you would handle specific error types:
      // if (error instanceof NotFoundError) { ... }
      // if (error instanceof ValidationError) { ... }
    }
    
    // =======================================
    // Demo 8: Cleanup
    // =======================================
    console.log("\n🧹 8. Resource Cleanup");
    
    // Delete the test queue
    console.log("  ↳ Deleting test queue...");
    await client.queues.delete(queue.id);
    console.log("  ✓ Queue deleted successfully");
    
    console.log("\n✅ All v4 features demonstrated successfully!");
    
  } catch (error: any) {
    console.error("❌ Error in v4 features demo:", error?.message || error);
  } finally {
    // Clean up WebSocket resources
    client.disposeWebSocket();
    console.log("\n🔌 WebSocket resources cleaned up");
    
    console.log("\n👋 Thanks for exploring Trigger.dev v4 features!");
  }
}

// Run the demo
demoV4Features().catch((error: any) => {
  console.error("💥 Fatal error:", error?.message || error);
  process.exit(1);
}); 