import Docker from 'dockerode';
import debug from 'debug';
import { DockerClient } from '../../engine/DockerClient';
import { DockerEngineInfo, DockerVersion } from '../../engine/types';
import { handleDockerodeError } from '../../errors/DockerErrors';

const log = debug('docker-control:system');

export interface DiskUsage {
  layersSize: number;
  images: Array<{
    id: string;
    repoTags: string[];
    size: number;
    sharedSize: number;
    containers: number;
  }>;
  containers: Array<{
    id: string;
    names: string[];
    image: string;
    state: string;
    sizeRw: number;
    sizeRootFs: number;
  }>;
  volumes: Array<{
    name: string;
    driver: string;
    mountpoint: string;
    size: number;
    refCount: number;
  }>;
  buildCache: Array<{
    id: string;
    type: string;
    size: number;
    createdAt: string;
    lastUsedAt: string;
    usageCount: number;
    inUse: boolean;
    shared: boolean;
  }>;
}

export interface SystemDataUsage {
  totalSize: number;
  images: {
    count: number;
    size: number;
    active: number;
    reclaimable: number;
  };
  containers: {
    count: number;
    running: number;
    paused: number;
    stopped: number;
    size: number;
    reclaimable: number;
  };
  volumes: {
    count: number;
    active: number;
    size: number;
    reclaimable: number;
  };
  buildCache: {
    count: number;
    size: number;
    active: number;
    reclaimable: number;
  };
}

export class SystemService {
  private docker: Docker;
  private client: DockerClient;

  constructor(client: DockerClient) {
    this.client = client;
    this.docker = client.getDockerInstance();
  }

  async getInfo(): Promise<DockerEngineInfo> {
    try {
      return await this.client.getInfo();
    } catch (error) {
      throw handleDockerodeError(error);
    }
  }

  async getVersion(): Promise<DockerVersion> {
    try {
      return await this.client.getVersion();
    } catch (error) {
      throw handleDockerodeError(error);
    }
  }

  async getDiskUsage(): Promise<DiskUsage> {
    try {
      const df = await this.docker.df();
      
      return {
        layersSize: df.LayersSize || 0,
        images: (df.Images || []).map((img: any) => ({
          id: img.Id,
          repoTags: img.RepoTags || [],
          size: img.Size || 0,
          sharedSize: img.SharedSize || 0,
          containers: img.Containers || 0
        })),
        containers: (df.Containers || []).map((cont: any) => ({
          id: cont.Id,
          names: cont.Names || [],
          image: cont.Image,
          state: cont.State,
          sizeRw: cont.SizeRw || 0,
          sizeRootFs: cont.SizeRootFs || 0
        })),
        volumes: (df.Volumes || []).map((vol: any) => ({
          name: vol.Name,
          driver: vol.Driver,
          mountpoint: vol.Mountpoint,
          size: vol.Size || -1,
          refCount: vol.RefCount || 0
        })),
        buildCache: (df.BuildCache || []).map((cache: any) => ({
          id: cache.ID,
          type: cache.Type,
          size: cache.Size || 0,
          createdAt: cache.CreatedAt,
          lastUsedAt: cache.LastUsedAt,
          usageCount: cache.UsageCount || 0,
          inUse: cache.InUse || false,
          shared: cache.Shared || false
        }))
      };
    } catch (error) {
      throw handleDockerodeError(error);
    }
  }

  async getDataUsageSummary(): Promise<SystemDataUsage> {
    try {
      const usage = await this.getDiskUsage();
      
      // Calculate images statistics
      const imageStats = {
        count: usage.images.length,
        size: usage.images.reduce((sum, img) => sum + img.size, 0),
        active: usage.images.filter(img => img.containers > 0).length,
        reclaimable: usage.images
          .filter(img => img.containers === 0)
          .reduce((sum, img) => sum + img.size, 0)
      };

      // Calculate container statistics
      const containerStats = {
        count: usage.containers.length,
        running: usage.containers.filter(c => c.state === 'running').length,
        paused: usage.containers.filter(c => c.state === 'paused').length,
        stopped: usage.containers.filter(c => c.state === 'exited').length,
        size: usage.containers.reduce((sum, c) => sum + c.sizeRw + c.sizeRootFs, 0),
        reclaimable: usage.containers
          .filter(c => c.state === 'exited')
          .reduce((sum, c) => sum + c.sizeRw, 0)
      };

      // Calculate volume statistics
      const volumeStats = {
        count: usage.volumes.length,
        active: usage.volumes.filter(v => v.refCount > 0).length,
        size: usage.volumes.reduce((sum, v) => sum + (v.size > 0 ? v.size : 0), 0),
        reclaimable: usage.volumes
          .filter(v => v.refCount === 0)
          .reduce((sum, v) => sum + (v.size > 0 ? v.size : 0), 0)
      };

      // Calculate build cache statistics
      const cacheStats = {
        count: usage.buildCache.length,
        size: usage.buildCache.reduce((sum, c) => sum + c.size, 0),
        active: usage.buildCache.filter(c => c.inUse).length,
        reclaimable: usage.buildCache
          .filter(c => !c.inUse)
          .reduce((sum, c) => sum + c.size, 0)
      };

      const totalSize = imageStats.size + containerStats.size + 
                       volumeStats.size + cacheStats.size;

      return {
        totalSize,
        images: imageStats,
        containers: containerStats,
        volumes: volumeStats,
        buildCache: cacheStats
      };
    } catch (error) {
      throw handleDockerodeError(error);
    }
  }

