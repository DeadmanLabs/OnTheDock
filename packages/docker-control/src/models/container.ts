import { z } from 'zod';

export const RestartPolicySchema = z.enum(['no', 'always', 'unless-stopped', 'on-failure']);
export type RestartPolicy = z.infer<typeof RestartPolicySchema>;

export const NetworkModeSchema = z.enum(['bridge', 'host', 'none', 'container', 'custom']);
export type NetworkMode = z.infer<typeof NetworkModeSchema>;

export const PortMappingSchema = z.object({
  containerPort: z.number().int().positive(),
  hostPort: z.number().int().positive().optional(),
  protocol: z.enum(['tcp', 'udp']).default('tcp'),
  hostIp: z.string().optional()
});
export type PortMapping = z.infer<typeof PortMappingSchema>;

export const VolumeSchema = z.object({
  type: z.enum(['bind', 'volume', 'tmpfs']),
  source: z.string(),
  target: z.string(),
  readOnly: z.boolean().default(false),
  options: z.record(z.string()).optional()
});
export type Volume = z.infer<typeof VolumeSchema>;

export const ResourceLimitsSchema = z.object({
  cpu: z.object({
    shares: z.number().optional(),
    period: z.number().optional(),
    quota: z.number().optional(),
    cpuset: z.string().optional()
  }).optional(),
  memory: z.object({
    limit: z.number().optional(),
    reservation: z.number().optional(),
    swap: z.number().optional()
  }).optional(),
  pids: z.object({
    limit: z.number().optional()
  }).optional(),
  ulimits: z.array(z.object({
    name: z.string(),
    soft: z.number(),
    hard: z.number()
  })).optional()
});
export type ResourceLimits = z.infer<typeof ResourceLimitsSchema>;

export const ContainerSpecSchema = z.object({
  name: z.string().min(1).regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/),
  image: z.string().min(1),
  tag: z.string().default('latest'),
  command: z.array(z.string()).optional(),
  entrypoint: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
  labels: z.record(z.string()).optional(),
  workingDir: z.string().optional(),
  user: z.string().optional(),
  hostname: z.string().optional(),
  domainname: z.string().optional(),
  ports: z.array(PortMappingSchema).optional(),
  volumes: z.array(VolumeSchema).optional(),
  networks: z.array(z.string()).optional(),
  networkMode: NetworkModeSchema.optional(),
  restartPolicy: z.object({
    name: RestartPolicySchema,
    maximumRetryCount: z.number().optional()
  }).optional(),
  resources: ResourceLimitsSchema.optional(),
  capabilities: z.object({
    add: z.array(z.string()).optional(),
    drop: z.array(z.string()).optional()
  }).optional(),
  securityOpt: z.array(z.string()).optional(),
  privileged: z.boolean().default(false),
  readonlyRootfs: z.boolean().default(false),
  dns: z.array(z.string()).optional(),
  dnsSearch: z.array(z.string()).optional(),
  extraHosts: z.array(z.string()).optional(),
  healthcheck: z.object({
    test: z.array(z.string()),
    interval: z.number().optional(),
    timeout: z.number().optional(),
    retries: z.number().optional(),
    startPeriod: z.number().optional()
  }).optional()
});
export type ContainerSpec = z.infer<typeof ContainerSpecSchema>;

export const ContainerStatusSchema = z.enum([
  'created',
  'restarting',
  'running',
  'removing',
  'paused',
  'exited',
  'dead'
]);
export type ContainerStatus = z.infer<typeof ContainerStatusSchema>;

export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  imageId: string;
  command: string;
  created: Date;
  state: ContainerStatus;
  status: string;
  ports: PortMapping[];
  labels: Record<string, string>;
  mounts: Volume[];
  networks: Record<string, any>;
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