/**
 * Advanced WebSocket Features Demonstration
 * 
 * This example demonstrates the real-time communication capabilities
 * of the Trigger.dev v4 client using WebSockets for live updates.
 * 
 * To run:
 * 1. Make sure TRIGGER_SECRET_KEY is set in your environment
 * 2. Run with ts-node: npx ts-node examples/websocket-demo.ts
 */

import { createTriggerClient } from "../client";

// Helper function to pause execution
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function demoWebSocketFeatures() {
  console.log("🔄 Demonstrating Trigger.dev v4 WebSocket Features\n");
  
  // Create client with WebSocket configuration
  const client = createTriggerClient(process.env.TRIGGER_SECRET_KEY, {
    logging: {
      enabled: true,
      level: 'info'
    },
    websocketOptions: {
      connectionTimeout: 10000,       // 10 second connection timeout
      maxReconnectAttempts: 5         // Try reconnecting 5 times
    }
  });
  
  try {
    // =======================================
    // Step 1: Run Subscription
    // =======================================
    console.log("🔔 1. Single Run Subscription");
    const taskId = process.env.DEMO_TASK_ID || "example-task";
    
    console.log("  ↳ Triggering a task to demonstrate run subscription...");
    const run = await client.tasks.trigger({
      taskId,
      payload: {
        message: "WebSocket subscription test",
        timestamp: new Date().toISOString()
      },
      run: {
        tags: ["websocket-demo", "run-subscription"]
      }
    });
    console.log(`  ✓ Run created with ID: ${run.id}`);
    
    console.log("  ↳ Setting up WebSocket subscription to monitor this run...");
    console.log("  ↳ (Monitoring for up to 30 seconds or until completion)");
    
    // We'll use a timeout to limit how long we wait
    const runTimeout = setTimeout(() => {
      console.log("  ↳ Timeout reached (30 seconds) for run subscription");
    }, 30000);
    
    // Tracking variables
    let updateCount = 0;
    
    try {
      // Subscribe to the run with the stopOnCompletion option
      for await (const update of client.runs.subscribeToRun(run.id, { stopOnCompletion: true })) {
        updateCount++;
        
        // Format the output based on the update type
        if (updateCount === 1) {
          console.log(`  ✓ Initial run state: ${update.status}`);
        } else {
          // Show progress if available
          const progress = update.progress ? ` (${update.progress}% complete)` : '';
          console.log(`  ↳ Update #${updateCount}: Status changed to ${update.status}${progress}`);
        }
        
        // If the run has completed, we can break out of the loop
        if (update.isCompleted) {
          console.log(`  ✓ Run completed with status: ${update.status}`);
          
          // Show execution details if available
          if (update.duration) {
            console.log(`  ℹ️ Execution took ${update.duration}ms`);
          }
          
          if (update.output) {
            console.log(`  ℹ️ Output: ${JSON.stringify(update.output).substring(0, 100)}...`);
          }
          
          break;
        }
      }
      
      console.log(`  ✓ Subscription completed after ${updateCount} updates`);
    } catch (error: any) {
      console.error(`  ❌ Error in run subscription: ${error?.message || error}`);
    } finally {
      clearTimeout(runTimeout);
    }
    
    // =======================================
    // Step 2: Tag-Based Subscription
    // =======================================
    console.log("\n🏷️ 2. Tag-Based Subscription");
    
    console.log("  ↳ Setting up subscription to all runs with tag 'websocket-demo'");
    console.log("  ↳ This will notify us of any new runs that match the tag");
    
    // Setup tag subscription timeout (10 seconds)
    const tagTimeout = setTimeout(() => {
      console.log("  ↳ Timeout reached (10 seconds) for tag subscription");
    }, 10000);
    
    // Track new runs we observe
    const observedRuns = new Set<string>();
    
    // Setup a function to trigger a new run after a delay
    const triggerDelayedRun = async () => {
      // Wait 2 seconds before triggering a new run
      await sleep(2000);
      
      console.log("  ↳ Triggering a new run with the tag 'websocket-demo' to demonstrate notification...");
      const newRun = await client.tasks.trigger({
        taskId,
        payload: {
          message: "Auto-triggered for tag demo",
          timestamp: new Date().toISOString()
        },
        run: {
          tags: ["websocket-demo", "auto-triggered"]
        }
      });
      console.log(`  ✓ New run triggered with ID: ${newRun.id}`);
    };
    
    // Start the delayed trigger
    triggerDelayedRun().catch(err => console.error("Error triggering delayed run:", err));
    
    try {
      // Subscribe to all runs with the websocket-demo tag
      const tagSubscription = client.runs.subscribeToRunsWithTag("websocket-demo");
      
      // We'll limit this to 10 seconds or 3 runs
      let runCount = 0;
      const MAX_RUNS = 3;
      
      for await (const taggedRun of tagSubscription) {
        // The first update might be just a subscription confirmation
        if (!taggedRun || typeof taggedRun !== 'object') continue;
        
        // Check if this is an actual run update with an ID
        if ('id' in taggedRun && typeof taggedRun.id === 'string') {
          // Skip if we've already seen this run
          if (observedRuns.has(taggedRun.id)) continue;
          
          runCount++;
          observedRuns.add(taggedRun.id);
          
          console.log(`  ℹ️ New run detected: ${taggedRun.id}`);
          
          // Log details safely with property checks
          if ('taskId' in taggedRun) {
            console.log(`    - Task: ${taggedRun.taskId}`);
          }
          
          if ('status' in taggedRun) {
            console.log(`    - Status: ${taggedRun.status}`);
          }
          
          if ('tags' in taggedRun && Array.isArray(taggedRun.tags)) {
            console.log(`    - Tags: ${taggedRun.tags.join(', ')}`);
          }
          
          // Break after MAX_RUNS to avoid waiting too long
          if (runCount >= MAX_RUNS) {
            console.log(`  ✓ Observed ${runCount} tagged runs, ending subscription`);
            break;
          }
        } else {
          // This might be a subscription confirmation
          console.log(`  ℹ️ Received subscription update`);
        }
      }
    } catch (error: any) {
      console.error(`  ❌ Error in tag subscription: ${error?.message || error}`);
    } finally {
      clearTimeout(tagTimeout);
    }
    
    // =======================================
    // Step 3: Batch Subscription
    // =======================================
    console.log("\n📦 3. Batch Run Subscription");
    
    console.log("  ↳ Creating a batch of runs to demonstrate batch monitoring...");
    const batchResult = await client.tasks.batchTrigger({
      runs: [
        { 
          taskId, 
          payload: { item: "Batch Item 1" },
          run: { tags: ["websocket-demo", "batch-demo"] } 
        },
        { 
          taskId, 
          payload: { item: "Batch Item 2" },
          run: { tags: ["websocket-demo", "batch-demo"] } 
        },
        { 
          taskId, 
          payload: { item: "Batch Item 3" },
          run: { tags: ["websocket-demo", "batch-demo"] } 
        }
      ]
    });
    
    // Handle API differences - in some versions batchId is directly returned,
    // in others it might need to be extracted from response metadata
    let batchId = null;
    
    // Check if batchResult is an array (direct run results)
    if (Array.isArray(batchResult) && batchResult.length > 0) {
      // Try to extract batch ID from first run
      if (batchResult[0] && typeof batchResult[0] === 'object' && 'batchId' in batchResult[0]) {
        batchId = batchResult[0].batchId as string;
      }
      console.log(`  ✓ Created ${batchResult.length} runs in the batch`);
    } 
    // Check if it's an object with a batchId property
    else if (batchResult && typeof batchResult === 'object') {
      if ('batchId' in batchResult) {
        batchId = batchResult.batchId as string;
      }
      // Check if there's a runs property containing the runs
      else if ('runs' in batchResult && Array.isArray(batchResult.runs) && batchResult.runs.length > 0) {
        if (batchResult.runs[0] && typeof batchResult.runs[0] === 'object' && 'batchId' in batchResult.runs[0]) {
          batchId = batchResult.runs[0].batchId as string;
        }
        console.log(`  ✓ Created ${batchResult.runs.length} runs in the batch`);
      }
    }
    
    if (!batchId) {
      console.log("  ❌ Could not determine batch ID from response");
    } else {
      console.log(`  ✓ Batch created with ID: ${batchId}`);
      
      console.log("  ↳ Setting up batch subscription to monitor progress...");
      
      // Setup batch timeout (20 seconds)
      const batchTimeout = setTimeout(() => {
        console.log("  ↳ Timeout reached (20 seconds) for batch subscription");
      }, 20000);
      
      try {
        // Subscribe to the batch
        for await (const batchUpdate of client.runs.subscribeToBatch(batchId)) {
          const percentComplete = Math.round((batchUpdate.completedRuns / batchUpdate.totalRuns) * 100);
          
          console.log(`  ↳ Batch update: ${percentComplete}% complete`);
          console.log(`    - Completed: ${batchUpdate.completedRuns}/${batchUpdate.totalRuns}`);
          console.log(`    - Running: ${batchUpdate.runningRuns}`);
          console.log(`    - Failed: ${batchUpdate.failedRuns}`);
          
          if (batchUpdate.isCompleted) {
            console.log(`  ✓ Batch execution completed!`);
            break;
          }
        }
      } catch (error: any) {
        console.error(`  ❌ Error in batch subscription: ${error?.message || error}`);
      } finally {
        clearTimeout(batchTimeout);
      }
    }
    
    // =======================================
    // Step 4: WebSocket Connection Management
    // =======================================
    console.log("\n🔌 4. WebSocket Connection Management");
    
    // Demonstrate how to manually control the WebSocket connection
    console.log("  ↳ Manually disconnecting WebSocket connection...");
    client.disposeWebSocket();
    console.log("  ✓ WebSocket disconnected");
    
    // Show how the connection will auto-reconnect when needed
    console.log("  ↳ Triggering new task to demonstrate auto-reconnection...");
    const reconnectRun = await client.tasks.trigger({
      taskId,
      payload: {
        message: "WebSocket reconnection test",
        timestamp: new Date().toISOString()
      }
    });
    console.log(`  ✓ New run created: ${reconnectRun.id}`);
    
    console.log("  ↳ Setting up subscription (should auto-reconnect)...");
    try {
      // This will auto-reconnect the WebSocket
      const update = await client.runs.subscribeToRun(reconnectRun.id).next();
      console.log(`  ✓ WebSocket auto-reconnected successfully`);
      console.log(`  ✓ Received run status: ${update.value?.status || 'unknown'}`);
    } catch (error: any) {
      console.error(`  ❌ Error in reconnection test: ${error?.message || error}`);
    }
    
  } catch (error: any) {
    console.error(`❌ Error in WebSocket demo: ${error?.message || error}`);
  } finally {
    // Always clean up resources
    client.disposeWebSocket();
    console.log("\n🧹 WebSocket resources cleaned up");
  }
  
  console.log("\n✅ WebSocket demonstration completed!");
}

// Run the demo
demoWebSocketFeatures().catch((error: any) => {
  console.error("💥 Fatal error:", error?.message || error);
  process.exit(1);
}); 