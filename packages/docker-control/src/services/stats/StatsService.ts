import Docker from 'dockerode';
import debug from 'debug';
import { DockerClient } from '../../engine/DockerClient';
import { RealtimeEmitter } from '../../realtime/RealtimeEmitter';
import { ContainerStats } from '../../models/container';
import { handleDockerodeError, NotFoundError } from '../../errors/DockerErrors';

const log = debug('docker-control:stats');

export interface StatsOptions {
  stream?: boolean;
  oneShot?: boolean;
}

export class StatsService {
  private docker: Docker;
  private client: DockerClient;
  private realtime: RealtimeEmitter;
  private activeStreams: Map<string, NodeJS.ReadableStream> = new Map();

  constructor(client: DockerClient, realtime: RealtimeEmitter) {
    this.client = client;
    this.docker = client.getDockerInstance();
    this.realtime = realtime;
  }

  async getStats(containerId: string, options?: StatsOptions): Promise<ContainerStats> {
    try {
      const container = this.docker.getContainer(containerId);
      
      const stats = await container.stats({ stream: false });
      
      return this.parseStats(stats, containerId);
    } catch (error: any) {
      if (error.statusCode === 404) {
        throw new NotFoundError('Container', containerId);
      }
      throw handleDockerodeError(error);
    }
  }

