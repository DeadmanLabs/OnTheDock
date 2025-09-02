import { z } from 'zod';

export const ImagePullOptionsSchema = z.object({
  registry: z.string().optional(),
  tag: z.string().default('latest'),
  auth: z.object({
    username: z.string(),
    password: z.string(),
    serveraddress: z.string().optional(),
    email: z.string().email().optional()
  }).optional(),
  platform: z.string().optional()
});
export type ImagePullOptions = z.infer<typeof ImagePullOptionsSchema>;

export const ImageTagSchema = z.object({
  repo: z.string().min(1),
  tag: z.string().default('latest')
});
export type ImageTag = z.infer<typeof ImageTagSchema>;

export interface ImageInfo {
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
  author?: string;
  comment?: string;
}

export interface ImagePullProgress {
  id: string;
  status: string;
  progress?: string;
  progressDetail?: {
    current: number;
    total: number;
  };
  error?: string;
}

export interface ImageBuildOptions {
  dockerfile?: string;
  tag?: string;
  buildArgs?: Record<string, string>;
  cacheBusting?: boolean;
  cpuPeriod?: number;
  cpuQuota?: number;
  cpuShares?: number;
  memory?: number;
  memorySwap?: number;
  networkMode?: string;
  platform?: string;
  pull?: boolean;
  rm?: boolean;
  forcerm?: boolean;
  isolation?: string;
  quiet?: boolean;
  nocache?: boolean;
}