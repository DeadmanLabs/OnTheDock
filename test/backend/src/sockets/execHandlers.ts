import { Socket } from 'socket.io';
import { DockerControl } from '@org/docker-control';
import { Writable } from 'stream';

interface ExecSession {
  execId: string;
  stream: NodeJS.ReadWriteStream;
  resize: (options: { height: number; width: number }) => Promise<void>;
  kill: () => Promise<void>;
}

const activeSessions = new Map<string, ExecSession>();

export function setupExecHandlers(socket: Socket, dockerControl: DockerControl): void {
  // Start interactive terminal
  socket.on('exec:start', async (containerId, options, callback) => {
    try {
      const session = await dockerControl.exec.interactive(containerId, options);
      
      // Store session
      const sessionId = `${socket.id}:${session.execId}`;
      activeSessions.set(sessionId, session);

      // Handle stream output
      session.stream.on('data', (chunk: Buffer) => {
        socket.emit('exec:data', {
          execId: session.execId,
          data: chunk.toString('base64')
        });
      });

      session.stream.on('end', () => {
        socket.emit('exec:exit', {
          execId: session.execId
        });
        activeSessions.delete(sessionId);
      });

      session.stream.on('error', (error) => {
        socket.emit('exec:error', {
          execId: session.execId,
          error: error.message
        });
        activeSessions.delete(sessionId);
      });

      callback({ 
        success: true, 
        data: { execId: session.execId } 
      });
    } catch (error: any) {
      callback({ success: false, error: error.message });
    }
  });

  // Send input to terminal
  socket.on('exec:stdin', async (data: { execId: string; input: string }, callback) => {
    try {
      const sessionId = `${socket.id}:${data.execId}`;
      const session = activeSessions.get(sessionId);
      
      if (!session) {
        callback({ success: false, error: 'Session not found' });
        return;
      }

      // Decode base64 input and write to stream
      const input = Buffer.from(data.input, 'base64');
      session.stream.write(input);
      
      callback({ success: true });
    } catch (error: any) {
      callback({ success: false, error: error.message });
    }
  });

  // Resize terminal
  socket.on('exec:resize', async (data: { execId: string; height: number; width: number }, callback) => {
    try {
      const sessionId = `${socket.id}:${data.execId}`;
      const session = activeSessions.get(sessionId);
      
      if (!session) {
        callback({ success: false, error: 'Session not found' });
        return;
      }

      await session.resize({ height: data.height, width: data.width });
      callback({ success: true });
    } catch (error: any) {
      callback({ success: false, error: error.message });
    }
  });

  // Stop terminal
  socket.on('exec:stop', async (execId: string, callback) => {
    try {
      const sessionId = `${socket.id}:${execId}`;
      const session = activeSessions.get(sessionId);
      
      if (!session) {
        callback({ success: false, error: 'Session not found' });
        return;
      }

      await session.kill();
      activeSessions.delete(sessionId);
      callback({ success: true });
    } catch (error: any) {
      callback({ success: false, error: error.message });
    }
  });

  // Run command (non-interactive)
  socket.on('exec:command', async (data: { containerId: string; cmd: string[]; options?: any }, callback) => {
    try {
      const result = await dockerControl.exec.command(
        data.containerId,
        data.cmd,
        data.options
      );
      callback({ success: true, data: result });
    } catch (error: any) {
      callback({ success: false, error: error.message });
    }
  });

  // Clean up sessions on disconnect
  socket.on('disconnect', () => {
    // Clean up all sessions for this socket
    for (const [sessionId, session] of activeSessions.entries()) {
      if (sessionId.startsWith(socket.id)) {
        session.kill().catch(console.error);
        activeSessions.delete(sessionId);
      }
    }
  });
}