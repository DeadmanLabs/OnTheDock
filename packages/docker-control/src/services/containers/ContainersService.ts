import Docker from 'dockerode';
import debug from 'debug';
import { DockerClient } from '../../engine/DockerClient';
import { RealtimeEmitter } from '../../realtime/RealtimeEmitter';
import { 
  ContainerSpec, 
  ContainerSpecSchema,
  ContainerInfo,
  ContainerStatus,
  PortMapping,
  Volume,
  ResourceLimits
} from '../../models/container';
import {
  handleDockerodeError,
  NotFoundError,
  ConflictError,
  ValidationError,
  TimeoutError
} from '../../errors/DockerErrors';
import { RetryHelper } from '../../utils/retry';

const log = debug('docker-control:containers');

export interface ContainerListOptions {
  all?: boolean;
  limit?: number;
  size?: boolean;
  filters?: {
    status?: ContainerStatus[];
    label?: string[];
    name?: string[];
    network?: string[];
    volume?: string[];
  };
}

export interface ContainerCreateOptions extends ContainerSpec {
  autoRemove?: boolean;
  attachStdin?: boolean;
  attachStdout?: boolean;
  attachStderr?: boolean;
  openStdin?: boolean;
  stdinOnce?: boolean;
  tty?: boolean;
}

export interface ContainerStartOptions {
  detachKeys?: string;
}

export interface ContainerStopOptions {
  timeout?: number;
}

export interface ContainerRemoveOptions {
  force?: boolean;
  removeVolumes?: boolean;
  removeLinks?: boolean;
}

export interface ContainerUpdateOptions {
  resources?: ResourceLimits;
  restartPolicy?: {
    name: 'no' | 'always' | 'unless-stopped' | 'on-failure';
    maximumRetryCount?: number;
  };
}

export class ContainersService {
  private docker: Docker;
  private client: DockerClient;
  private realtime: RealtimeEmitter;

  constructor(client: DockerClient, realtime: RealtimeEmitter) {
    this.client = client;
    this.docker = client.getDockerInstance();
    this.realtime = realtime;
  }

  async list(options?: ContainerListOptions): Promise<ContainerInfo[]> {
    try {
      const dockerOptions: Docker.ContainerListOptions = {
        all: options?.all,
        limit: options?.limit,
        size: options?.size
      };

      if (options?.filters) {
        dockerOptions.filters = JSON.stringify(options.filters);
      }

      const containers = await this.docker.listContainers(dockerOptions);
      
      return containers.map(this.mapContainerInfo);
    } catch (error) {
      throw handleDockerodeError(error);
    }
  }

  async create(options: ContainerCreateOptions): Promise<string> {
    try {
      // Validate the container spec
      const validatedSpec = ContainerSpecSchema.parse(options);

      const createOptions: Docker.ContainerCreateOptions = {
        name: validatedSpec.name,
        Image: `${validatedSpec.image}:${validatedSpec.tag}`,
        Cmd: validatedSpec.command,
        Entrypoint: validatedSpec.entrypoint,
        Env: this.formatEnv(validatedSpec.env),
        Labels: validatedSpec.labels,
        WorkingDir: validatedSpec.workingDir,
        User: validatedSpec.user,
        Hostname: validatedSpec.hostname,
        Domainname: validatedSpec.domainname,
        AttachStdin: options.attachStdin,
        AttachStdout: options.attachStdout,
        AttachStderr: options.attachStderr,
        OpenStdin: options.openStdin,
        StdinOnce: options.stdinOnce,
        Tty: options.tty,
        HostConfig: this.createHostConfig(validatedSpec, options)
      };

      const container = await this.docker.createContainer(createOptions);

      this.realtime.emitRealtimeEvent({
        type: 'container.status',
        timestamp: new Date(),
        containerId: container.id,
        data: {
          status: 'created',
          name: validatedSpec.name
        }
      });

      log(`Container created: ${container.id}`);
      return container.id;
    } catch (error: any) {
      if (error.statusCode === 409) {
        throw new ConflictError(`Container name '${options.name}' already in use`);
      }
      throw handleDockerodeError(error);
    }
  }

