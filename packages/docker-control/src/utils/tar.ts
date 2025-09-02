import tar from 'tar-stream';
import { Readable, Writable } from 'stream';
import { promisify } from 'util';
import { pipeline } from 'stream';
import path from 'path';
import debug from 'debug';

const log = debug('docker-control:utils:tar');
const pipelineAsync = promisify(pipeline);

export interface TarEntry {
  name: string;
  type: 'file' | 'directory' | 'symlink';
  size: number;
  mode: number;
  mtime: Date;
  linkname?: string;
  content?: Buffer;
}

export class TarHelper {
  static async createArchive(entries: TarEntry[]): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const pack = tar.pack();
      const chunks: Buffer[] = [];

      pack.on('data', (chunk) => chunks.push(chunk));
      pack.on('error', reject);
      pack.on('end', () => resolve(Buffer.concat(chunks)));

      (async () => {
        try {
          for (const entry of entries) {
            const header: tar.Headers = {
              name: entry.name,
              mode: entry.mode,
              mtime: entry.mtime,
              size: entry.type === 'file' ? entry.size : 0,
              type: this.mapEntryType(entry.type),
              linkname: entry.linkname
            };

            if (entry.type === 'file' && entry.content) {
              pack.entry(header, entry.content);
            } else {
              pack.entry(header);
            }
          }
          pack.finalize();
        } catch (error) {
          reject(error);
        }
      })();
    });
  }

  static async extractArchive(archive: Buffer | Readable): Promise<TarEntry[]> {
    const entries: TarEntry[] = [];
    const extract = tar.extract();

    extract.on('entry', async (header, stream, next) => {
      const entry: TarEntry = {
        name: header.name,
        type: this.mapHeaderType(header.type),
        size: header.size || 0,
        mode: header.mode || 0o644,
        mtime: header.mtime || new Date(),
        linkname: header.linkname
      };

      if (entry.type === 'file') {
        const chunks: Buffer[] = [];
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('end', () => {
          entry.content = Buffer.concat(chunks);
          entries.push(entry);
          next();
        });
        stream.on('error', next);
      } else {
        entries.push(entry);
        stream.on('end', next);
        stream.resume();
      }
    });

    return new Promise((resolve, reject) => {
      extract.on('finish', () => resolve(entries));
      extract.on('error', reject);

      if (Buffer.isBuffer(archive)) {
        extract.end(archive);
      } else {
        pipelineAsync(archive, extract).catch(reject);
      }
    });
  }

  static createArchiveStream(): tar.Pack {
    return tar.pack();
  }

  static createExtractStream(): tar.Extract {
    return tar.extract();
  }

  static async addFileToArchive(
    pack: tar.Pack,
    filePath: string,
    content: Buffer | string,
    options?: { mode?: number; mtime?: Date }
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const entry = pack.entry(
        {
          name: filePath,
          size: Buffer.isBuffer(content) ? content.length : Buffer.byteLength(content),
          mode: options?.mode || 0o644,
          mtime: options?.mtime || new Date(),
          type: 'file'
        },
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );

      if (entry) {
        entry.write(content);
        entry.end();
      }
    });
  }

  static async addDirectoryToArchive(
    pack: tar.Pack,
    dirPath: string,
    options?: { mode?: number; mtime?: Date }
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      pack.entry(
        {
          name: dirPath.endsWith('/') ? dirPath : `${dirPath}/`,
          type: 'directory',
          mode: options?.mode || 0o755,
          mtime: options?.mtime || new Date()
        },
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  static createFilteredExtract(
    filter: (header: tar.Headers) => boolean
  ): tar.Extract {
    const extract = tar.extract();
    const filtered = tar.extract();

    extract.on('entry', (header, stream, next) => {
      if (filter(header)) {
        filtered.emit('entry', header, stream, next);
      } else {
        stream.on('end', next);
        stream.resume();
      }
    });

    extract.on('finish', () => filtered.emit('finish'));
    extract.on('error', (err) => filtered.emit('error', err));

    return filtered;
  }

  static async modifyArchive(
    archive: Buffer,
    modifier: (entry: TarEntry) => TarEntry | null
  ): Promise<Buffer> {
    const entries = await this.extractArchive(archive);
    const modifiedEntries: TarEntry[] = [];

    for (const entry of entries) {
      const modified = modifier(entry);
      if (modified) {
        modifiedEntries.push(modified);
      }
    }

    return this.createArchive(modifiedEntries);
  }

  static normalizePath(filePath: string): string {
    // Remove leading slash and normalize separators
    return filePath.replace(/^\/+/, '').replace(/\\/g, '/');
  }

  static joinPath(...parts: string[]): string {
    return path.posix.join(...parts);
  }

  private static mapEntryType(type: 'file' | 'directory' | 'symlink'): tar.Headers['type'] {
    switch (type) {
      case 'file':
        return 'file';
      case 'directory':
        return 'directory';
      case 'symlink':
        return 'symlink';
      default:
        return 'file';
    }
  }

  private static mapHeaderType(type?: tar.Headers['type']): 'file' | 'directory' | 'symlink' {
    switch (type) {
      case 'directory':
        return 'directory';
      case 'symlink':
        return 'symlink';
      case 'file':
      default:
        return 'file';
    }
  }

  static async streamToArchive(
    inputStream: Readable,
    outputPath: string
  ): Promise<void> {
    const pack = tar.pack();
    
    await this.addFileToArchive(pack, outputPath, await this.streamToBuffer(inputStream));
    pack.finalize();
    
    return new Promise((resolve, reject) => {
      pack.on('end', resolve);
      pack.on('error', reject);
    });
  }

  private static async streamToBuffer(stream: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];
    return new Promise((resolve, reject) => {
      stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      stream.on('error', reject);
      stream.on('end', () => resolve(Buffer.concat(chunks)));
    });
  }
}