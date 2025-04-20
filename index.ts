/**
 * Trigger.dev Management API Client
 * This is a standalone client for the Trigger.dev v4 Management API
 * 
 * @module trigger-rest-client
 */

// Export API client
export { TriggerAPI, createTriggerClient } from './client';

// Export error classes
export {
  TriggerAPIError,
  ValidationError,
  AuthenticationError,
  PermissionDeniedError,
  NotFoundError,
  RateLimitError,
  ServerError
} from './errors';

// Export schemas and types
export {
  MachineSize,
  RunStatus,
  SortDirection,
  RunOptions,
  TriggerTaskParams,
  BatchTriggerParams,
  ListParams,
  ListRunsParams,
  RunError,
  RunAttempt,
  ScheduleParams,
  EnvVarParams,
  QueueParams,
  LoggerOptions,
  RequestMetrics,
  PerformanceMetricsOptions,
  RetryOptions,
  WebSocketManagerOptions,
  TriggerAPIOptions
} from './schemas';

// Export interfaces
export {
  PaginatedResponse,
  RunDetails,
  ScheduleDetails,
  EnvVarDetails,
  QueueDetails,
  Logger,
  WebSocketLike
} from './types';

// Export utility functions
export {
  validateWithZod,
  isWebSocketAvailable,
  createCancellableRequest
} from './utils';

// Export WebSocketManager
export { WebSocketManager } from './websocket';