  async start(containerId: string, options?: ContainerStartOptions): Promise<void> {
    try {
      const container = this.docker.getContainer(containerId);
      
      await RetryHelper.withRetry(
        async () => {
          await container.start(options);
        },
        {
          retries: 3,
          shouldRetry: (error) => error.statusCode !== 404 && error.statusCode !== 304
        }
      );

      this.realtime.emitRealtimeEvent({
        type: 'container.status',
        timestamp: new Date(),
        containerId,
        data: { status: 'running' }
      });

      log(`Container started: ${containerId}`);
    } catch (error: any) {
      if (error.statusCode === 404) {
        throw new NotFoundError('Container', containerId);
      }
      if (error.statusCode === 304) {
        log(`Container already running: ${containerId}`);
        return;
      }
      throw handleDockerodeError(error);
    }
  }

  async stop(containerId: string, options?: ContainerStopOptions): Promise<void> {
    try {
      const container = this.docker.getContainer(containerId);
      const timeout = options?.timeout ?? 10;

      await container.stop({ t: timeout });

      this.realtime.emitRealtimeEvent({
        type: 'container.status',
        timestamp: new Date(),
        containerId,
        data: { status: 'stopped' }
      });

      log(`Container stopped: ${containerId}`);
    } catch (error: any) {
      if (error.statusCode === 404) {
        throw new NotFoundError('Container', containerId);
      }
      if (error.statusCode === 304) {
        log(`Container already stopped: ${containerId}`);
        return;
      }
      throw handleDockerodeError(error);
    }
  }

  async restart(containerId: string, options?: { timeout?: number }): Promise<void> {
    try {
      const container = this.docker.getContainer(containerId);
      await container.restart({ t: options?.timeout ?? 10 });

      this.realtime.emitRealtimeEvent({
        type: 'container.status',
        timestamp: new Date(),
        containerId,
        data: { status: 'restarting' }
      });

      log(`Container restarted: ${containerId}`);
    } catch (error: any) {
      if (error.statusCode === 404) {
        throw new NotFoundError('Container', containerId);
      }
      throw handleDockerodeError(error);
    }
  }

  async pause(containerId: string): Promise<void> {
    try {
      const container = this.docker.getContainer(containerId);
      await container.pause();

      this.realtime.emitRealtimeEvent({
        type: 'container.status',
        timestamp: new Date(),
        containerId,
        data: { status: 'paused' }
      });

      log(`Container paused: ${containerId}`);
    } catch (error: any) {
      if (error.statusCode === 404) {
        throw new NotFoundError('Container', containerId);
      }
      throw handleDockerodeError(error);
    }
  }

  async unpause(containerId: string): Promise<void> {
    try {
      const container = this.docker.getContainer(containerId);
      await container.unpause();

      this.realtime.emitRealtimeEvent({
        type: 'container.status',
        timestamp: new Date(),
        containerId,
        data: { status: 'running' }
      });

      log(`Container unpaused: ${containerId}`);
    } catch (error: any) {
      if (error.statusCode === 404) {
        throw new NotFoundError('Container', containerId);
      }
      throw handleDockerodeError(error);
    }
  }

  async kill(containerId: string, signal?: string): Promise<void> {
    try {
      const container = this.docker.getContainer(containerId);
      await container.kill({ signal });

      this.realtime.emitRealtimeEvent({
        type: 'container.status',
        timestamp: new Date(),
        containerId,
        data: { status: 'dead' }
      });

      log(`Container killed: ${containerId}`);
    } catch (error: any) {
      if (error.statusCode === 404) {
        throw new NotFoundError('Container', containerId);
      }
      throw handleDockerodeError(error);
    }
  }

