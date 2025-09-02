import Docker from 'dockerode';
import { Readable } from 'stream';
import path from 'path';
import debug from 'debug';
import { DockerClient } from '../../engine/DockerClient';
import { RealtimeEmitter } from '../../realtime/RealtimeEmitter';
import { 
  FileInfo,
  FileUploadOptions,
  FileDownloadOptions,
  FileTransferProgress,
  DirectoryListOptions
} from '../../models/files';
import { handleDockerodeError, NotFoundError, IOError } from '../../errors/DockerErrors';
import { TarHelper, TarEntry } from '../../utils/tar';
import { StreamHelper } from '../../utils/stream';

const log = debug('docker-control:files');

export class FilesService {
  private docker: Docker;
  private client: DockerClient;
  private realtime: RealtimeEmitter;

  constructor(client: DockerClient, realtime: RealtimeEmitter) {
    this.client = client;
    this.docker = client.getDockerInstance();
    this.realtime = realtime;
  }

  async upload(
    containerId: string,
    localPath: string | Buffer | Readable,
    containerPath: string,
    options?: { noOverwriteDirNonDir?: boolean; copyUIDGID?: boolean }
  ): Promise<void> {
    try {
      const container = this.docker.getContainer(containerId);
      
      // Create tar archive
      let archive: Buffer;
      
      if (Buffer.isBuffer(localPath)) {
        // Create tar from buffer
        const fileName = path.basename(containerPath);
        const entry: TarEntry = {
          name: fileName,
          type: 'file',
          size: localPath.length,
          mode: 0o644,
          mtime: new Date(),
          content: localPath
        };
        archive = await TarHelper.createArchive([entry]);
      } else if (localPath instanceof Readable) {
        // Stream to buffer then tar
        const buffer = await StreamHelper.streamToBuffer(localPath);
        const fileName = path.basename(containerPath);
        const entry: TarEntry = {
          name: fileName,
          type: 'file',
          size: buffer.length,
          mode: 0o644,
          mtime: new Date(),
          content: buffer
        };
        archive = await TarHelper.createArchive([entry]);
      } else {
        // Assume it's a file path string, create tar from file
        throw new Error('File path upload not implemented - use Buffer or Stream');
      }

      // Track progress
      let bytesTransferred = 0;
      const totalBytes = archive.length;
      
      const progressStream = StreamHelper.createProgressStream((bytes) => {
        bytesTransferred = bytes;
        
        const progress: FileTransferProgress = {
          operation: 'upload',
          path: containerPath,
          bytesTransferred,
          totalBytes,
          percent: Math.round((bytesTransferred / totalBytes) * 100)
        };
        
        this.realtime.emitRealtimeEvent({
          type: 'container.files',
          timestamp: new Date(),
          containerId,
          data: progress
        });
      });

      // Upload to container
      const stream = StreamHelper.bufferToStream(archive);
      await new Promise((resolve, reject) => {
        stream.pipe(progressStream);
        
        container.putArchive(progressStream, {
          path: path.dirname(containerPath),
          noOverwriteDirNonDir: options?.noOverwriteDirNonDir,
          copyUIDGID: options?.copyUIDGID
        }, (err) => {
          if (err) reject(handleDockerodeError(err));
          else resolve(undefined);
        });
      });

      log(`File uploaded to container ${containerId}: ${containerPath}`);
    } catch (error: any) {
      if (error.statusCode === 404) {
        throw new NotFoundError('Container', containerId);
      }
      throw handleDockerodeError(error);
    }
  }

  async download(
    containerId: string,
    containerPath: string,
    options?: FileDownloadOptions
  ): Promise<Buffer> {
    try {
      const container = this.docker.getContainer(containerId);
      
      // Get archive from container
      const stream = await container.getArchive({
        path: containerPath,
        follow: options?.follow
      });

      // Convert stream to buffer
      const archiveBuffer = await StreamHelper.streamToBuffer(stream);
      
      // Track progress
      const progress: FileTransferProgress = {
        operation: 'download',
        path: containerPath,
        bytesTransferred: archiveBuffer.length,
        totalBytes: archiveBuffer.length,
        percent: 100
      };
      
      this.realtime.emitRealtimeEvent({
        type: 'container.files',
        timestamp: new Date(),
        containerId,
        data: progress
      });

      // Extract the file from tar archive
      const entries = await TarHelper.extractArchive(archiveBuffer);
      
      if (entries.length === 0) {
        throw new IOError(`No files found in archive for path: ${containerPath}`);
      }

      // Return the first file's content
      const file = entries[0];
      if (!file.content) {
        throw new IOError(`File has no content: ${containerPath}`);
      }

      log(`File downloaded from container ${containerId}: ${containerPath}`);
      return file.content;
    } catch (error: any) {
      if (error.statusCode === 404) {
        throw new NotFoundError('File or container', `${containerId}:${containerPath}`);
      }
      throw handleDockerodeError(error);
    }
  }

