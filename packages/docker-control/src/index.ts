import Docker from 'dockerode';
import { EventEmitter } from 'events';
import * as tar from 'tar-stream';

/**
 * OnTheDock - Simple, powerful Docker management library
 */
export class DockerControl extends EventEmitter {
  private docker: Docker;

  constructor(options?: Docker.DockerOptions) {
    super();
    this.docker = new Docker(options || { socketPath: '/var/run/docker.sock' });
  }

  /**
   * Container Management
   */
  containers = {
    /**
     * List all containers
     */
    list: async (all = true) => {
      const containers = await this.docker.listContainers({ all });
      return containers.map(container => ({
        id: container.Id,
        name: container.Names[0]?.replace('/', ''),
        image: container.Image,
        state: container.State,
        status: container.Status,
        created: container.Created,
        ports: container.Ports || []
      }));
    },

    /**
     * Get container by ID
     */
    get: async (id: string) => {
      const container = this.docker.getContainer(id);
      const info = await container.inspect();
      return {
        id: info.Id,
        name: info.Name.replace('/', ''),
        image: info.Config.Image,
        state: info.State,
        created: info.Created,
        config: info.Config,
        hostConfig: info.HostConfig
      };
    },

    /**
     * Create a new container
     */
    create: async (options: {
      image: string;
      name?: string;
      ports?: string[];
      env?: Record<string, string>;
      volumes?: string[];
      cmd?: string[];
    }) => {
      const createOptions: Docker.ContainerCreateOptions = {
        Image: options.image,
        name: options.name,
        Cmd: options.cmd,
        Env: options.env ? Object.entries(options.env).map(([k, v]) => `${k}=${v}`) : undefined,
        ExposedPorts: {},
        HostConfig: {
          PortBindings: {},
          Binds: options.volumes
        }
      };

      // Parse port mappings (e.g., "8080:80")
      if (options.ports) {
        options.ports.forEach(port => {
          const [hostPort, containerPort] = port.split(':');
          const containerPortTcp = `${containerPort}/tcp`;
          createOptions.ExposedPorts![containerPortTcp] = {};
          createOptions.HostConfig!.PortBindings![containerPortTcp] = [{ HostPort: hostPort }];
        });
      }

      const container = await this.docker.createContainer(createOptions);
      return container.id;
    },

    /**
     * Start a container
     */
    start: async (id: string) => {
      const container = this.docker.getContainer(id);
      await container.start();
      return { success: true };
    },

    /**
     * Stop a container
     */
    stop: async (id: string) => {
      const container = this.docker.getContainer(id);
      await container.stop();
      return { success: true };
    },

    /**
     * Restart a container
     */
    restart: async (id: string) => {
      const container = this.docker.getContainer(id);
      await container.restart();
      return { success: true };
    },

    /**
     * Remove a container
     */
    remove: async (id: string, force = false) => {
      const container = this.docker.getContainer(id);
      await container.remove({ force });
      return { success: true };
    }
  };

  /**
   * Image Management
   */
  images = {
    /**
     * List all images
     */
    list: async () => {
      const images = await this.docker.listImages();
      return images.map(image => ({
        id: image.Id,
        tags: image.RepoTags || [],
        size: image.Size,
        created: image.Created
      }));
    },

    /**
     * Pull an image
     */
    pull: async (image: string, onProgress?: (event: any) => void) => {
      return new Promise<void>((resolve, reject) => {
        this.docker.pull(image, (err: any, stream: NodeJS.ReadableStream) => {
          if (err) return reject(err);
          
          this.docker.modem.followProgress(stream, (err: any, output: any) => {
            if (err) return reject(err);
            resolve();
          }, onProgress);
        });
      });
    },

    /**
     * Remove an image
     */
    remove: async (id: string, force = false) => {
      const image = this.docker.getImage(id);
      await image.remove({ force });
      return { success: true };
    }
  };