  async remove(containerId: string, options?: ContainerRemoveOptions): Promise<void> {
    try {
      const container = this.docker.getContainer(containerId);
      
      await container.remove({
        force: options?.force,
        v: options?.removeVolumes,
        link: options?.removeLinks
      });

      this.realtime.emitRealtimeEvent({
        type: 'container.status',
        timestamp: new Date(),
        containerId,
        data: { status: 'removed' }
      });

      log(`Container removed: ${containerId}`);
    } catch (error: any) {
      if (error.statusCode === 404) {
        throw new NotFoundError('Container', containerId);
      }
      if (error.statusCode === 409) {
        throw new ConflictError('Container is running and cannot be removed without force option');
      }
      throw handleDockerodeError(error);
    }
  }

  async inspect(containerId: string): Promise<Docker.ContainerInspectInfo> {
    try {
      const container = this.docker.getContainer(containerId);
      const info = await container.inspect();
      return info;
    } catch (error: any) {
      if (error.statusCode === 404) {
        throw new NotFoundError('Container', containerId);
      }
      throw handleDockerodeError(error);
    }
  }

  async update(containerId: string, options: ContainerUpdateOptions): Promise<void> {
    try {
      const container = this.docker.getContainer(containerId);
      
      const updateOptions: any = {};
      
      if (options.resources) {
        if (options.resources.cpu) {
          updateOptions.CpuShares = options.resources.cpu.shares;
          updateOptions.CpuPeriod = options.resources.cpu.period;
          updateOptions.CpuQuota = options.resources.cpu.quota;
          updateOptions.CpusetCpus = options.resources.cpu.cpuset;
        }
        if (options.resources.memory) {
          updateOptions.Memory = options.resources.memory.limit;
          updateOptions.MemoryReservation = options.resources.memory.reservation;
          updateOptions.MemorySwap = options.resources.memory.swap;
        }
        if (options.resources.pids) {
          updateOptions.PidsLimit = options.resources.pids.limit;
        }
      }
      
      if (options.restartPolicy) {
        updateOptions.RestartPolicy = {
          Name: options.restartPolicy.name,
          MaximumRetryCount: options.restartPolicy.maximumRetryCount
        };
      }

      await container.update(updateOptions);

      this.realtime.emitRealtimeEvent({
        type: 'container.status',
        timestamp: new Date(),
        containerId,
        data: { 
          status: 'updated',
          updates: options
        }
      });

      log(`Container updated: ${containerId}`);
    } catch (error: any) {
      if (error.statusCode === 404) {
        throw new NotFoundError('Container', containerId);
      }
      throw handleDockerodeError(error);
    }
  }

  async rename(containerId: string, newName: string): Promise<void> {
    try {
      const container = this.docker.getContainer(containerId);
      await container.rename({ name: newName });

      log(`Container renamed: ${containerId} -> ${newName}`);
    } catch (error: any) {
      if (error.statusCode === 404) {
        throw new NotFoundError('Container', containerId);
      }
      if (error.statusCode === 409) {
        throw new ConflictError(`Name '${newName}' is already in use`);
      }
      throw handleDockerodeError(error);
    }
  }

  async prune(options?: { until?: string; label?: string[] }): Promise<{ ContainersDeleted: string[]; SpaceReclaimed: number }> {
    try {
      const filters: any = {};
      if (options?.until) {
        filters.until = [options.until];
      }
      if (options?.label) {
        filters.label = options.label;
      }

      const result = await this.docker.pruneContainers({ filters: JSON.stringify(filters) });
      
      log(`Pruned containers: ${result.ContainersDeleted?.length || 0} removed, ${result.SpaceReclaimed || 0} bytes reclaimed`);
      
      return {
        ContainersDeleted: result.ContainersDeleted || [],
        SpaceReclaimed: result.SpaceReclaimed || 0
      };
    } catch (error) {
      throw handleDockerodeError(error);
    }
  }

  async wait(containerId: string, condition?: 'not-running' | 'next-exit' | 'removed'): Promise<number> {
    try {
      const container = this.docker.getContainer(containerId);
      const result = await container.wait({ condition });
      return result.StatusCode;
    } catch (error: any) {
      if (error.statusCode === 404) {
        throw new NotFoundError('Container', containerId);
      }
      throw handleDockerodeError(error);
    }
  }

