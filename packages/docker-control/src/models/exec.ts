import { z } from 'zod';

export const ExecOptionsSchema = z.object({
  cmd: z.array(z.string()).min(1),
  attachStdin: z.boolean().default(false),
  attachStdout: z.boolean().default(true),
  attachStderr: z.boolean().default(true),
  detachKeys: z.string().optional(),
  tty: z.boolean().default(false),
  env: z.array(z.string()).optional(),
  privileged: z.boolean().default(false),
  user: z.string().optional(),
  workingDir: z.string().optional()
});
export type ExecOptions = z.infer<typeof ExecOptionsSchema>;

export const ExecStartOptionsSchema = z.object({
  detach: z.boolean().default(false),
  tty: z.boolean().default(false)
});
export type ExecStartOptions = z.infer<typeof ExecStartOptionsSchema>;

export interface ExecSession {
  id: string;
  containerId: string;
  command: string[];
  running: boolean;
  exitCode?: number;
  pid?: number;
  created: Date;
  started?: Date;
  finished?: Date;
}

export interface ExecInspect {
  id: string;
  running: boolean;
  exitCode: number | null;
  processConfig: {
    privileged: boolean;
    user: string;
    tty: boolean;
    entrypoint: string;
    arguments: string[];
  };
  openStdin: boolean;
  openStderr: boolean;
  openStdout: boolean;
  canRemove: boolean;
  containerId: string;
  detachKeys: string;
  pid: number;
}

export interface ResizeTTYOptions {
  height: number;
  width: number;
}