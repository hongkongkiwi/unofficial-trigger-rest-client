import { z } from 'zod';
import { machineSizeSchema, runStatusSchema, runErrorSchema, runAttemptSchema } from './schemas';

/**
 * Common pagination response
 */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    cursor?: string;
    hasMore: boolean;
  };
}

/**
 * Run details response
 */
export interface RunDetails {
  id: string;
  status: z.infer<typeof runStatusSchema>;
  taskIdentifier: string;
  isTest: boolean;
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date;
  finishedAt?: Date;
  idempotencyKey?: string;
  version?: string;
  tags: string[];
  metadata?: Record<string, unknown>;
  durationMs: number;
  costInCents: number;
  baseCostInCents: number;
  ttl?: string;
  delayedUntil?: Date;
  expiredAt?: Date;
  attempts: z.infer<typeof runAttemptSchema>[];
  attemptCount: number;
  error?: z.infer<typeof runErrorSchema>;
  payload?: unknown;
  output?: unknown;
  isQueued: boolean;
  isExecuting: boolean;
  isCompleted: boolean;
  isSuccess: boolean;
  isFailed: boolean;
  isCancelled: boolean;
  depth: number;
  triggerFunction: 'trigger' | 'batchTrigger' | 'triggerAndWait' | 'batchTriggerAndWait';
  batchId?: string;
}

/**
 * Schedule details response
 */
export interface ScheduleDetails {
  id: string;
  taskIdentifier: string;
  cron: string;
  timezone: string;
  description: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  payload?: unknown;
  metadata?: Record<string, unknown>;
  machine?: z.infer<typeof machineSizeSchema>;
  tags?: string[];
}

/**
 * Environment variable response
 */
export interface EnvVarDetails {
  id: string;
  key: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Queue details response
 */
export interface QueueDetails {
  id: string;
  name: string;
  concurrencyLimit: number;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Logger interface for consistent logging
 */
export interface Logger {
  error: (message: string, ...args: any[]) => void;
  warn: (message: string, ...args: any[]) => void;
  info: (message: string, ...args: any[]) => void;
  debug: (message: string, ...args: any[]) => void;
}

// WebSocket interfaces
export interface WebSocketLike {
  onopen: ((event: any) => void) | null;
  onclose: ((event: any) => void) | null;
  onmessage: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  close(): void;
  send(data: string): void;
}

export interface WebSocketBaseMessage {
  type: string;
  version?: string;
}

export interface WebSocketAuthMessage extends WebSocketBaseMessage {
  type: 'authenticate';
  payload: {
    apiKey: string;
  };
}

export interface WebSocketPingMessage extends WebSocketBaseMessage {
  type: 'ping';
  payload: {
    timestamp: number;
  };
}

export interface WebSocketPongMessage extends WebSocketBaseMessage {
  type: 'pong';
  payload: {
    timestamp: number;
  };
}

export interface WebSocketSubscribeMessage extends WebSocketBaseMessage {
  type: 'subscribe';
  payload: {
    type: string;
    resourceId: string;
  };
}

export interface WebSocketUnsubscribeMessage extends WebSocketBaseMessage {
  type: 'unsubscribe';
  payload: {
    type: string;
    resourceId: string;
  };
}

export interface WebSocketAuthResponseMessage extends WebSocketBaseMessage {
  type: 'auth_response';
  success: boolean;
  error?: string;
}

export interface WebSocketUpdateMessage extends WebSocketBaseMessage {
  type: 'update';
  resourceType: string;
  resourceId: string;
  payload: any;
}

export type WebSocketOutgoingMessage = 
  | WebSocketAuthMessage
  | WebSocketPingMessage
  | WebSocketSubscribeMessage
  | WebSocketUnsubscribeMessage;

export type WebSocketIncomingMessage = 
  | WebSocketPongMessage
  | WebSocketAuthResponseMessage
  | WebSocketUpdateMessage; 