  async streamStats(
    containerId: string,
    onStats: (stats: ContainerStats) => void,
    options?: { interval?: number }
  ): Promise<() => void> {
    try {
      const container = this.docker.getContainer(containerId);
      
      const stream = await container.stats({ stream: true }) as NodeJS.ReadableStream;
      
      // Store stream reference
      this.activeStreams.set(containerId, stream);
      
      // Process stats stream
      let buffer = '';
      stream.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (line.trim()) {
            try {
              const rawStats = JSON.parse(line);
              const stats = this.parseStats(rawStats, containerId);
              
              // Call callback
              onStats(stats);
              
              // Emit realtime event
              this.realtime.emitRealtimeEvent({
                type: 'container.stats',
                timestamp: new Date(),
                containerId,
                data: stats
              });
            } catch (error) {
              log('Error parsing stats:', error);
            }
          }
        }
      });

      stream.on('error', (error) => {
        log(`Stats stream error for container ${containerId}:`, error);
        this.activeStreams.delete(containerId);
      });

      stream.on('end', () => {
        log(`Stats stream ended for container ${containerId}`);
        this.activeStreams.delete(containerId);
      });

      // Return cleanup function
      return () => {
        stream.destroy();
        this.activeStreams.delete(containerId);
        log(`Stopped stats stream for container: ${containerId}`);
      };
    } catch (error: any) {
      if (error.statusCode === 404) {
        throw new NotFoundError('Container', containerId);
      }
      throw handleDockerodeError(error);
    }
  }

  async getAllStats(): Promise<Map<string, ContainerStats>> {
    try {
      const containers = await this.docker.listContainers({ all: false });
      const statsMap = new Map<string, ContainerStats>();
      
      await Promise.all(
        containers.map(async (containerInfo) => {
          try {
            const stats = await this.getStats(containerInfo.Id);
            statsMap.set(containerInfo.Id, stats);
          } catch (error) {
            log(`Failed to get stats for container ${containerInfo.Id}:`, error);
          }
        })
      );
      
      return statsMap;
    } catch (error) {
      throw handleDockerodeError(error);
    }
  }

  async monitorStats(
    containerId: string,
    options?: {
      interval?: number;
      duration?: number;
      onThreshold?: (stats: ContainerStats, metric: string, value: number) => void;
      thresholds?: {
        cpuPercent?: number;
        memoryPercent?: number;
        memoryLimit?: number;
      };
    }
  ): Promise<{ stop: () => void; stats: ContainerStats[] }> {
    const statsHistory: ContainerStats[] = [];
    const interval = options?.interval || 1000;
    const duration = options?.duration;
    const startTime = Date.now();
    
    const stopStream = await this.streamStats(
      containerId,
      (stats) => {
        statsHistory.push(stats);
        
        // Check thresholds
        if (options?.onThreshold && options.thresholds) {
          if (options.thresholds.cpuPercent && 
              stats.cpu.percent > options.thresholds.cpuPercent) {
            options.onThreshold(stats, 'cpu', stats.cpu.percent);
          }
          
          if (options.thresholds.memoryPercent && 
              stats.memory.percent > options.thresholds.memoryPercent) {
            options.onThreshold(stats, 'memory_percent', stats.memory.percent);
          }
          
          if (options.thresholds.memoryLimit && 
              stats.memory.usage > options.thresholds.memoryLimit) {
            options.onThreshold(stats, 'memory_usage', stats.memory.usage);
          }
        }
        
        // Auto-stop after duration
        if (duration && Date.now() - startTime > duration) {
          stopStream();
        }
      },
      { interval }
    );
    
    return {
      stop: stopStream,
      stats: statsHistory
    };
  }

  stopStream(containerId: string): void {
    const stream = this.activeStreams.get(containerId);
    if (stream) {
      stream.destroy();
      this.activeStreams.delete(containerId);
      log(`Stopped stats stream for container: ${containerId}`);
    }
  }

  stopAllStreams(): void {
    for (const [id, stream] of this.activeStreams.entries()) {
      stream.destroy();
      this.activeStreams.delete(id);
    }
    log('Stopped all stats streams');
  }

  private parseStats(rawStats: any, containerId: string): ContainerStats {
    const stats = rawStats.stats || rawStats;
    
    // Calculate CPU percentage
    const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - 
                     (stats.precpu_stats.cpu_usage?.total_usage || 0);
    const systemDelta = stats.cpu_stats.system_cpu_usage - 
                        (stats.precpu_stats.system_cpu_usage || 0);
    const cpuPercent = systemDelta > 0 ? 
      (cpuDelta / systemDelta) * (stats.cpu_stats.online_cpus || 1) * 100 : 0;

    // Memory calculations
    const memoryUsage = stats.memory_stats.usage || 0;
    const memoryLimit = stats.memory_stats.limit || 0;
    const memoryPercent = memoryLimit > 0 ? (memoryUsage / memoryLimit) * 100 : 0;

    // Network stats (sum all interfaces)
    let rxBytes = 0;
    let txBytes = 0;
    let rxPackets = 0;
    let txPackets = 0;
    
    if (stats.networks) {
      for (const network of Object.values(stats.networks) as any[]) {
        rxBytes += network.rx_bytes || 0;
        txBytes += network.tx_bytes || 0;
        rxPackets += network.rx_packets || 0;
        txPackets += network.tx_packets || 0;
      }
    }

    // Block I/O stats
    let readBytes = 0;
    let writeBytes = 0;
    
    if (stats.blkio_stats?.io_service_bytes_recursive) {
      for (const io of stats.blkio_stats.io_service_bytes_recursive) {
        if (io.op === 'read' || io.op === 'Read') {
          readBytes += io.value || 0;
        } else if (io.op === 'write' || io.op === 'Write') {
          writeBytes += io.value || 0;
        }
      }
    }

    return {
      timestamp: new Date(stats.read || Date.now()),
      cpu: {
        usage: stats.cpu_stats.cpu_usage.total_usage || 0,
        system: stats.cpu_stats.system_cpu_usage || 0,
        percent: cpuPercent
      },
      memory: {
        usage: memoryUsage,
        limit: memoryLimit,
        percent: memoryPercent
      },
      network: {
        rxBytes,
        txBytes,
        rxPackets,
        txPackets
      },
      blockIO: {
        readBytes,
        writeBytes
      },
      pids: {
        current: stats.pids_stats?.current || 0,
        limit: stats.pids_stats?.limit
      }
    };
  }

  async getResourceUsage(containerId: string): Promise<{
    cpu: number;
    memory: number;
    network: { rx: number; tx: number };
    disk: { read: number; write: number };
  }> {
    const stats = await this.getStats(containerId);
    
    return {
      cpu: stats.cpu.percent,
      memory: stats.memory.usage,
      network: {
        rx: stats.network.rxBytes,
        tx: stats.network.txBytes
      },
      disk: {
        read: stats.blockIO.readBytes,
        write: stats.blockIO.writeBytes
      }
    };
  }

  getActiveStreams(): string[] {
    return Array.from(this.activeStreams.keys());
  }
}