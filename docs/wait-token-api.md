# Working with Wait Tokens in v4

One of the major features introduced in Trigger.dev v4 is the wait token system. This document explains how to interact with wait tokens using our unofficial Management API client.

## What are Wait Tokens?

Wait tokens allow a task to pause execution until an external condition is met. Unlike time-based waits, wait tokens can be completed by external systems, making them perfect for human approval flows, waiting for external processes, or creating complex orchestration patterns.

## Creating and Using Wait Tokens in Trigger.dev Tasks

While our unofficial Management API client doesn't directly create wait tokens (that happens inside Trigger.dev tasks), it's helpful to understand how wait tokens work in the official SDK:

```typescript
// Inside a Trigger.dev task using the official SDK
import { wait } from "@trigger.dev/sdk";

export const approvalTask = task({
  id: "approval-workflow",
  run: async (payload, { ctx }) => {
    // Create a token (returns a token ID)
    const token = await wait.createToken({
      timeout: "1h",
      description: "Waiting for approval"
    });
    
    // Send the token ID to an external system (e.g., Slack)
    await sendTokenToSlackForApproval(token.id);
    
    // Wait for the token to be completed
    const result = await wait.forToken(token.id);
    
    if (result.ok) {
      // Token was completed successfully with a payload
      console.log("Approved:", result.output.approved);
      return { status: "approved", data: result.output };
    } else {
      // Token timed out
      console.log("Token timed out");
      return { status: "timed-out" };
    }
  }
});
```

## Interacting with Wait Tokens via Our Management API Client

Our unofficial API client provides several ways to work with wait tokens from external systems:

### 1. Checking Token Status

You can check the status of a wait token by fetching the token stream:

```typescript
import { createTriggerClient } from "@your-org/trigger-rest-client";

const client = createTriggerClient(process.env.TRIGGER_SECRET_KEY);

// Get information about all tokens in a run
const tokenStream = await client.runs.fetchStream(runId, 'wait-tokens');
console.log("Active tokens:", tokenStream.tokens);

// Get information about a specific token
const tokenStatus = await client.runs.fetchStream(runId, `wait-token-${tokenId}`);
console.log("Token status:", tokenStatus);
```

### 2. Completing a Wait Token

To complete a wait token from outside the task, use the cache API to update the token status:

```typescript
// Complete a token with a payload
await client.cache.set(`token:${tokenId}:status`, {
  status: "completed",
  payload: { 
    approved: true,
    approvedBy: "user@example.com",
    comments: "Looks good!"
  }
});

// Or reject/fail a token
await client.cache.set(`token:${tokenId}:status`, {
  status: "failed",
  error: "Rejected by reviewer"
});
```

### 3. Building a Token Approval UI

You can build a complete approval UI using our unofficial client:

```typescript
// 1. List all runs that are waiting for approval
const waitingRuns = await client.runs.list({
  status: ["DELAYED"], // DELAYED status indicates a waiting run
  tags: ["needs-approval"]
});

// 2. For each run, get the wait tokens
for (const run of waitingRuns.data) {
  const tokenStream = await client.runs.fetchStream(run.id, 'wait-tokens');
  
  if (tokenStream.tokens && tokenStream.tokens.length > 0) {
    // Display tokens to the user for approval
    displayTokensForApproval(run, tokenStream.tokens);
  }
}

// 3. When a user approves, complete the token
async function approveToken(tokenId, approvalData) {
  await client.cache.set(`token:${tokenId}:status`, {
    status: "completed",
    payload: approvalData
  });
  
  return { success: true, message: "Token approved successfully" };
}
```

### 4. Using WebSockets to Monitor Token Status

You can use our WebSocket implementation to get real-time updates on runs that are waiting for tokens:

```typescript
// Subscribe to runs with a specific tag
for await (const run of client.runs.subscribeToRunsWithTag("needs-approval")) {
  // Check if the run is waiting for a token
  if (run.status === "DELAYED") {
    // Notify your system that there's a new approval pending
    notifyApprovalSystem(run);
  }
}

// Subscribe to specific run updates to see when tokens are completed
for await (const runUpdate of client.runs.subscribeToRun(runId)) {
  // The run has resumed after token completion
  if (runUpdate.status === "EXECUTING" && previousStatus === "DELAYED") {
    // Token was completed, update your UI
    updateApprovalUI(runUpdate);
  }
}
```

## Example: External Approval System

Here's a complete example of building an approval system using our unofficial client:

```typescript
import express from 'express';
import { createTriggerClient } from "@your-org/trigger-rest-client";

const app = express();
const client = createTriggerClient(process.env.TRIGGER_SECRET_KEY);

app.use(express.json());

// API to list pending approvals
app.get('/api/approvals', async (req, res) => {
  const pendingRuns = await client.runs.list({
    status: ["DELAYED"],
    tags: ["needs-approval"]
  });
  
  const approvals = [];
  
  for (const run of pendingRuns.data) {
    const tokenStream = await client.runs.fetchStream(run.id, 'wait-tokens');
    
    if (tokenStream.tokens) {
      for (const token of tokenStream.tokens) {
        approvals.push({
          runId: run.id,
          tokenId: token.id,
          description: token.description || "Approval required",
          createdAt: token.createdAt,
          expiresAt: token.expiresAt
        });
      }
    }
  }
  
  res.json({ approvals });
});

// API to approve a token
app.post('/api/approvals/:tokenId/approve', async (req, res) => {
  const { tokenId } = req.params;
  const approvalData = req.body;
  
  try {
    await client.cache.set(`token:${tokenId}:status`, {
      status: "completed",
      payload: {
        approved: true,
        approvedBy: approvalData.approvedBy,
        comments: approvalData.comments,
        approvedAt: new Date().toISOString()
      }
    });
    
    res.json({ success: true, message: "Approval submitted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// API to reject a token
app.post('/api/approvals/:tokenId/reject', async (req, res) => {
  const { tokenId } = req.params;
  const rejectionData = req.body;
  
  try {
    await client.cache.set(`token:${tokenId}:status`, {
      status: "failed",
      error: rejectionData.reason || "Rejected by reviewer"
    });
    
    res.json({ success: true, message: "Rejection submitted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.listen(3000, () => {
  console.log('Approval server running on port 3000');
});
```

## Wait Token Best Practices

1. **Always set timeouts** - Wait tokens should have reasonable timeouts to prevent runs from being stuck indefinitely
2. **Use descriptive information** - Include helpful descriptions when creating tokens
3. **Use tags** - Tag your runs that use wait tokens to make them easier to find
4. **Consider idempotency** - Use idempotency keys with wait tokens to handle retries properly
5. **Handle failures** - Always handle both successful and failed/timed out tokens 