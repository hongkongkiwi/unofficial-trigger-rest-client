import { z } from 'zod';
import { ApiError } from './errors';
import { Logger } from './types';
import { AxiosInstance } from 'axios';

// Add the WebSocket type definition for Node.js
declare global {
  interface Window {
    WebSocket: WebSocket;
  }
  
  // Simplified WebSocket type for Node.js environments
  interface WebSocket {
    onopen: ((event: any) => void) | null;
    onclose: ((event: any) => void) | null;
    onmessage: ((event: any) => void) | null;
    onerror: ((event: any) => void) | null;
    close(): void;
    send(data: string): void;
  }
  
  var WebSocket: {
    prototype: WebSocket;
    new(url: string, protocols?: string | string[]): WebSocket;
  };
}

/**
 * Machine size presets
 */
export const machineSizeSchema = z.enum([
  'micro',
  'small-1x',
  'small-2x',
  'medium-1x',
  'medium-2x',
  'large-1x',
  'large-2x'
]);

export type MachineSize = z.infer<typeof machineSizeSchema>;

/**
 * Run status types
 */
export const runStatusSchema = z.enum([
  'PENDING',
  'EXECUTING', 
  'COMPLETED', 
  'FAILED', 
  'CANCELED', 
  'TIMED_OUT',
  'REATTEMPTING', 
  'CRASHED', 
  'DELAYED', 
  'EXPIRED', 
  'FROZEN', 
  'INTERRUPTED',
  'PENDING_VERSION', 
  'QUEUED', 
  'SYSTEM_FAILURE', 
  'WAITING_FOR_DEPLOY'
]);

export type RunStatus = z.infer<typeof runStatusSchema>;

/**
 * Sort direction
 */
export const sortDirectionSchema = z.enum(['asc', 'desc']);

export type SortDirection = z.infer<typeof sortDirectionSchema>;

/**
 * Run options schema
 */
export const runOptionsSchema = z.object({
  idempotencyKey: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  delayUntil: z.union([z.string(), z.date()]).optional(),
  machine: machineSizeSchema.optional(),
  tags: z.array(z.string()).optional(),
  ttl: z.union([z.string(), z.number()]).optional(),
  maxDuration: z.number().int().positive().optional(),
  version: z.string().optional(),
  releaseConcurrency: z.boolean().optional(),
  batchKey: z.string().optional(),
  startAfter: z.union([z.string(), z.date()]).optional(),
  deduplicate: z.boolean().optional(),
  queue: z.string().optional(),
  priority: z.number().int().optional()
});

export type RunOptions = z.infer<typeof runOptionsSchema>;

/**
 * Task trigger parameters schema
 */
export const triggerTaskParamsSchema = z.object({
  taskId: z.string().min(1, "Task ID is required"),
  payload: z.record(z.unknown()).optional(),
  run: runOptionsSchema.optional()
});

export type TriggerTaskParams = z.infer<typeof triggerTaskParamsSchema>;

/**
 * Batch trigger parameters schema
 */
export const batchTriggerParamsSchema = z.object({
  runs: z.array(triggerTaskParamsSchema).min(1, "At least one run is required")
});

export type BatchTriggerParams = z.infer<typeof batchTriggerParamsSchema>;

/**
 * Common list parameters schema
 */
export const listParamsSchema = z.object({
  limit: z.number().int().positive().optional(),
  cursor: z.string().optional()
});

export type ListParams = z.infer<typeof listParamsSchema>;

/**
 * Run list parameters schema
 */
export const listRunsParamsSchema = listParamsSchema.extend({
  status: z.array(runStatusSchema).optional(),
  taskId: z.string().optional(),
  search: z.string().optional(),
  sortDirection: sortDirectionSchema.optional(),
  tags: z.array(z.string()).optional(),
  idempotencyKey: z.string().optional(),
  batchId: z.string().optional(),
  projectRef: z.string().optional()
});

export type ListRunsParams = z.infer<typeof listRunsParamsSchema>;

/**
 * Run error schema
 */
export const runErrorSchema = z.object({
  message: z.string(),
  name: z.string().optional(),
  stackTrace: z.string().optional()
});

export type RunError = z.infer<typeof runErrorSchema>;

/**
 * Run attempt schema
 */
export const runAttemptSchema = z.object({
  id: z.string(),
  status: z.enum(['EXECUTING', 'COMPLETED', 'CANCELED', 'FAILED', 'PENDING', 'PAUSED']),
  createdAt: z.date(),
  updatedAt: z.date(),
  error: runErrorSchema.optional(),
  startedAt: z.date().optional(),
  completedAt: z.date().optional()
});

export type RunAttempt = z.infer<typeof runAttemptSchema>;

/**
 * Schedule parameters schema
 */
