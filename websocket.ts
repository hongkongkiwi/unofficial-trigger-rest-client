import { Logger } from './types';
import { WebSocketManagerOptions } from './schemas';
import { validateWithZod } from './utils';
import { isWebSocketAvailable } from './utils';
import { webSocketManagerOptionsSchema } from './schemas';
import {
  WebSocketLike,
  WebSocketOutgoingMessage,
  WebSocketIncomingMessage
} from './types';

/**
 * WebSocket connection manager with reconnection logic
 */
export class WebSocketManager {
  private ws: WebSocketLike | null = null;
  private url: string;
  private apiKey: string;
  private isConnecting: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private initialReconnectDelay: number = 1000;
  private maxReconnectDelay: number = 30000;
  private reconnectBackoffFactor: number = 1.5;
  private reconnectTimeoutId: NodeJS.Timeout | null = null;
  private messageHandlers: Map<string, (data: any) => void> = new Map();
  private logger: Logger;
  
  // Connection status
  private _isConnected: boolean = false;
  
  // Ping/heartbeat mechanism
  private pingIntervalId: NodeJS.Timeout | null = null;
  private pingIntervalMs: number = 30000; // 30 seconds
  private lastPongTime: number = 0;
  private pongTimeoutMs: number = 10000; // 10 seconds
  
  // Connection timeout
  private connectionTimeoutMs: number = 15000; // 15 seconds
  private connectionTimeoutId: NodeJS.Timeout | null = null;
  
  // Protocol version
  private protocolVersion: string = 'v1';
  
  // Store active subscriptions for reconnection
  private activeSubscriptions: Map<string, { type: string, resourceId: string, callback: (data: any) => void }> = new Map();
  
  constructor(url: string, apiKey: string, logger: Logger, options?: WebSocketManagerOptions) {
    this.url = url;
    this.apiKey = apiKey;
    this.logger = logger;
    
    // Validate options with Zod if provided
    if (options) {
      try {
        const validatedOptions = validateWithZod(webSocketManagerOptionsSchema, options);
        
        // Apply validated options
        this.pingIntervalMs = validatedOptions.pingInterval ?? this.pingIntervalMs;
        this.pongTimeoutMs = validatedOptions.pongTimeout ?? this.pongTimeoutMs;
        this.connectionTimeoutMs = validatedOptions.connectionTimeout ?? this.connectionTimeoutMs;
        this.maxReconnectAttempts = validatedOptions.maxReconnectAttempts ?? this.maxReconnectAttempts;
        this.initialReconnectDelay = validatedOptions.initialReconnectDelay ?? this.initialReconnectDelay;
        this.maxReconnectDelay = validatedOptions.maxReconnectDelay ?? this.maxReconnectDelay;
        this.reconnectBackoffFactor = validatedOptions.reconnectBackoffFactor ?? this.reconnectBackoffFactor;
      } catch (error) {
        if (logger) {
          logger.error('Invalid WebSocketManager options', error);
        } else {
          console.error('Invalid WebSocketManager options', error);
        }
        throw error;
      }
    }
  }
  
  /**
   * Get the current connection status
   */
  get isConnected(): boolean {
    return this._isConnected;
  }
  
