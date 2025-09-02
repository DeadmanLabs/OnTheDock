import { Socket } from 'socket.io';
import { DockerControl } from '@org/docker-control';

interface StreamSession {
  containerId: string;
  type: 'logs' | 'stats';
  stop: () => void;
}

const activeStreams = new Map<string, StreamSession>();

export function setupStreamHandlers(socket: Socket, dockerControl: DockerControl): void {
  // Start log streaming
  socket.on('logs:follow', async (data: { containerId: string; options?: any }, callback) => {
    try {
      const streamId = `${socket.id}:logs:${data.containerId}`;
      
      // Stop existing stream if any
      const existing = activeStreams.get(streamId);
      if (existing) {
        existing.stop();
      }

      const stop = await dockerControl.logs.followLogs(
        data.containerId,
        (entry) => {
          socket.emit('logs:entry', {
            containerId: data.containerId,
            entry
          });
        },
        data.options
      );

      activeStreams.set(streamId, {
        containerId: data.containerId,
        type: 'logs',
        stop
      });

      callback({ success: true });
    } catch (error: any) {
      callback({ success: false, error: error.message });
    }
  });

  // Stop log streaming
  socket.on('logs:stop', async (containerId: string, callback) => {
    try {
      const streamId = `${socket.id}:logs:${containerId}`;
      const session = activeStreams.get(streamId);
      
      if (session) {
        session.stop();
        activeStreams.delete(streamId);
      }

      callback({ success: true });
    } catch (error: any) {
      callback({ success: false, error: error.message });
    }
  });

  // Get log tail
  socket.on('logs:tail', async (data: { containerId: string; lines?: number }, callback) => {
    try {
      const entries = await dockerControl.logs.tailLogs(
        data.containerId,
        data.lines || 100
      );
      callback({ success: true, data: entries });
    } catch (error: any) {
      callback({ success: false, error: error.message });
    }
  });

  // Search logs
  socket.on('logs:search', async (data: { containerId: string; pattern: string; options?: any }, callback) => {
    try {
      const entries = await dockerControl.logs.searchLogs(
        data.containerId,
        data.pattern,
        data.options
      );
      callback({ success: true, data: entries });
    } catch (error: any) {
      callback({ success: false, error: error.message });
    }
  });

  // Start stats streaming
  socket.on('stats:start', async (data: { containerId: string; interval?: number }, callback) => {
    try {
      const streamId = `${socket.id}:stats:${data.containerId}`;
      
      // Stop existing stream if any
      const existing = activeStreams.get(streamId);
      if (existing) {
        existing.stop();
      }

      const stop = await dockerControl.stats.streamStats(
        data.containerId,
        (stats) => {
          socket.emit('stats:data', {
            containerId: data.containerId,
            stats
          });
        },
        { interval: data.interval }
      );

      activeStreams.set(streamId, {
        containerId: data.containerId,
        type: 'stats',
        stop
      });

      callback({ success: true });
    } catch (error: any) {
      callback({ success: false, error: error.message });
    }
  });

  // Stop stats streaming
  socket.on('stats:stop', async (containerId: string, callback) => {
    try {
      const streamId = `${socket.id}:stats:${containerId}`;
      const session = activeStreams.get(streamId);
      
      if (session) {
        session.stop();
        activeStreams.delete(streamId);
      }

      callback({ success: true });
    } catch (error: any) {
      callback({ success: false, error: error.message });
    }
  });

  // Get one-shot stats
  socket.on('stats:get', async (containerId: string, callback) => {
    try {
      const stats = await dockerControl.stats.getStats(containerId);
      callback({ success: true, data: stats });
    } catch (error: any) {
      callback({ success: false, error: error.message });
    }
  });

  // File operations
  socket.on('files:list', async (data: { containerId: string; path: string; options?: any }, callback) => {
    try {
      const files = await dockerControl.files.list(
        data.containerId,
        data.path,
        data.options
      );
      callback({ success: true, data: files });
    } catch (error: any) {
      callback({ success: false, error: error.message });
    }
  });

  socket.on('files:stat', async (data: { containerId: string; path: string }, callback) => {
    try {
      const stat = await dockerControl.files.stat(
        data.containerId,
        data.path
      );
      callback({ success: true, data: stat });
    } catch (error: any) {
      callback({ success: false, error: error.message });
    }
  });

  socket.on('files:delete', async (data: { containerId: string; path: string }, callback) => {
    try {
      await dockerControl.files.delete(
        data.containerId,
        data.path
      );
      callback({ success: true });
    } catch (error: any) {
      callback({ success: false, error: error.message });
    }
  });

  socket.on('files:mkdir', async (data: { containerId: string; path: string; options?: any }, callback) => {
    try {
      await dockerControl.files.mkdir(
        data.containerId,
        data.path,
        data.options
      );
      callback({ success: true });
    } catch (error: any) {
      callback({ success: false, error: error.message });
    }
  });

  // Clean up streams on disconnect
  socket.on('disconnect', () => {
    for (const [streamId, session] of activeStreams.entries()) {
      if (streamId.startsWith(socket.id)) {
        session.stop();
        activeStreams.delete(streamId);
      }
    }
  });
}