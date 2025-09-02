import { z } from 'zod';

export const LogOptionsSchema = z.object({
  stdout: z.boolean().default(true),
  stderr: z.boolean().default(true),
  follow: z.boolean().default(false),
  since: z.number().optional(),
  until: z.number().optional(),
  timestamps: z.boolean().default(true),
  tail: z.union([z.number(), z.literal('all')]).optional(),
  details: z.boolean().default(false)
});
export type LogOptions = z.infer<typeof LogOptionsSchema>;

export interface LogEntry {
  timestamp: Date;
  stream: 'stdout' | 'stderr';
  line: string;
  containerId: string;
  containerName?: string;
}

export interface LogStream {
  containerId: string;
  stream: NodeJS.ReadableStream;
  encoding?: BufferEncoding;
}