  async list(
    containerId: string,
    containerPath: string,
    options?: { recursive?: boolean; includeHidden?: boolean }
  ): Promise<FileInfo[]> {
    try {
      const container = this.docker.getContainer(containerId);
      
      // Use exec to run ls command
      const execService = await import('../exec/ExecService');
      const exec = new execService.ExecService(this.client, this.realtime);
      
      const lsCommand = [
        'ls',
        '-la',
        '--time-style=long-iso',
        options?.recursive ? '-R' : '',
        containerPath
      ].filter(Boolean);

      const result = await exec.command(containerId, lsCommand);
      
      if (result.exitCode !== 0) {
        throw new IOError(`Failed to list directory: ${result.stderr}`);
      }

      // Parse ls output
      const files = this.parseLsOutput(result.stdout, containerPath, options?.includeHidden);
      
      log(`Listed ${files.length} files in container ${containerId}: ${containerPath}`);
      return files;
    } catch (error: any) {
      if (error.statusCode === 404) {
        throw new NotFoundError('Container', containerId);
      }
      throw handleDockerodeError(error);
    }
  }

  async stat(containerId: string, containerPath: string): Promise<FileInfo> {
    try {
      const container = this.docker.getContainer(containerId);
      
      // Get file info using stat command
      const execService = await import('../exec/ExecService');
      const exec = new execService.ExecService(this.client, this.realtime);
      
      const result = await exec.command(containerId, [
        'stat',
        '--format=%n|%s|%f|%Y|%F',
        containerPath
      ]);

      if (result.exitCode !== 0) {
        throw new NotFoundError('File', containerPath);
      }

      // Parse stat output
      const [name, size, mode, mtime, type] = result.stdout.trim().split('|');
      
      return {
        name: path.basename(name),
        path: name,
        size: parseInt(size, 10),
        mode: parseInt(mode, 16),
        mtime: new Date(parseInt(mtime, 10) * 1000),
        isDirectory: type === 'directory',
        isSymlink: type === 'symbolic link'
      };
    } catch (error: any) {
      if (error.statusCode === 404) {
        throw new NotFoundError('Container', containerId);
      }
      throw handleDockerodeError(error);
    }
  }

  async delete(containerId: string, containerPath: string): Promise<void> {
    try {
      // Use exec to run rm command
      const execService = await import('../exec/ExecService');
      const exec = new execService.ExecService(this.client, this.realtime);
      
      const result = await exec.command(containerId, ['rm', '-rf', containerPath]);
      
      if (result.exitCode !== 0) {
        throw new IOError(`Failed to delete: ${result.stderr}`);
      }

      this.realtime.emitRealtimeEvent({
        type: 'container.files',
        timestamp: new Date(),
        containerId,
        data: {
          operation: 'delete',
          path: containerPath
        }
      });

      log(`File deleted in container ${containerId}: ${containerPath}`);
    } catch (error: any) {
      if (error.statusCode === 404) {
        throw new NotFoundError('Container', containerId);
      }
      throw handleDockerodeError(error);
    }
  }