  /**
   * Connect to the WebSocket server
   */
  public connect(): Promise<void> {
    if (this.isConnected || this.isConnecting) {
      return Promise.resolve();
    }
    
    this.isConnecting = true;
    
    return new Promise((resolve, reject) => {
      try {
        if (!isWebSocketAvailable()) {
          this.logger.warn('WebSocket is not available in this environment');
          reject(new Error('WebSocket is not available in this environment'));
          return;
        }
        
        this.logger.debug('Connecting to WebSocket', this.url);
        
        // Create WebSocket connection
        const ws = new WebSocket(this.url);
        this.ws = ws;
        
        // Set connection timeout
        this.setConnectionTimeout(reject);
        
        // Setup event handlers
        ws.onopen = (event) => {
          this.clearConnectionTimeout();
          this.logger.debug('WebSocket connection opened');
          this._isConnected = true;
          this.isConnecting = false;
          this.reconnectAttempts = 0;
          
          // Send authentication
          this.send({
            type: 'authenticate',
            version: this.protocolVersion,
            payload: { apiKey: this.apiKey }
          });
          
          // Start heartbeat
          this.startHeartbeat();
          
          // Restore subscriptions after reconnection
          this.restoreSubscriptions();
          
          resolve();
        };
        
        ws.onclose = (event) => {
          this.clearConnectionTimeout();
          this.stopHeartbeat();
          this.logger.debug('WebSocket connection closed', event);
          this._isConnected = false;
          this.isConnecting = false;
          
          // Attempt to reconnect
          this.reconnect();
        };
        
        ws.onerror = (event) => {
          this.logger.error('WebSocket error', event);
          this.isConnecting = false;
          
          if (!this._isConnected) {
            this.clearConnectionTimeout();
            reject(new Error('Failed to connect to WebSocket server'));
          }
        };
        
        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            this.handleMessage(data);
          } catch (error) {
            this.logger.error('Error parsing WebSocket message', error);
          }
        };
      } catch (error) {
        this.clearConnectionTimeout();
        this.isConnecting = false;
        this.logger.error('Error connecting to WebSocket', error);
        reject(error);
      }
    });
  }
  
  /**
   * Close the WebSocket connection
   */
  public disconnect(): void {
    this.clearConnectionTimeout();
    this.stopHeartbeat();
    
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }
    
    if (this.ws) {
      this.logger.debug('Closing WebSocket connection');
      this.ws.onclose = null; // Prevent auto-reconnect
      this.ws.close();
      this.ws = null;
    }
    
    this._isConnected = false;
    this.isConnecting = false;
    this.messageHandlers.clear();
  }
  
  /**
   * Send data over the WebSocket connection
   */
  public send(data: WebSocketOutgoingMessage): void {
    if (!this.isConnected || !this.ws) {
      this.logger.warn('Cannot send message: WebSocket not connected');
      return;
    }
    
    try {
      const message = JSON.stringify(data);
      this.ws.send(message);
    } catch (error) {
      this.logger.error('Error sending WebSocket message', error);
    }
  }
  
  /**
   * Subscribe to a specific event or resource
   */
  public subscribe(type: string, resourceId: string, callback: (data: any) => void): () => void {
    const subscriptionId = `${type}:${resourceId}`;
    
    // Register message handler
    this.messageHandlers.set(subscriptionId, callback);
    
    // Store subscription for reconnection
    this.activeSubscriptions.set(subscriptionId, { type, resourceId, callback });
    
    // Send subscription request
    this.connect().then(() => {
      this.send({
        type: 'subscribe',
        version: this.protocolVersion,
        payload: { type, resourceId }
      });
    }).catch(error => {
      this.logger.error('Failed to subscribe', { error, type, resourceId });
    });
    
    // Return unsubscribe function
    return () => {
      this.messageHandlers.delete(subscriptionId);
      this.activeSubscriptions.delete(subscriptionId);
      
      if (this.isConnected) {
        this.send({
          type: 'unsubscribe',
          version: this.protocolVersion,
          payload: { type, resourceId }
        });
      }
    };
  }
  
  /**
   * Set connection timeout
   */
  private setConnectionTimeout(rejectCallback: (reason?: any) => void): void {
    this.clearConnectionTimeout();
    
    this.connectionTimeoutId = setTimeout(() => {
      this.logger.warn(`WebSocket connection timeout after ${this.connectionTimeoutMs}ms`);
      
      if (this.ws) {
        this.ws.close();
        this.ws = null;
      }
      
      this._isConnected = false;
      this.isConnecting = false;
      this.connectionTimeoutId = null;
      
      rejectCallback(new Error('WebSocket connection timeout'));
    }, this.connectionTimeoutMs);
  }
  
  /**
   * Clear connection timeout
   */
  private clearConnectionTimeout(): void {
    if (this.connectionTimeoutId) {
      clearTimeout(this.connectionTimeoutId);
      this.connectionTimeoutId = null;
    }
  }
  
  /**
   * Start heartbeat mechanism
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.lastPongTime = Date.now();
    
    this.pingIntervalId = setInterval(() => {
      if (!this.isConnected) {
        this.stopHeartbeat();
        return;
      }
      
      // Check if we've received a pong within the timeout period
      const timeSinceLastPong = Date.now() - this.lastPongTime;
      if (timeSinceLastPong > this.pongTimeoutMs) {
        this.logger.warn(`No pong received for ${timeSinceLastPong}ms, reconnecting...`);
        this.reconnectNow();
        return;
      }
      
      // Send ping
      this.send({
        type: 'ping',
        version: this.protocolVersion,
        payload: { timestamp: Date.now() }
      });
    }, this.pingIntervalMs);
  }
  
  /**
   * Stop heartbeat mechanism
   */
  private stopHeartbeat(): void {
    if (this.pingIntervalId) {
      clearInterval(this.pingIntervalId);
      this.pingIntervalId = null;
    }
  }
  
  /**
   * Immediately reconnect (used when heartbeat fails)
   */
  private reconnectNow(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    this._isConnected = false;
    this.isConnecting = false;
    
    // Force reconnect
    this.reconnect();
  }
  
  /**
   * Restore active subscriptions after reconnection
   */
  private restoreSubscriptions(): void {
    if (!this.isConnected) return;
    
    this.logger.debug(`Restoring ${this.activeSubscriptions.size} subscriptions`);
    
    for (const [subscriptionId, { type, resourceId }] of this.activeSubscriptions.entries()) {
      this.send({
        type: 'subscribe',
        version: this.protocolVersion,
        payload: { type, resourceId }
      });
    }
  }
  
  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(data: any): void {
    if (!data || !data.type) return;
    
    // Handle pong response
    if (data.type === 'pong') {
      this.lastPongTime = Date.now();
      return;
    }
    
    // Handle authentication response
    if (data.type === 'auth_response') {
      if (data.success) {
        this.logger.debug('WebSocket authentication successful');
      } else {
        this.logger.error('WebSocket authentication failed', data.error);
        this.disconnect();
      }
      return;
    }
    
    // Handle resource updates
    if (data.type === 'update' && data.resourceType && data.resourceId) {
      const subscriptionId = `${data.resourceType}:${data.resourceId}`;
      const handler = this.messageHandlers.get(subscriptionId);
      
      if (handler) {
        try {
          handler(data.payload);
        } catch (error) {
          this.logger.error('Error in subscription handler', { 
            error, 
            subscriptionId,
            resourceType: data.resourceType, 
            resourceId: data.resourceId 
          });
        }
      }
    }
  }
  
  /**
   * Attempt to reconnect with exponential backoff
   */
  private reconnect(): void {
    if (this.isConnecting || this.reconnectTimeoutId) {
      return;
    }
    
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.logger.warn(`Maximum reconnection attempts (${this.maxReconnectAttempts}) reached`);
      return;
    }
    
    const delay = Math.min(
      this.initialReconnectDelay * Math.pow(this.reconnectBackoffFactor, this.reconnectAttempts),
      this.maxReconnectDelay
    );
    
    // Add jitter to prevent thundering herd problem
    const jitteredDelay = delay * (0.8 + Math.random() * 0.4);
    
    this.logger.debug(`Reconnecting in ${Math.round(jitteredDelay)}ms (attempt ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`);
    
    this.reconnectTimeoutId = setTimeout(() => {
      this.reconnectTimeoutId = null;
      this.reconnectAttempts++;
      this.connect().catch(() => {});
    }, jitteredDelay);
  }
} 