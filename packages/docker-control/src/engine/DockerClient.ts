import Docker from 'dockerode';
import { EventEmitter } from 'events';
import debug from 'debug';
import { DockerClientOptions, DockerEngineInfo, DockerVersion } from './types';

const log = debug('docker-control:client');

export class DockerClient extends EventEmitter {
  private docker: Docker;
  private options: DockerClientOptions;
  private connected: boolean = false;

  constructor(options: DockerClientOptions = {}) {
    super();
    this.options = this.normalizeOptions(options);
    this.docker = this.createDockerInstance();
  }

  private normalizeOptions(options: DockerClientOptions): DockerClientOptions {
    const defaultOptions: DockerClientOptions = {
      transport: {
        type: 'socket',
        socketPath: process.platform === 'win32' ? '//./pipe/docker_engine' : '/var/run/docker.sock'
      },
      request: {
        timeout: 60000,
        retries: 3,
        userAgent: 'docker-control/1.0.0',
        debug: false
      }
    };

    return {
      ...defaultOptions,
      ...options,
      transport: { ...defaultOptions.transport, ...options.transport },
      request: { ...defaultOptions.request, ...options.request }
    };
  }

  private createDockerInstance(): Docker {
    const { transport, tls, request } = this.options;
    
    let dockerOptions: Docker.DockerOptions = {
      timeout: request?.timeout,
      headers: {
        'User-Agent': request?.userAgent || 'docker-control/1.0.0'
      }
    };

    if (transport?.type === 'socket') {
      dockerOptions.socketPath = transport.socketPath;
    } else if (transport?.type === 'tcp') {
      dockerOptions.host = transport.host || 'localhost';
      dockerOptions.port = transport.port || 2375;
      dockerOptions.protocol = tls ? 'https' : 'http';
      
      if (tls) {
        dockerOptions.ca = tls.ca;
        dockerOptions.cert = tls.cert;
        dockerOptions.key = tls.key;
      }
    } else if (transport?.type === 'pipe' && process.platform === 'win32') {
      dockerOptions.socketPath = transport.pipeName || '//./pipe/docker_engine';
    }

    if (this.options.request?.debug) {
      log('Creating Docker instance with options:', dockerOptions);
    }

    return new Docker(dockerOptions);
  }

  async connect(): Promise<void> {
    try {
      await this.docker.ping();
      this.connected = true;
      this.emit('connected');
      log('Successfully connected to Docker Engine');
    } catch (error) {
      this.connected = false;
      this.emit('error', error);
      throw new Error(`Failed to connect to Docker Engine: ${error}`);
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.emit('disconnected');
    log('Disconnected from Docker Engine');
  }

  isConnected(): boolean {
    return this.connected;
  }

  async getInfo(): Promise<DockerEngineInfo> {
    try {
      const info = await this.docker.info();
      return info as DockerEngineInfo;
    } catch (error) {
      log('Failed to get Docker info:', error);
      throw error;
    }
  }

  async getVersion(): Promise<DockerVersion> {
    try {
      const version = await this.docker.version();
      return version as DockerVersion;
    } catch (error) {
      log('Failed to get Docker version:', error);
      throw error;
    }
  }

  async getDiskUsage(): Promise<any> {
    try {
      const df = await this.docker.df();
      return df;
    } catch (error) {
      log('Failed to get disk usage:', error);
      throw error;
    }
  }

  async ping(): Promise<boolean> {
    try {
      await this.docker.ping();
      return true;
    } catch (error) {
      return false;
    }
  }

  getDockerInstance(): Docker {
    return this.docker;
  }

  getOptions(): DockerClientOptions {
    return this.options;
  }

  async testConnection(): Promise<{ success: boolean; info?: DockerEngineInfo; error?: string }> {
    try {
      const isAlive = await this.ping();
      if (!isAlive) {
        return { success: false, error: 'Docker Engine is not responding' };
      }

      const info = await this.getInfo();
      return { success: true, info };
    } catch (error: any) {
      return { success: false, error: error.message || 'Unknown error' };
    }
  }
}