  /**
   * Container Logs
   */
  logs = {
    /**
     * Get container logs
     */
    get: async (id: string, options?: { tail?: number; timestamps?: boolean }) => {
      const container = this.docker.getContainer(id);
      const containerInfo = await container.inspect();
      const isTTY = containerInfo.Config.Tty;
      
      const logStream = await container.logs({
        stdout: true,
        stderr: true,
        tail: options?.tail || 100,
        timestamps: options?.timestamps || false,
        follow: false
      });

      // Decode Docker multiplexed stream if not TTY
      if (Buffer.isBuffer(logStream)) {
        if (isTTY) {
          return logStream.toString('utf8');
        } else {
          return this.decodeDockerStream(logStream);
        }
      }
      
      return '';
    },

    /**
     * Stream container logs
     */
    stream: async (id: string, onData: (data: string) => void, options?: { tail?: number }) => {
      const container = this.docker.getContainer(id);
      const containerInfo = await container.inspect();
      const isTTY = containerInfo.Config.Tty;
      
      const logStream = await container.logs({
        stdout: true,
        stderr: true,
        tail: options?.tail || 100,
        timestamps: true,
        follow: true
      });

      if (isTTY) {
        logStream.on('data', (chunk: Buffer) => {
          onData(chunk.toString('utf8'));
        });
      } else {
        // Handle multiplexed stream
        logStream.on('data', (chunk: Buffer) => {
          const decoded = this.decodeDockerStream(chunk);
          if (decoded) onData(decoded);
        });
      }

      return logStream;
    }
  };

  /**
   * Container Stats
   */
  stats = {
    /**
     * Get container stats
     */
    get: async (id: string) => {
      const container = this.docker.getContainer(id);
      const stats = await container.stats({ stream: false });
      
      const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
      const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
      const cpuPercent = (cpuDelta / systemDelta) * stats.cpu_stats.online_cpus * 100;
      
      const memUsage = stats.memory_stats.usage || 0;
      const memLimit = stats.memory_stats.limit || 1;
      const memPercent = (memUsage / memLimit) * 100;
      
      return {
        cpu: { percent: cpuPercent.toFixed(2) },
        memory: { 
          usage: memUsage,
          limit: memLimit,
          percent: memPercent.toFixed(2)
        },
        network: {
          rx: stats.networks?.eth0?.rx_bytes || 0,
          tx: stats.networks?.eth0?.tx_bytes || 0
        }
      };
    },

    /**
     * Stream container stats
     */
    stream: async (id: string, onData: (stats: any) => void) => {
      const container = this.docker.getContainer(id);
      const stream = await container.stats({ stream: true });
      
      stream.on('data', (chunk: Buffer) => {
        try {
          const stats = JSON.parse(chunk.toString());
          const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
          const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
          const cpuPercent = (cpuDelta / systemDelta) * stats.cpu_stats.online_cpus * 100;
          
          const memUsage = stats.memory_stats.usage || 0;
          const memLimit = stats.memory_stats.limit || 1;
          const memPercent = (memUsage / memLimit) * 100;
          
          onData({
            cpu: { percent: cpuPercent.toFixed(2) },
            memory: { 
              usage: memUsage,
              limit: memLimit,
              percent: memPercent.toFixed(2)
            },
            network: {
              rx: stats.networks?.eth0?.rx_bytes || 0,
              tx: stats.networks?.eth0?.tx_bytes || 0
            }
          });
        } catch (e) {
          // Ignore parse errors
        }
      });
      
      return stream;
    }
  };

  /**
   * Container Exec
   */
  exec = {
    /**
     * Create an exec instance
     */
    create: async (id: string, options: {
      cmd: string[];
      attachStdin?: boolean;
      attachStdout?: boolean;
      attachStderr?: boolean;
      tty?: boolean;
      workingDir?: string;
      env?: string[];
    }) => {
      const container = this.docker.getContainer(id);
      const exec = await container.exec({
        Cmd: options.cmd,
        AttachStdin: options.attachStdin || false,
        AttachStdout: options.attachStdout || true,
        AttachStderr: options.attachStderr || true,
        Tty: options.tty || false,
        WorkingDir: options.workingDir,
        Env: options.env
      });
      return exec.id;
    },

    /**
     * Start an exec instance
     */
    start: async (execId: string, options?: { hijack?: boolean; stdin?: boolean }) => {
      const exec = this.docker.getExec(execId);
      const stream = await exec.start({
        hijack: options?.hijack || false,
        stdin: options?.stdin || false,
        Detach: false,
        Tty: true
      });
      return stream;
    },

    /**
     * Resize TTY
     */
    resize: async (execId: string, dimensions: { h: number; w: number }) => {
      const exec = this.docker.getExec(execId);
      await exec.resize(dimensions);
      return { success: true };
    },

    /**
     * Find a working shell in container
     */
    findShell: async (id: string): Promise<string> => {
      const shells = ['/bin/bash', '/bin/sh', '/bin/ash', 'sh'];
      const container = this.docker.getContainer(id);
      
      for (const shell of shells) {
        try {
          const exec = await container.exec({
            Cmd: [shell, '-c', 'echo test'],
            AttachStdout: true,
            AttachStderr: true
          });
          
          const stream = await exec.start({ Detach: false });
          
          let output = '';
          await new Promise((resolve) => {
            stream.on('data', (chunk: Buffer) => {
              output += chunk.toString();
            });
            stream.on('end', resolve);
            stream.on('error', resolve);
            setTimeout(resolve, 1000);
          });
          
          if (output.includes('test')) {
            return shell;
          }
        } catch (err) {
          // Try next shell
        }
      }
      
      throw new Error('No compatible shell found in container');
    }
  };

