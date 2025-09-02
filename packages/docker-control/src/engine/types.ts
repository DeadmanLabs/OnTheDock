import { TlsOptions } from 'tls';

export interface DockerClientOptions {
  transport?: {
    type: 'socket' | 'tcp' | 'pipe';
    host?: string;
    port?: number;
    socketPath?: string;
    pipeName?: string;
  };
  tls?: {
    ca?: string;
    cert?: string;
    key?: string;
    passphrase?: string;
    verify?: boolean;
  };
  auth?: {
    username?: string;
    password?: string;
    serveraddress?: string;
    email?: string;
  };
  request?: {
    timeout?: number;
    retries?: number;
    userAgent?: string;
    debug?: boolean;
  };
}

export interface DockerEngineInfo {
  ID: string;
  Containers: number;
  ContainersRunning: number;
  ContainersPaused: number;
  ContainersStopped: number;
  Images: number;
  Driver: string;
  DriverStatus: string[][];
  DockerRootDir: string;
  SystemStatus?: string[][];
  Plugins: any;
  MemoryLimit: boolean;
  SwapLimit: boolean;
  KernelMemory: boolean;
  CpuCfsPeriod: boolean;
  CpuCfsQuota: boolean;
  CPUShares: boolean;
  CPUSet: boolean;
  PidsLimit: boolean;
  IPv4Forwarding: boolean;
  BridgeNfIptables: boolean;
  BridgeNfIp6tables: boolean;
  Debug: boolean;
  NFd: number;
  OomKillDisable: boolean;
  NGoroutines: number;
  SystemTime: string;
  LoggingDriver: string;
  CgroupDriver: string;
  NEventsListener: number;
  KernelVersion: string;
  OperatingSystem: string;
  OSType: string;
  Architecture: string;
  IndexServerAddress: string;
  RegistryConfig: any;
  NCPU: number;
  MemTotal: number;
  GenericResources?: any;
  HttpProxy: string;
  HttpsProxy: string;
  NoProxy: string;
  Name: string;
  Labels: string[];
  ExperimentalBuild: boolean;
  ServerVersion: string;
  ClusterStore: string;
  ClusterAdvertise: string;
  Runtimes: any;
  DefaultRuntime: string;
  Swarm: any;
  LiveRestoreEnabled: boolean;
  Isolation: string;
  InitBinary: string;
  ContainerdCommit: {
    ID: string;
    Expected: string;
  };
  RuncCommit: {
    ID: string;
    Expected: string;
  };
  InitCommit: {
    ID: string;
    Expected: string;
  };
  SecurityOptions: string[];
}

export interface DockerVersion {
  Version: string;
  ApiVersion: string;
  MinAPIVersion?: string;
  GitCommit: string;
  GoVersion: string;
  Os: string;
  Arch: string;
  KernelVersion?: string;
  BuildTime?: string;
}