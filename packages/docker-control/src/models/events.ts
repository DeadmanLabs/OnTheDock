import { z } from 'zod';

export const EventTypeSchema = z.enum([
  'container',
  'image',
  'volume',
  'network',
  'daemon',
  'plugin',
  'node',
  'service',
  'secret',
  'config'
]);
export type EventType = z.infer<typeof EventTypeSchema>;

export const EventActionSchema = z.enum([
  'attach',
  'commit',
  'connect',
  'copy',
  'create',
  'delete',
  'destroy',
  'detach',
  'die',
  'disable',
  'disconnect',
  'enable',
  'exec_create',
  'exec_detach',
  'exec_die',
  'exec_start',
  'export',
  'health_status',
  'import',
  'install',
  'kill',
  'load',
  'mount',
  'oom',
  'pause',
  'pull',
  'push',
  'reload',
  'remove',
  'rename',
  'resize',
  'restart',
  'save',
  'start',
  'stop',
  'tag',
  'top',
  'unmount',
  'unpause',
  'untag',
  'update'
]);
export type EventAction = z.infer<typeof EventActionSchema>;

export const EventFiltersSchema = z.object({
  container: z.array(z.string()).optional(),
  daemon: z.array(z.string()).optional(),
  event: z.array(EventActionSchema).optional(),
  image: z.array(z.string()).optional(),
  label: z.array(z.string()).optional(),
  network: z.array(z.string()).optional(),
  node: z.array(z.string()).optional(),
  plugin: z.array(z.string()).optional(),
  scope: z.array(z.enum(['local', 'swarm'])).optional(),
  service: z.array(z.string()).optional(),
  type: z.array(EventTypeSchema).optional(),
  volume: z.array(z.string()).optional()
});
export type EventFilters = z.infer<typeof EventFiltersSchema>;

export interface DockerEvent {
  type: EventType;
  action: EventAction;
  actor: {
    id: string;
    attributes: Record<string, string>;
  };
  scope: 'local' | 'swarm';
  time: number;
  timeNano: number;
  status?: string;
  id?: string;
  from?: string;
}