export const scheduleParamsSchema = z.object({
  taskId: z.string().min(1, "Task ID is required"),
  cron: z.string().min(1, "Cron expression is required"),
  timezone: z.string().optional(),
  payload: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
  active: z.boolean().optional(),
  machine: machineSizeSchema.optional(),
  tags: z.array(z.string()).optional()
});

export type ScheduleParams = z.infer<typeof scheduleParamsSchema>;

/**
 * Environment variable parameters schema
 */
export const envVarParamsSchema = z.object({
  key: z.string().min(1, "Key is required"),
  value: z.string().min(1, "Value is required"),
  description: z.string().optional()
});

export type EnvVarParams = z.infer<typeof envVarParamsSchema>;

/**
 * Queue parameters schema
 */
export const queueParamsSchema = z.object({
  name: z.string().min(1, "Name is required"),
  concurrencyLimit: z.number().int().positive().optional(),
  description: z.string().optional()
});

export type QueueParams = z.infer<typeof queueParamsSchema>;

/**
 * Logger options schema
 */
export const loggerOptionsSchema = z.object({
  enabled: z.boolean(),
  level: z.enum(['error', 'warn', 'info', 'debug'])
});

export type LoggerOptions = z.infer<typeof loggerOptionsSchema>;

/**
 * Request metrics schema
 */
export const requestMetricsSchema = z.object({
  url: z.string(),
  method: z.string(),
  startTime: z.number(),
  endTime: z.number(),
  duration: z.number(),
  status: z.number().optional(),
  success: z.boolean(),
  error: z.string().optional()
});

export type RequestMetrics = z.infer<typeof requestMetricsSchema>;

/**
 * Performance metrics options schema
 */
export const performanceMetricsOptionsSchema = z.object({
  enabled: z.boolean(),
  logTimings: z.boolean(),
  historySize: z.number().int().positive(),
  telemetryHook: z.function().args(requestMetricsSchema).returns(z.void()).optional()
});

export type PerformanceMetricsOptions = z.infer<typeof performanceMetricsOptionsSchema>;

/**
 * Retry options schema
 */
export const retryOptionsSchema = z.object({
  maxRetries: z.number().int().nonnegative().optional(),
  retryDelay: z.number().int().positive().optional(),
  retryStatusCodes: z.array(z.number().int()).optional(),
  useJitter: z.boolean().optional()
});

export type RetryOptions = z.infer<typeof retryOptionsSchema>;

/**
 * WebSocket manager options schema
 */
export const webSocketManagerOptionsSchema = z.object({
  pingInterval: z.number().int().positive().optional(),
  pongTimeout: z.number().int().positive().optional(),
  connectionTimeout: z.number().int().positive().optional(),
  maxReconnectAttempts: z.number().int().nonnegative().optional(),
  initialReconnectDelay: z.number().int().positive().optional(),
  maxReconnectDelay: z.number().int().positive().optional(),
  reconnectBackoffFactor: z.number().positive().optional()
}).strict();

export type WebSocketManagerOptions = z.infer<typeof webSocketManagerOptionsSchema>;

/**
 * Error hook schema
 */
export const errorHookSchema = z.function()
  .args(z.custom<ApiError>())
  .returns(z.void())
  .optional();

/**
 * API options schema
 */
export const triggerAPIOptionsSchema = z.object({
  baseURL: z.string().url().optional(),
  websocketURL: z.string().url().optional(),
  timeout: z.number().int().positive().optional(),
  logging: loggerOptionsSchema.optional(),
  logger: z.custom<Logger>((val) => {
    return val !== null && 
           typeof val === 'object' && 
           typeof (val as any).error === 'function' &&
           typeof (val as any).warn === 'function' &&
           typeof (val as any).info === 'function' &&
           typeof (val as any).debug === 'function';
  }, { message: "Logger must implement error, warn, info, and debug methods" }).optional(),
  retry: retryOptionsSchema.optional(),
  enableCompression: z.boolean().optional(),
  metrics: performanceMetricsOptionsSchema.optional(),
  websocketOptions: webSocketManagerOptionsSchema.optional(),
  errorHook: errorHookSchema,
  axiosInstance: z.custom<any>((val) => {
    return val !== null && 
           typeof val === 'object' && 
           typeof (val as any).request === 'function' &&
           typeof (val as any).interceptors === 'object';
  }, { message: "axiosInstance must be a valid Axios instance with request method and interceptors" }).optional()
}).strict();

export type TriggerAPIOptions = {
  baseURL?: string;
  websocketURL?: string;
  timeout?: number;
  logging?: LoggerOptions;
  logger?: Logger;  // Custom logger implementation
  retry?: RetryOptions;
  enableCompression?: boolean;
  metrics?: PerformanceMetricsOptions;
  websocketOptions?: WebSocketManagerOptions;
  errorHook?: (error: ApiError) => void;
  axiosInstance?: AxiosInstance;  // Custom Axios instance
}; 