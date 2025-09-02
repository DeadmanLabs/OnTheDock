export { DockerClient } from './engine/DockerClient';
export * from './engine/types';

export { RealtimeEmitter } from './realtime/RealtimeEmitter';
export type { RealtimeEvent, RealtimeEventType, RealtimeSubscription } from './realtime/RealtimeEmitter';

export { ContainersService } from './services/containers/ContainersService';
export { ImagesService } from './services/images/ImagesService';
export { LogsService } from './services/logs/LogsService';
export { EventsService } from './services/events/EventsService';
export { ExecService } from './services/exec/ExecService';
export { FilesService } from './services/files/FilesService';
export { StatsService } from './services/stats/StatsService';
export { SystemService } from './services/system/SystemService';

export * from './models';
export * from './errors/DockerErrors';
export * from './utils';

import { DockerClient } from './engine/DockerClient';
import { DockerClientOptions } from './engine/types';
import { RealtimeEmitter } from './realtime/RealtimeEmitter';
import { ContainersService } from './services/containers/ContainersService';
import { ImagesService } from './services/images/ImagesService';
import { LogsService } from './services/logs/LogsService';
import { EventsService } from './services/events/EventsService';
import { ExecService } from './services/exec/ExecService';
import { FilesService } from './services/files/FilesService';
import { StatsService } from './services/stats/StatsService';
import { SystemService } from './services/system/SystemService';

export interface DockerControlOptions extends DockerClientOptions {
  realtime?: {
    bufferSize?: number;
    bufferTimeout?: number;
  };
}

export class DockerControl {
  public readonly client: DockerClient;
  public readonly realtime: RealtimeEmitter;
  public readonly containers: ContainersService;
  public readonly images: ImagesService;
  public readonly logs: LogsService;
  public readonly events: EventsService;
  public readonly exec: ExecService;
  public readonly files: FilesService;
  public readonly stats: StatsService;
  public readonly system: SystemService;

  constructor(options?: DockerControlOptions) {
    this.client = new DockerClient(options);
    this.realtime = new RealtimeEmitter(options?.realtime);
    
    this.containers = new ContainersService(this.client, this.realtime);
    this.images = new ImagesService(this.client, this.realtime);
    this.logs = new LogsService(this.client, this.realtime);
    this.events = new EventsService(this.client, this.realtime);
    this.exec = new ExecService(this.client, this.realtime);
    this.files = new FilesService(this.client, this.realtime);
    this.stats = new StatsService(this.client, this.realtime);
    this.system = new SystemService(this.client);
  }

  async connect(): Promise<void> {
    await this.client.connect();
    await this.events.startEventStream();
  }

  async disconnect(): Promise<void> {
    await this.events.stopEventStream();
    this.logs.stopAllStreams();
    this.stats.stopAllStreams();
    await this.client.disconnect();
  }

  async isConnected(): Promise<boolean> {
    return this.client.isConnected();
  }

  async testConnection(): Promise<{ success: boolean; info?: any; error?: string }> {
    return this.client.testConnection();
  }
}

export default DockerControl;