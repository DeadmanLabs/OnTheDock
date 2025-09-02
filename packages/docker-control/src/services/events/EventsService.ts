import Docker from 'dockerode';
import debug from 'debug';
import { DockerClient } from '../../engine/DockerClient';
import { RealtimeEmitter } from '../../realtime/RealtimeEmitter';
import { 
  DockerEvent, 
  EventFilters, 
  EventFiltersSchema,
  EventType,
  EventAction
} from '../../models/events';
import { handleDockerodeError } from '../../errors/DockerErrors';

const log = debug('docker-control:events');

export interface EventStreamOptions {
  since?: number;
  until?: number;
  filters?: EventFilters;
}

export class EventsService {
  private docker: Docker;
  private client: DockerClient;
  private realtime: RealtimeEmitter;
  private eventStream: NodeJS.ReadableStream | null = null;
  private eventHandlers: Map<string, (event: DockerEvent) => void> = new Map();

  constructor(client: DockerClient, realtime: RealtimeEmitter) {
    this.client = client;
    this.docker = client.getDockerInstance();
    this.realtime = realtime;
  }

  async startEventStream(options?: EventStreamOptions): Promise<void> {
    try {
      if (this.eventStream) {
        log('Event stream already active');
        return;
      }

      const dockerOptions: any = {
        since: options?.since,
        until: options?.until
      };

      if (options?.filters) {
        const validatedFilters = EventFiltersSchema.parse(options.filters);
        dockerOptions.filters = JSON.stringify(validatedFilters);
      }

      this.eventStream = await this.docker.getEvents(dockerOptions);
      
      this.eventStream.on('data', (chunk: Buffer) => {
        try {
          const lines = chunk.toString().trim().split('\n');
          for (const line of lines) {
            if (line) {
              const event = JSON.parse(line) as DockerEvent;
              this.processEvent(event);
            }
          }
        } catch (error) {
          log('Error parsing event:', error);
        }
      });

      this.eventStream.on('error', (error) => {
        log('Event stream error:', error);
        this.realtime.emitRealtimeEvent({
          type: 'error',
          timestamp: new Date(),
          data: {
            error: error.message,
            source: 'events'
          }
        });
      });

      this.eventStream.on('end', () => {
        log('Event stream ended');
        this.eventStream = null;
      });

      log('Event stream started');
    } catch (error) {
      throw handleDockerodeError(error);
    }
  }

  async stopEventStream(): Promise<void> {
    if (this.eventStream) {
      this.eventStream.destroy();
      this.eventStream = null;
      log('Event stream stopped');
    }
  }

