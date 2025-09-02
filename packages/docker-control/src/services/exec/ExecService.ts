import Docker from 'dockerode';
import { Readable, Writable } from 'stream';
import debug from 'debug';
import { DockerClient } from '../../engine/DockerClient';
import { RealtimeEmitter } from '../../realtime/RealtimeEmitter';
import { 
  ExecOptions, 
  ExecOptionsSchema,
  ExecStartOptions,
  ExecStartOptionsSchema,
  ExecSession,
  ExecInspect,
  ResizeTTYOptions
} from '../../models/exec';
import { handleDockerodeError, NotFoundError } from '../../errors/DockerErrors';

const log = debug('docker-control:exec');

export class ExecService {
  private docker: Docker;
  private client: DockerClient;
  private realtime: RealtimeEmitter;
  private activeSessions: Map<string, ExecSession> = new Map();

  constructor(client: DockerClient, realtime: RealtimeEmitter) {
    this.client = client;
    this.docker = client.getDockerInstance();
    this.realtime = realtime;
  }

  async create(containerId: string, options: ExecOptions): Promise<string> {
    try {
      const validatedOptions = ExecOptionsSchema.parse(options);
      const container = this.docker.getContainer(containerId);
      
      const execOptions: Docker.ExecCreateOptions = {
        Cmd: validatedOptions.cmd,
        AttachStdin: validatedOptions.attachStdin,
        AttachStdout: validatedOptions.attachStdout,
        AttachStderr: validatedOptions.attachStderr,
        DetachKeys: validatedOptions.detachKeys,
        Tty: validatedOptions.tty,
        Env: validatedOptions.env,
        Privileged: validatedOptions.privileged,
        User: validatedOptions.user,
        WorkingDir: validatedOptions.workingDir
      };

      const exec = await container.exec(execOptions);
      const execId = exec.id;
      
      // Create session record
      const session: ExecSession = {
        id: execId,
        containerId,
        command: validatedOptions.cmd,
        running: false,
        created: new Date()
      };
      
      this.activeSessions.set(execId, session);
      
      this.realtime.emitRealtimeEvent({
        type: 'container.exec',
        timestamp: new Date(),
        containerId,
        data: {
          action: 'created',
          execId,
          command: validatedOptions.cmd.join(' ')
        }
      });

      log(`Exec session created: ${execId} in container ${containerId}`);
      return execId;
    } catch (error: any) {
      if (error.statusCode === 404) {
        throw new NotFoundError('Container', containerId);
      }
      throw handleDockerodeError(error);
    }
  }

  async start(
    execId: string,
    options?: ExecStartOptions & { 
      stdin?: Readable; 
      stdout?: Writable; 
      stderr?: Writable 
    }
  ): Promise<NodeJS.ReadWriteStream> {
    try {
      const validatedOptions = options ? ExecStartOptionsSchema.parse(options) : {};
      const exec = this.docker.getExec(execId);
      
      const startOptions: any = {
        Detach: validatedOptions.detach,
        Tty: validatedOptions.tty,
        stdin: options?.stdin,
        stdout: options?.stdout,
        stderr: options?.stderr
      };

      // Handle hijacked connection for interactive sessions
      if (!validatedOptions.detach) {
        startOptions.hijack = true;
      }

      const stream = await exec.start(startOptions);
      
      // Update session
      const session = this.activeSessions.get(execId);
      if (session) {
        session.running = true;
        session.started = new Date();
      }

      this.realtime.emitRealtimeEvent({
        type: 'container.exec',
        timestamp: new Date(),
        containerId: session?.containerId,
        data: {
          action: 'started',
          execId
        }
      });

      log(`Exec session started: ${execId}`);
      return stream;
    } catch (error: any) {
      if (error.statusCode === 404) {
        throw new NotFoundError('Exec session', execId);
      }
      throw handleDockerodeError(error);
    }
  }

  async interactive(
    containerId: string,
    options?: {
      cmd?: string[];
      user?: string;
      workingDir?: string;
      env?: string[];
    }
  ): Promise<{
    execId: string;
    stream: NodeJS.ReadWriteStream;
    resize: (options: ResizeTTYOptions) => Promise<void>;
    kill: () => Promise<void>;
  }> {
    try {
      // Default to bash or sh
      const cmd = options?.cmd || ['/bin/bash'];
      
      // Create exec instance
      const execId = await this.create(containerId, {
        cmd,
        attachStdin: true,
        attachStdout: true,
        attachStderr: true,
        tty: true,
        user: options?.user,
        workingDir: options?.workingDir,
        env: options?.env
      });

      // Start interactive session
      const stream = await this.start(execId, {
        tty: true,
        detach: false
      });

      // Create resize function
      const resize = async (resizeOptions: ResizeTTYOptions) => {
        await this.resize(execId, resizeOptions);
      };

      // Create kill function
      const kill = async () => {
        await this.stop(execId);
      };

      // Handle stream events
      stream.on('end', () => {
        const session = this.activeSessions.get(execId);
        if (session) {
          session.running = false;
          session.finished = new Date();
        }
        
        this.realtime.emitRealtimeEvent({
          type: 'container.exec',
          timestamp: new Date(),
          containerId,
          data: {
            action: 'ended',
            execId
          }
        });
      });

      return { execId, stream, resize, kill };
    } catch (error) {
      throw handleDockerodeError(error);
    }
  }

