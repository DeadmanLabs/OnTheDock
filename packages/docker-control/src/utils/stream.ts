import { Readable, Writable, Transform, pipeline } from 'stream';
import { promisify } from 'util';
import debug from 'debug';

const log = debug('docker-control:utils:stream');
const pipelineAsync = promisify(pipeline);

export interface StreamOptions {
  encoding?: BufferEncoding;
  highWaterMark?: number;
  objectMode?: boolean;
}

export class StreamHelper {
  static async streamToBuffer(stream: Readable): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      stream.on('error', reject);
      stream.on('end', () => resolve(Buffer.concat(chunks)));
    });
  }

  static async streamToString(
    stream: Readable,
    encoding: BufferEncoding = 'utf8'
  ): Promise<string> {
    const buffer = await this.streamToBuffer(stream);
    return buffer.toString(encoding);
  }

  static bufferToStream(buffer: Buffer): Readable {
    const stream = new Readable();
    stream.push(buffer);
    stream.push(null);
    return stream;
  }

  static stringToStream(str: string, encoding: BufferEncoding = 'utf8'): Readable {
    return this.bufferToStream(Buffer.from(str, encoding));
  }

  static createMultiplexer(): Transform {
    return new Transform({
      transform(chunk, encoding, callback) {
        // Docker multiplexed stream format:
        // header := [8]byte{STREAM_TYPE, 0, 0, 0, SIZE1, SIZE2, SIZE3, SIZE4}
        if (chunk.length < 8) {
          callback(null, chunk);
          return;
        }

        const header = chunk.slice(0, 8);
        const streamType = header[0];
        const size = header.readUInt32BE(4);
        const payload = chunk.slice(8, 8 + size);

        const output = {
          stream: streamType === 1 ? 'stdout' : 'stderr',
          data: payload
        };

        callback(null, JSON.stringify(output) + '\n');
      }
    });
  }

  static createDemultiplexer(): Transform {
    let buffer = Buffer.alloc(0);

    return new Transform({
      transform(chunk, encoding, callback) {
        buffer = Buffer.concat([buffer, chunk]);

        while (buffer.length >= 8) {
          const header = buffer.slice(0, 8);
          const streamType = header[0];
          const size = header.readUInt32BE(4);

          if (buffer.length < 8 + size) {
            break;
          }

          const payload = buffer.slice(8, 8 + size);
          buffer = buffer.slice(8 + size);

          this.push(payload);
        }

        callback();
      },
      flush(callback) {
        if (buffer.length > 0) {
          this.push(buffer);
        }
        callback();
      }
    });
  }

  static createLineParser(onLine: (line: string) => void): Transform {
    let buffer = '';

    return new Transform({
      transform(chunk, encoding, callback) {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            onLine(line);
          }
        }

        callback(null, chunk);
      },
      flush(callback) {
        if (buffer.trim()) {
          onLine(buffer);
        }
        callback();
      }
    });
  }

  static createProgressStream(
    onProgress: (bytesTransferred: number) => void
  ): Transform {
    let totalBytes = 0;

    return new Transform({
      transform(chunk, encoding, callback) {
        totalBytes += chunk.length;
        onProgress(totalBytes);
        callback(null, chunk);
      }
    });
  }

  static async pipe(
    source: Readable,
    destination: Writable,
    options?: { onError?: (error: Error) => void }
  ): Promise<void> {
    try {
      await pipelineAsync(source, destination);
    } catch (error: any) {
      log('Stream pipe error:', error);
      if (options?.onError) {
        options.onError(error);
      } else {
        throw error;
      }
    }
  }

  static createThrottledStream(bytesPerSecond: number): Transform {
    let lastTime = Date.now();
    let bytesSent = 0;

    return new Transform({
      async transform(chunk, encoding, callback) {
        const now = Date.now();
        const elapsed = now - lastTime;

        if (elapsed >= 1000) {
          bytesSent = 0;
          lastTime = now;
        }

        if (bytesSent + chunk.length > bytesPerSecond) {
          const delay = 1000 - elapsed;
          await new Promise((resolve) => setTimeout(resolve, delay));
          bytesSent = 0;
          lastTime = Date.now();
        }

        bytesSent += chunk.length;
        callback(null, chunk);
      }
    });
  }

  static splitStream(
    predicate: (chunk: Buffer) => boolean
  ): { primary: Transform; secondary: Transform } {
    const primary = new Transform({ transform(chunk, _, cb) { cb(null, chunk); } });
    const secondary = new Transform({ transform(chunk, _, cb) { cb(null, chunk); } });

    const splitter = new Transform({
      transform(chunk, encoding, callback) {
        if (predicate(chunk)) {
          primary.write(chunk);
        } else {
          secondary.write(chunk);
        }
        callback();
      },
      flush(callback) {
        primary.end();
        secondary.end();
        callback();
      }
    });

    return { primary: splitter.pipe(primary), secondary: splitter.pipe(secondary) };
  }
}