  onEvent(
    eventType: EventType | 'all',
    handler: (event: DockerEvent) => void
  ): string {
    const handlerId = `handler_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.eventHandlers.set(`${eventType}:${handlerId}`, handler);
    log(`Registered event handler: ${eventType}:${handlerId}`);
    return handlerId;
  }

  offEvent(handlerId: string): boolean {
    for (const [key] of this.eventHandlers.entries()) {
      if (key.includes(handlerId)) {
        this.eventHandlers.delete(key);
        log(`Removed event handler: ${key}`);
        return true;
      }
    }
    return false;
  }

  async getEvents(options?: EventStreamOptions): Promise<DockerEvent[]> {
    return new Promise((resolve, reject) => {
      const events: DockerEvent[] = [];
      
      const dockerOptions: any = {
        since: options?.since,
        until: options?.until || Math.floor(Date.now() / 1000)
      };

      if (options?.filters) {
        const validatedFilters = EventFiltersSchema.parse(options.filters);
        dockerOptions.filters = JSON.stringify(validatedFilters);
      }

      this.docker.getEvents(dockerOptions, (err, stream) => {
        if (err) {
          reject(handleDockerodeError(err));
          return;
        }

        if (!stream) {
          resolve(events);
          return;
        }

        const timeout = setTimeout(() => {
          stream.destroy();
          resolve(events);
        }, 5000); // 5 second timeout for historical events

        stream.on('data', (chunk: Buffer) => {
          try {
            const lines = chunk.toString().trim().split('\n');
            for (const line of lines) {
              if (line) {
                const event = JSON.parse(line) as DockerEvent;
                events.push(event);
              }
            }
          } catch (error) {
            log('Error parsing event:', error);
          }
        });

        stream.on('end', () => {
          clearTimeout(timeout);
          resolve(events);
        });

        stream.on('error', (error) => {
          clearTimeout(timeout);
          reject(handleDockerodeError(error));
        });
      });
    });
  }

  subscribeToContainer(
    containerId: string,
    handler: (event: DockerEvent) => void
  ): string {
    return this.onEvent('container', (event) => {
      if (event.actor.id === containerId || 
          event.actor.attributes?.container === containerId) {
        handler(event);
      }
    });
  }

  subscribeToImage(
    imageId: string,
    handler: (event: DockerEvent) => void
  ): string {
    return this.onEvent('image', (event) => {
      if (event.actor.id === imageId || 
          event.actor.attributes?.image === imageId) {
        handler(event);
      }
    });
  }

  subscribeToNetwork(
    networkId: string,
    handler: (event: DockerEvent) => void
  ): string {
    return this.onEvent('network', (event) => {
      if (event.actor.id === networkId) {
        handler(event);
      }
    });
  }

  subscribeToVolume(
    volumeName: string,
    handler: (event: DockerEvent) => void
  ): string {
    return this.onEvent('volume', (event) => {
      if (event.actor.id === volumeName) {
        handler(event);
      }
    });
  }

  private processEvent(event: DockerEvent): void {
    // Emit to realtime emitter
    this.realtime.emitRealtimeEvent({
      type: 'system.event',
      timestamp: new Date(event.time * 1000),
      data: event,
      metadata: {
        type: event.type,
        action: event.action,
        actorId: event.actor.id
      }
    });

    // Process type-specific handlers
    for (const [key, handler] of this.eventHandlers.entries()) {
      const [type] = key.split(':');
      if (type === 'all' || type === event.type) {
        try {
          handler(event);
        } catch (error) {
          log(`Error in event handler ${key}:`, error);
        }
      }
    }

    // Log significant events
    this.logSignificantEvent(event);
  }

  private logSignificantEvent(event: DockerEvent): void {
    const significantActions: EventAction[] = [
      'create', 'destroy', 'die', 'kill', 'oom', 
      'pause', 'unpause', 'restart', 'start', 'stop'
    ];

    if (significantActions.includes(event.action)) {
      log(`${event.type} ${event.action}: ${event.actor.id}`, 
          event.actor.attributes);
    }
  }

  isStreamActive(): boolean {
    return this.eventStream !== null;
  }

  getActiveHandlers(): string[] {
    return Array.from(this.eventHandlers.keys());
  }

  clearAllHandlers(): void {
    this.eventHandlers.clear();
    log('Cleared all event handlers');
  }

  async monitorHealth(
    onUnhealthy: (event: DockerEvent) => void
  ): string {
    return this.onEvent('container', (event) => {
      if (event.action === 'health_status' && 
          event.actor.attributes?.health_status === 'unhealthy') {
        onUnhealthy(event);
      }
    });
  }

  async getContainerEvents(
    containerId: string,
    options?: { since?: number; until?: number }
  ): Promise<DockerEvent[]> {
    const filters: EventFilters = {
      container: [containerId],
      type: ['container']
    };

    return this.getEvents({
      ...options,
      filters
    });
  }

  async getImageEvents(
    imageId: string,
    options?: { since?: number; until?: number }
  ): Promise<DockerEvent[]> {
    const filters: EventFilters = {
      image: [imageId],
      type: ['image']
    };

    return this.getEvents({
      ...options,
      filters
    });
  }
}