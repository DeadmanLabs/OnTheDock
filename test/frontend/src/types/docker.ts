export interface Container {
  id: string;
  name: string;
  image: string;
  imageId: string;
  command: string;
  created: Date;
  state: 'created' | 'restarting' | 'running' | 'removing' | 'paused' | 'exited' | 'dead';
  status: string;
  ports: PortMapping[];
  labels: Record<string, string>;
  mounts: Volume[];
  networks: Record<string, any>;
}

export interface PortMapping {
  containerPort: number;
  hostPort?: number;
  protocol: 'tcp' | 'udp';
  hostIp?: string;
}

export interface Volume {
  type: 'bind' | 'volume' | 'tmpfs';
  source: string;
  target: string;
  readOnly: boolean;
}

export interface Image {
  id: string;
  parentId: string;
  repoTags: string[];
  repoDigests: string[];
  created: Date;
  size: number;
  virtualSize: number;
  sharedSize: number;
  labels: Record<string, string>;
  containers: number;
  architecture: string;
  os: string;
}

export interface SystemInfo {
  ID: string;
  Containers: number;
  ContainersRunning: number;
  ContainersPaused: number;
  ContainersStopped: number;
  Images: number;
  Driver: string;
  DockerRootDir: string;
  MemoryLimit: boolean;
  SwapLimit: boolean;
  KernelMemory: boolean;
  CpuCfsPeriod: boolean;
  CpuCfsQuota: boolean;
  CPUShares: boolean;
  CPUSet: boolean;
  PidsLimit: boolean;
  OomKillDisable: boolean;
  NGoroutines: number;
  SystemTime: string;
  LoggingDriver: string;
  NEventsListener: number;
  KernelVersion: string;
  OperatingSystem: string;
  OSType: string;
  Architecture: string;
  NCPU: number;
  MemTotal: number;
  Name: string;
  ServerVersion: string;
}

export interface ContainerStats {
  timestamp: Date;
  cpu: {
    usage: number;
    system: number;
    percent: number;
  };
  memory: {
    usage: number;
    limit: number;
    percent: number;
  };
  network: {
    rxBytes: number;
    txBytes: number;
    rxPackets: number;
    txPackets: number;
  };
  blockIO: {
    readBytes: number;
    writeBytes: number;
  };
  pids: {
    current: number;
    limit?: number;
  };
}

export interface LogEntry {
  timestamp: Date;
  stream: 'stdout' | 'stderr';
  line: string;
  containerId: string;
}

export interface FileInfo {
  name: string;
  path: string;
  size: number;
  mode: number;
  mtime: Date;
  isDirectory: boolean;
  isSymlink: boolean;
}

export interface ContainerSpec {
  name: string;
  image: string;
  tag?: string;
  command?: string[];
  entrypoint?: string[];
  env?: Record<string, string>;
  labels?: Record<string, string>;
  workingDir?: string;
  user?: string;
  hostname?: string;
  ports?: PortMapping[];
  volumes?: Volume[];
  networks?: string[];
  networkMode?: string;
  restartPolicy?: {
    name: 'no' | 'always' | 'unless-stopped' | 'on-failure';
    maximumRetryCount?: number;
  };
  resources?: {
    cpu?: {
      shares?: number;
      period?: number;
      quota?: number;
      cpuset?: string;
    };
    memory?: {
      limit?: number;
      reservation?: number;
      swap?: number;
    };
    pids?: {
      limit?: number;
    };
  };
  privileged?: boolean;
  readonlyRootfs?: boolean;
}