  async mkdir(
    containerId: string,
    containerPath: string,
    options?: { recursive?: boolean; mode?: string }
  ): Promise<void> {
    try {
      // Use exec to run mkdir command
      const execService = await import('../exec/ExecService');
      const exec = new execService.ExecService(this.client, this.realtime);
      
      const mkdirCommand = [
        'mkdir',
        options?.recursive ? '-p' : '',
        options?.mode ? `-m${options.mode}` : '',
        containerPath
      ].filter(Boolean);

      const result = await exec.command(containerId, mkdirCommand);
      
      if (result.exitCode !== 0) {
        throw new IOError(`Failed to create directory: ${result.stderr}`);
      }

      this.realtime.emitRealtimeEvent({
        type: 'container.files',
        timestamp: new Date(),
        containerId,
        data: {
          operation: 'mkdir',
          path: containerPath
        }
      });

      log(`Directory created in container ${containerId}: ${containerPath}`);
    } catch (error: any) {
      if (error.statusCode === 404) {
        throw new NotFoundError('Container', containerId);
      }
      throw handleDockerodeError(error);
    }
  }

  async copy(
    containerId: string,
    sourcePath: string,
    destPath: string
  ): Promise<void> {
    try {
      // Use exec to run cp command
      const execService = await import('../exec/ExecService');
      const exec = new execService.ExecService(this.client, this.realtime);
      
      const result = await exec.command(containerId, ['cp', '-r', sourcePath, destPath]);
      
      if (result.exitCode !== 0) {
        throw new IOError(`Failed to copy: ${result.stderr}`);
      }

      this.realtime.emitRealtimeEvent({
        type: 'container.files',
        timestamp: new Date(),
        containerId,
        data: {
          operation: 'copy',
          source: sourcePath,
          destination: destPath
        }
      });

      log(`File copied in container ${containerId}: ${sourcePath} -> ${destPath}`);
    } catch (error: any) {
      if (error.statusCode === 404) {
        throw new NotFoundError('Container', containerId);
      }
      throw handleDockerodeError(error);
    }
  }

  async move(
    containerId: string,
    sourcePath: string,
    destPath: string
  ): Promise<void> {
    try {
      // Use exec to run mv command
      const execService = await import('../exec/ExecService');
      const exec = new execService.ExecService(this.client, this.realtime);
      
      const result = await exec.command(containerId, ['mv', sourcePath, destPath]);
      
      if (result.exitCode !== 0) {
        throw new IOError(`Failed to move: ${result.stderr}`);
      }

      this.realtime.emitRealtimeEvent({
        type: 'container.files',
        timestamp: new Date(),
        containerId,
        data: {
          operation: 'move',
          source: sourcePath,
          destination: destPath
        }
      });

      log(`File moved in container ${containerId}: ${sourcePath} -> ${destPath}`);
    } catch (error: any) {
      if (error.statusCode === 404) {
        throw new NotFoundError('Container', containerId);
      }
      throw handleDockerodeError(error);
    }
  }

  private parseLsOutput(output: string, basePath: string, includeHidden?: boolean): FileInfo[] {
    const lines = output.split('\n').filter(line => line && !line.startsWith('total'));
    const files: FileInfo[] = [];

    for (const line of lines) {
      const match = line.match(/^([drwxlst-]+)\s+\d+\s+\S+\s+\S+\s+(\d+)\s+(\S+\s+\S+)\s+(.+)$/);
      if (match) {
        const [, permissions, size, datetime, name] = match;
        
        // Skip hidden files if not requested
        if (!includeHidden && name.startsWith('.')) {
          continue;
        }

        // Skip . and .. entries
        if (name === '.' || name === '..') {
          continue;
        }

        const fullPath = path.join(basePath, name);
        
        files.push({
          name,
          path: fullPath,
          size: parseInt(size, 10),
          mode: this.permissionsToMode(permissions),
          mtime: new Date(datetime),
          isDirectory: permissions.startsWith('d'),
          isSymlink: permissions.startsWith('l')
        });
      }
    }

    return files;
  }

  private permissionsToMode(permissions: string): number {
    let mode = 0;
    const perms = permissions.slice(1); // Remove file type character
    
    // Owner permissions
    if (perms[0] === 'r') mode |= 0o400;
    if (perms[1] === 'w') mode |= 0o200;
    if (perms[2] === 'x') mode |= 0o100;
    
    // Group permissions
    if (perms[3] === 'r') mode |= 0o040;
    if (perms[4] === 'w') mode |= 0o020;
    if (perms[5] === 'x') mode |= 0o010;
    
    // Other permissions
    if (perms[6] === 'r') mode |= 0o004;
    if (perms[7] === 'w') mode |= 0o002;
    if (perms[8] === 'x') mode |= 0o001;
    
    return mode;
  }
}