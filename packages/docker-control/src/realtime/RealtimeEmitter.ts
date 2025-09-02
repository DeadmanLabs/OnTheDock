import { EventEmitter } from 'events';
import debug from 'debug';

const log = debug('docker-control:realtime');

export type RealtimeEventType = 
  | 'container.status'
  | 'container.logs'
  | 'container.stats'
  | 'container.exec'
  | 'container.files'
  | 'image.pull'
  | 'image.build'
  | 'image.push'
  | 'image.remove'
  | 'system.event'
  | 'error';

export interface RealtimeEvent<T = any> {
  type: RealtimeEventType;
  timestamp: Date;
  containerId?: string;
  imageId?: string;
  data: T;
  metadata?: Record<string, any>;
}

export interface RealtimeSubscription {
  id: string;
  type: RealtimeEventType;
  filter?: (event: RealtimeEvent) => boolean;
  callback: (event: RealtimeEvent) => void;
}

export class RealtimeEmitter extends EventEmitter {
  private subscriptions: Map<string, RealtimeSubscription> = new Map();
  private eventBuffer: Map<string, RealtimeEvent[]> = new Map();
  private bufferSize: number = 100;
  private bufferTimeout: number = 60000; // 1 minute

  constructor(options?: { bufferSize?: number; bufferTimeout?: number }) {
    super();
    this.bufferSize = options?.bufferSize || this.bufferSize;
    this.bufferTimeout = options?.bufferTimeout || this.bufferTimeout;
    this.setupCleanup();
  }

  private setupCleanup(): void {
    setInterval(() => {
      const now = Date.now();
      for (const [key, events] of this.eventBuffer.entries()) {
        const filtered = events.filter(
          (e) => now - e.timestamp.getTime() < this.bufferTimeout
        );
        if (filtered.length === 0) {
          this.eventBuffer.delete(key);
        } else {
          this.eventBuffer.set(key, filtered);
        }
      }
    }, this.bufferTimeout);
  }

  emitRealtimeEvent<T = any>(event: RealtimeEvent<T>): void {
    log(`Emitting realtime event: ${event.type}`, event);
    
    // Buffer the event
    this.bufferEvent(event);
    
    // Emit to general listeners
    this.emit(event.type, event);
    
    // Emit to specific resource listeners
    if (event.containerId) {
      this.emit(`container:${event.containerId}:${event.type}`, event);
    }
    if (event.imageId) {
      this.emit(`image:${event.imageId}:${event.type}`, event);
    }
    
    // Process subscriptions
    for (const subscription of this.subscriptions.values()) {
      if (subscription.type === event.type) {
        if (!subscription.filter || subscription.filter(event)) {
          try {
            subscription.callback(event);
          } catch (error) {
            log(`Error in subscription callback: ${error}`);
          }
        }
      }
    }
  }

  private bufferEvent(event: RealtimeEvent): void {
    const key = event.containerId || event.imageId || 'global';
    const buffer = this.eventBuffer.get(key) || [];
    buffer.push(event);
    
    // Limit buffer size
    if (buffer.length > this.bufferSize) {
      buffer.shift();
    }
    
    this.eventBuffer.set(key, buffer);
  }

  subscribe(
    type: RealtimeEventType,
    callback: (event: RealtimeEvent) => void,
    filter?: (event: RealtimeEvent) => boolean
  ): string {
    const id = `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const subscription: RealtimeSubscription = {
      id,
      type,
      filter,
      callback
    };
    
    this.subscriptions.set(id, subscription);
    log(`Created subscription ${id} for ${type}`);
    
    return id;
  }

  unsubscribe(subscriptionId: string): boolean {
    const deleted = this.subscriptions.delete(subscriptionId);
    if (deleted) {
      log(`Removed subscription ${subscriptionId}`);
    }
    return deleted;
  }

  subscribeToContainer(
    containerId: string,
    callback: (event: RealtimeEvent) => void
  ): string {
    const listener = (event: RealtimeEvent) => {
      if (event.containerId === containerId) {
        callback(event);
      }
    };
    
    const types: RealtimeEventType[] = [
      'container.status',
      'container.logs',
      'container.stats',
      'container.exec',
      'container.files'
    ];
    
    types.forEach((type) => this.on(type, listener));
    
    const id = `container_${containerId}_${Date.now()}`;
    this.subscriptions.set(id, {
      id,
      type: 'container.status',
      filter: (e) => e.containerId === containerId,
      callback
    });
    
    return id;
  }

  subscribeToImage(
    imageId: string,
    callback: (event: RealtimeEvent) => void
  ): string {
    const listener = (event: RealtimeEvent) => {
      if (event.imageId === imageId) {
        callback(event);
      }
    };
    
    const types: RealtimeEventType[] = [
      'image.pull',
      'image.build',
      'image.push',
      'image.remove'
    ];
    
    types.forEach((type) => this.on(type, listener));
    
    const id = `image_${imageId}_${Date.now()}`;
    this.subscriptions.set(id, {
      id,
      type: 'image.pull',
      filter: (e) => e.imageId === imageId,
      callback
    });
    
    return id;
  }

  getBufferedEvents(
    resourceId?: string,
    type?: RealtimeEventType,
    limit?: number
  ): RealtimeEvent[] {
    const key = resourceId || 'global';
    const events = this.eventBuffer.get(key) || [];
    
    let filtered = events;
    if (type) {
      filtered = filtered.filter((e) => e.type === type);
    }
    
    if (limit && limit > 0) {
      filtered = filtered.slice(-limit);
    }
    
    return filtered;
  }

  clearBuffer(resourceId?: string): void {
    if (resourceId) {
      this.eventBuffer.delete(resourceId);
    } else {
      this.eventBuffer.clear();
    }
  }

  getActiveSubscriptions(): RealtimeSubscription[] {
    return Array.from(this.subscriptions.values());
  }

  removeAllSubscriptions(): void {
    this.subscriptions.clear();
    this.removeAllListeners();
    log('Removed all subscriptions and listeners');
  }
}