  async ping(): Promise<boolean> {
    try {
      return await this.client.ping();
    } catch (error) {
      return false;
    }
  }

  async pruneAll(options?: {
    containers?: boolean;
    images?: boolean;
    volumes?: boolean;
    networks?: boolean;
    buildCache?: boolean;
  }): Promise<{
    containersDeleted: string[];
    imagesDeleted: string[];
    volumesDeleted: string[];
    networksDeleted: string[];
    buildCacheDeleted: string[];
    spaceReclaimed: number;
  }> {
    const results = {
      containersDeleted: [] as string[],
      imagesDeleted: [] as string[],
      volumesDeleted: [] as string[],
      networksDeleted: [] as string[],
      buildCacheDeleted: [] as string[],
      spaceReclaimed: 0
    };

    try {
      // Prune containers
      if (options?.containers !== false) {
        const containerResult = await this.docker.pruneContainers();
        results.containersDeleted = containerResult.ContainersDeleted || [];
        results.spaceReclaimed += containerResult.SpaceReclaimed || 0;
        log(`Pruned ${results.containersDeleted.length} containers`);
      }

      // Prune images
      if (options?.images !== false) {
        const imageResult = await this.docker.pruneImages();
        results.imagesDeleted = (imageResult.ImagesDeleted || [])
          .map((img: any) => img.Deleted || img.Untagged)
          .filter(Boolean);
        results.spaceReclaimed += imageResult.SpaceReclaimed || 0;
        log(`Pruned ${results.imagesDeleted.length} images`);
      }

      // Prune volumes
      if (options?.volumes) {
        const volumeResult = await this.docker.pruneVolumes();
        results.volumesDeleted = volumeResult.VolumesDeleted || [];
        results.spaceReclaimed += volumeResult.SpaceReclaimed || 0;
        log(`Pruned ${results.volumesDeleted.length} volumes`);
      }

      // Prune networks
      if (options?.networks) {
        const networkResult = await this.docker.pruneNetworks();
        results.networksDeleted = networkResult.NetworksDeleted || [];
        log(`Pruned ${results.networksDeleted.length} networks`);
      }

      // Prune build cache
      if (options?.buildCache) {
        const cacheResult = await this.docker.pruneBuildCache();
        results.buildCacheDeleted = cacheResult.CachesDeleted || [];
        results.spaceReclaimed += cacheResult.SpaceReclaimed || 0;
        log(`Pruned ${results.buildCacheDeleted.length} build cache entries`);
      }

      log(`Total space reclaimed: ${this.formatBytes(results.spaceReclaimed)}`);
      return results;
    } catch (error) {
      throw handleDockerodeError(error);
    }
  }

  async getSystemResources(): Promise<{
    cpu: {
      cores: number;
      architecture: string;
    };
    memory: {
      total: number;
      available: number;
      used: number;
      percentage: number;
    };
    storage: {
      driver: string;
      rootDir: string;
      layersSize: number;
    };
    containers: {
      total: number;
      running: number;
      paused: number;
      stopped: number;
    };
    images: {
      total: number;
      size: number;
    };
  }> {
    try {
      const info = await this.getInfo();
      const df = await this.getDiskUsage();
      
      const memUsed = info.MemTotal - (info as any).MemAvailable;
      const memPercentage = (memUsed / info.MemTotal) * 100;

      return {
        cpu: {
          cores: info.NCPU,
          architecture: info.Architecture
        },
        memory: {
          total: info.MemTotal,
          available: (info as any).MemAvailable || 0,
          used: memUsed,
          percentage: memPercentage
        },
        storage: {
          driver: info.Driver,
          rootDir: info.DockerRootDir,
          layersSize: df.layersSize
        },
        containers: {
          total: info.Containers,
          running: info.ContainersRunning,
          paused: info.ContainersPaused,
          stopped: info.ContainersStopped
        },
        images: {
          total: info.Images,
          size: df.images.reduce((sum, img) => sum + img.size, 0)
        }
      };
    } catch (error) {
      throw handleDockerodeError(error);
    }
  }

  async getDockerConfig(): Promise<{
    version: string;
    apiVersion: string;
    os: string;
    kernelVersion: string;
    goVersion: string;
    experimental: boolean;
    registryConfig: any;
    swarm: any;
    runtimes: any;
    defaultRuntime: string;
    liveRestore: boolean;
    isolation: string;
    initBinary: string;
    securityOptions: string[];
  }> {
    try {
      const [version, info] = await Promise.all([
        this.getVersion(),
        this.getInfo()
      ]);

      return {
        version: version.Version,
        apiVersion: version.ApiVersion,
        os: info.OperatingSystem,
        kernelVersion: info.KernelVersion,
        goVersion: version.GoVersion,
        experimental: info.ExperimentalBuild,
        registryConfig: info.RegistryConfig,
        swarm: info.Swarm,
        runtimes: info.Runtimes,
        defaultRuntime: info.DefaultRuntime,
        liveRestore: info.LiveRestoreEnabled,
        isolation: info.Isolation,
        initBinary: info.InitBinary,
        securityOptions: info.SecurityOptions
      };
    } catch (error) {
      throw handleDockerodeError(error);
    }
  }

  private formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }
}