  private formatEnv(env?: Record<string, string>): string[] | undefined {
    if (!env) return undefined;
    return Object.entries(env).map(([key, value]) => `${key}=${value}`);
  }

  private createHostConfig(spec: ContainerSpec, options: ContainerCreateOptions): Docker.HostConfig {
    const hostConfig: Docker.HostConfig = {
      AutoRemove: options.autoRemove,
      Privileged: spec.privileged,
      ReadonlyRootfs: spec.readonlyRootfs,
      NetworkMode: spec.networkMode,
      PortBindings: this.createPortBindings(spec.ports),
      Binds: this.createBinds(spec.volumes),
      RestartPolicy: spec.restartPolicy ? {
        Name: spec.restartPolicy.name as any,
        MaximumRetryCount: spec.restartPolicy.maximumRetryCount
      } : undefined,
      CapAdd: spec.capabilities?.add,
      CapDrop: spec.capabilities?.drop,
      SecurityOpt: spec.securityOpt,
      Dns: spec.dns,
      DnsSearch: spec.dnsSearch,
      ExtraHosts: spec.extraHosts
    };

    // Add resource limits
    if (spec.resources) {
      if (spec.resources.cpu) {
        hostConfig.CpuShares = spec.resources.cpu.shares;
        hostConfig.CpuPeriod = spec.resources.cpu.period;
        hostConfig.CpuQuota = spec.resources.cpu.quota;
        hostConfig.CpusetCpus = spec.resources.cpu.cpuset;
      }
      if (spec.resources.memory) {
        hostConfig.Memory = spec.resources.memory.limit;
        hostConfig.MemoryReservation = spec.resources.memory.reservation;
        hostConfig.MemorySwap = spec.resources.memory.swap;
      }
      if (spec.resources.pids) {
        hostConfig.PidsLimit = spec.resources.pids.limit;
      }
      if (spec.resources.ulimits) {
        hostConfig.Ulimits = spec.resources.ulimits.map(u => ({
          Name: u.name,
          Soft: u.soft,
          Hard: u.hard
        }));
      }
    }

    return hostConfig;
  }

  private createPortBindings(ports?: PortMapping[]): Docker.PortMap | undefined {
    if (!ports || ports.length === 0) return undefined;

    const portBindings: Docker.PortMap = {};
    for (const port of ports) {
      const containerPort = `${port.containerPort}/${port.protocol}`;
      portBindings[containerPort] = [{
        HostPort: port.hostPort?.toString(),
        HostIp: port.hostIp
      }];
    }
    return portBindings;
  }

  private createBinds(volumes?: Volume[]): string[] | undefined {
    if (!volumes) return undefined;
    
    return volumes
      .filter(v => v.type === 'bind' || v.type === 'volume')
      .map(v => {
        const bind = `${v.source}:${v.target}`;
        return v.readOnly ? `${bind}:ro` : bind;
      });
  }

  private mapContainerInfo(container: Docker.ContainerInfo): ContainerInfo {
    return {
      id: container.Id,
      name: container.Names[0]?.replace(/^\//, '') || '',
      image: container.Image,
      imageId: container.ImageID,
      command: container.Command,
      created: new Date(container.Created * 1000),
      state: container.State as ContainerStatus,
      status: container.Status,
      ports: container.Ports?.map(p => ({
        containerPort: p.PrivatePort,
        hostPort: p.PublicPort,
        protocol: p.Type as 'tcp' | 'udp',
        hostIp: p.IP
      })) || [],
      labels: container.Labels || {},
      mounts: container.Mounts?.map(m => ({
        type: m.Type as 'bind' | 'volume' | 'tmpfs',
        source: m.Source || '',
        target: m.Destination,
        readOnly: m.RW === false
      })) || [],
      networks: container.NetworkSettings?.Networks || {}
    };
  }
}