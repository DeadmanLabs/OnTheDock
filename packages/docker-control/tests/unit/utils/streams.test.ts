import { describe, it, expect, jest } from '@jest/globals';
import { Readable, Writable } from 'stream';
import { 
  streamToBuffer, 
  bufferToStream, 
  parseMultiplexedStream,
  demuxStream
} from '../../../src/utils/streams';

describe('Stream utilities', () => {
  describe('streamToBuffer', () => {
    it('should convert stream to buffer', async () => {
      const data = 'Hello, World!';
      const stream = Readable.from([data]);
      
      const buffer = await streamToBuffer(stream);
      
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.toString()).toBe(data);
    });

    it('should handle multiple chunks', async () => {
      const chunks = ['Hello', ', ', 'World', '!'];
      const stream = Readable.from(chunks);
      
      const buffer = await streamToBuffer(stream);
      
      expect(buffer.toString()).toBe('Hello, World!');
    });

    it('should handle empty stream', async () => {
      const stream = Readable.from([]);
      
      const buffer = await streamToBuffer(stream);
      
      expect(buffer.length).toBe(0);
    });

    it('should handle stream errors', async () => {
      const stream = new Readable({
        read() {
          this.emit('error', new Error('Stream error'));
        }
      });
      
      await expect(streamToBuffer(stream)).rejects.toThrow('Stream error');
    });
  });

  describe('bufferToStream', () => {
    it('should convert buffer to stream', async () => {
      const data = 'Hello, World!';
      const buffer = Buffer.from(data);
      
      const stream = bufferToStream(buffer);
      const result = await streamToBuffer(stream);
      
      expect(result.toString()).toBe(data);
    });

    it('should handle empty buffer', async () => {
      const buffer = Buffer.alloc(0);
      
      const stream = bufferToStream(buffer);
      const result = await streamToBuffer(stream);
      
      expect(result.length).toBe(0);
    });
  });

  describe('parseMultiplexedStream', () => {
    it('should parse Docker multiplexed stream format', () => {
      // Docker multiplexed stream format:
      // [stream type (1 byte)][reserved (3 bytes)][size (4 bytes)][data]
      const stdout = Buffer.from('stdout data');
      const stderr = Buffer.from('stderr data');
      
      // Create multiplexed stream
      const stdoutHeader = Buffer.alloc(8);
      stdoutHeader[0] = 1; // stdout
      stdoutHeader.writeUInt32BE(stdout.length, 4);
      
      const stderrHeader = Buffer.alloc(8);
      stderrHeader[0] = 2; // stderr
      stderrHeader.writeUInt32BE(stderr.length, 4);
      
      const multiplexed = Buffer.concat([
        stdoutHeader, stdout,
        stderrHeader, stderr
      ]);
      
      const result = parseMultiplexedStream(multiplexed);
      
      expect(result.stdout).toBe('stdout data');
      expect(result.stderr).toBe('stderr data');
    });

    it('should handle partial frames', () => {
      const data = Buffer.from('test');
      const header = Buffer.alloc(8);
      header[0] = 1;
      header.writeUInt32BE(10, 4); // Size larger than actual data
      
      const multiplexed = Buffer.concat([header, data]);
      
      const result = parseMultiplexedStream(multiplexed);
      
      // Should handle partial frame gracefully
      expect(result.stdout).toBe('');
      expect(result.stderr).toBe('');
    });

    it('should handle non-multiplexed stream', () => {
      const data = Buffer.from('plain text data');
      
      const result = parseMultiplexedStream(data);
      
      expect(result.stdout).toBe('plain text data');
      expect(result.stderr).toBe('');
    });
  });

  describe('demuxStream', () => {
    it('should demultiplex Docker stream', (done) => {
      const stdout: string[] = [];
      const stderr: string[] = [];
      
      const stdoutStream = new Writable({
        write(chunk, encoding, callback) {
          stdout.push(chunk.toString());
          callback();
        }
      });
      
      const stderrStream = new Writable({
        write(chunk, encoding, callback) {
          stderr.push(chunk.toString());
          callback();
        }
      });
      
      // Create multiplexed input
      const input = new Readable({ read() {} });
      
      demuxStream(input, stdoutStream, stderrStream);
      
      // Create test data
      const stdoutData = Buffer.from('stdout line\n');
      const stdoutHeader = Buffer.alloc(8);
      stdoutHeader[0] = 1;
      stdoutHeader.writeUInt32BE(stdoutData.length, 4);
      
      const stderrData = Buffer.from('stderr line\n');
      const stderrHeader = Buffer.alloc(8);
      stderrHeader[0] = 2;
      stderrHeader.writeUInt32BE(stderrData.length, 4);
      
      // Push data
      input.push(Buffer.concat([stdoutHeader, stdoutData]));
      input.push(Buffer.concat([stderrHeader, stderrData]));
      input.push(null); // End stream
      
      setTimeout(() => {
        expect(stdout.join('')).toBe('stdout line\n');
        expect(stderr.join('')).toBe('stderr line\n');
        done();
      }, 100);
    });

    it('should handle stream type 3 (stdin)', (done) => {
      const stdout: string[] = [];
      const stderr: string[] = [];
      
      const stdoutStream = new Writable({
        write(chunk, encoding, callback) {
          stdout.push(chunk.toString());
          callback();
        }
      });
      
      const stderrStream = new Writable({
        write(chunk, encoding, callback) {
          stderr.push(chunk.toString());
          callback();
        }
      });
      
      const input = new Readable({ read() {} });
      
      demuxStream(input, stdoutStream, stderrStream);
      
      // Type 3 is stdin, should be treated like stdout
      const data = Buffer.from('stdin data\n');
      const header = Buffer.alloc(8);
      header[0] = 3;
      header.writeUInt32BE(data.length, 4);
      
      input.push(Buffer.concat([header, data]));
      input.push(null);
      
      setTimeout(() => {
        expect(stdout.join('')).toBe('stdin data\n');
        expect(stderr.join('')).toBe('');
        done();
      }, 100);
    });
  });
});