  /**
   * File Management
   */
  files = {
    /**
     * List files in a directory
     */
    list: async (id: string, path: string) => {
      const container = this.docker.getContainer(id);
      const exec = await container.exec({
        Cmd: ['ls', '-la', path],
        AttachStdout: true,
        AttachStderr: true
      });
      
      const stream = await exec.start({ Detach: false });
      let output = Buffer.alloc(0);
      
      await new Promise((resolve) => {
        stream.on('data', (chunk: Buffer) => {
          output = Buffer.concat([output, chunk]);
        });
        stream.on('end', resolve);
      });
      
      const decoded = this.decodeDockerStream(output);
      const lines = decoded.split('\n').filter(line => line.trim());
      const files: any[] = [];
      
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(/\s+/);
        if (parts.length >= 9) {
          const permissions = parts[0];
          const size = parseInt(parts[4]) || 0;
          const name = parts.slice(8).join(' ');
          
          if (name !== '.' && name !== '..') {
            files.push({
              name,
              size,
              isDirectory: permissions.startsWith('d'),
              permissions,
              path: path === '/' ? `/${name}` : `${path}/${name}`
            });
          }
        }
      }
      
      return { path, files };
    },

    /**
     * Download a file from container
     */
    download: async (id: string, path: string): Promise<string> => {
      const container = this.docker.getContainer(id);
      const stream = await container.getArchive({ path });
      const extract = tar.extract();
      
      return new Promise((resolve, reject) => {
        let content = '';
        
        extract.on('entry', (header: any, stream: NodeJS.ReadableStream, next: () => void) => {
          stream.on('data', (chunk: Buffer) => {
            content += chunk.toString();
          });
          stream.on('end', () => {
            resolve(content);
            next();
          });
          stream.resume();
        });
        
        extract.on('error', reject);
        stream.pipe(extract);
      });
    },

    /**
     * Upload a file to container
     */
    upload: async (id: string, path: string, filename: string, content: Buffer) => {
      const container = this.docker.getContainer(id);
      const pack = tar.pack();
      
      pack.entry({ name: filename }, content);
      pack.finalize();
      
      await container.putArchive(pack, { path });
      return { success: true, path: `${path}/${filename}` };
    }
  };

  /**
   * System Information
   */
  system = {
    /**
     * Get Docker info
     */
    info: async () => {
      const info = await this.docker.info();
      const version = await this.docker.version();
      return {
        containers: info.Containers,
        containersRunning: info.ContainersRunning,
        images: info.Images,
        serverVersion: version.Version,
        apiVersion: version.ApiVersion,
        os: info.OperatingSystem,
        kernelVersion: info.KernelVersion,
        memTotal: info.MemTotal,
        cpus: info.NCPU
      };
    },

    /**
     * Ping Docker daemon
     */
    ping: async () => {
      await this.docker.ping();
      return { success: true };
    }
  };

  /**
   * Helper function to decode Docker multiplexed stream
   */
  private decodeDockerStream(buffer: Buffer): string {
    if (!buffer || buffer.length === 0) return '';
    
    let output = '';
    let offset = 0;
    
    while (offset < buffer.length) {
      // Need at least 8 bytes for header
      if (offset + 8 > buffer.length) break;
      
      // Read header
      const header = buffer.slice(offset, offset + 8);
      const streamType = header[0];
      const length = header.readUInt32BE(4);
      
      offset += 8;
      
      // Check if we have enough data
      if (offset + length > buffer.length) break;
      
      // Extract the payload
      const payload = buffer.slice(offset, offset + length);
      output += payload.toString('utf8');
      
      offset += length;
    }
    
    return output;
  }

  /**
   * Get the underlying Docker instance for advanced usage
   */
  getDocker(): Docker {
    return this.docker;
  }
}

// Export default
export default DockerControl;