  async resize(execId: string, options: ResizeTTYOptions): Promise<void> {
    try {
      const exec = this.docker.getExec(execId);
      await exec.resize({
        h: options.height,
        w: options.width
      });
      
      log(`Exec session resized: ${execId} to ${options.width}x${options.height}`);
    } catch (error: any) {
      if (error.statusCode === 404) {
        throw new NotFoundError('Exec session', execId);
      }
      throw handleDockerodeError(error);
    }
  }

  async inspect(execId: string): Promise<ExecInspect> {
    try {
      const exec = this.docker.getExec(execId);
      const info = await exec.inspect();
      
      return {
        id: info.ID,
        running: info.Running,
        exitCode: info.ExitCode,
        processConfig: {
          privileged: info.ProcessConfig.privileged,
          user: info.ProcessConfig.user,
          tty: info.ProcessConfig.tty,
          entrypoint: info.ProcessConfig.entrypoint,
          arguments: info.ProcessConfig.arguments
        },
        openStdin: info.OpenStdin,
        openStderr: info.OpenStderr,
        openStdout: info.OpenStdout,
        canRemove: info.CanRemove,
        containerId: info.ContainerID,
        detachKeys: info.DetachKeys || '',
        pid: info.Pid
      };
    } catch (error: any) {
      if (error.statusCode === 404) {
        throw new NotFoundError('Exec session', execId);
      }
      throw handleDockerodeError(error);
    }
  }

  async command(
    containerId: string,
    cmd: string[],
    options?: {
      user?: string;
      workingDir?: string;
      env?: string[];
      privileged?: boolean;
    }
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    try {
      // Create exec
      const execId = await this.create(containerId, {
        cmd,
        attachStdout: true,
        attachStderr: true,
        user: options?.user,
        workingDir: options?.workingDir,
        env: options?.env,
        privileged: options?.privileged
      });

      // Start and collect output
      const exec = this.docker.getExec(execId);
      const stream = await exec.start({
        hijack: true,
        stdin: false
      });

      return new Promise((resolve, reject) => {
        let stdout = '';
        let stderr = '';

        // Docker multiplexed stream handling
        this.docker.modem.demuxStream(
          stream,
          {
            write: (chunk: any) => { stdout += chunk.toString(); },
            end: () => {}
          } as Writable,
          {
            write: (chunk: any) => { stderr += chunk.toString(); },
            end: () => {}
          } as Writable
        );

        stream.on('end', async () => {
          try {
            const info = await this.inspect(execId);
            resolve({
              stdout: stdout.trim(),
              stderr: stderr.trim(),
              exitCode: info.exitCode || 0
            });
          } catch (error) {
            reject(error);
          }
        });

        stream.on('error', reject);
      });
    } catch (error) {
      throw handleDockerodeError(error);
    }
  }

  async stop(execId: string): Promise<void> {
    try {
      // Docker doesn't provide a direct way to stop exec sessions
      // We can only track them and clean up our records
      const session = this.activeSessions.get(execId);
      if (session) {
        session.running = false;
        session.finished = new Date();
        
        this.realtime.emitRealtimeEvent({
          type: 'container.exec',
          timestamp: new Date(),
          containerId: session.containerId,
          data: {
            action: 'stopped',
            execId
          }
        });
      }
      
      log(`Exec session marked as stopped: ${execId}`);
    } catch (error) {
      throw handleDockerodeError(error);
    }
  }

  getActiveSessions(): ExecSession[] {
    return Array.from(this.activeSessions.values());
  }

  getSessionsByContainer(containerId: string): ExecSession[] {
    return Array.from(this.activeSessions.values())
      .filter(session => session.containerId === containerId);
  }

  async cleanupSessions(): Promise<void> {
    for (const [execId, session] of this.activeSessions.entries()) {
      try {
        const info = await this.inspect(execId);
        if (!info.running) {
          session.running = false;
          session.exitCode = info.exitCode || undefined;
          if (!session.finished) {
            session.finished = new Date();
          }
        }
      } catch (error) {
        // Session no longer exists
        this.activeSessions.delete(execId);
      }
    }
    
    log('Cleaned up exec sessions');
  }
}