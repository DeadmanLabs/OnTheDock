import { Server as SocketIOServer, Socket } from 'socket.io';
import { DockerControl } from '@org/docker-control';
import { setupContainerHandlers } from './containerHandlers';
import { setupExecHandlers } from './execHandlers';
import { setupStreamHandlers } from './streamHandlers';

export function setupSocketHandlers(io: SocketIOServer, dockerControl: DockerControl): void {
  const containerNamespace = io.of('/containers');
  
  // Subscribe to Docker events
  dockerControl.realtime.subscribe('container.status', (event) => {
    containerNamespace.to(`container:${event.containerId}`).emit('status', event.data);
  });

  dockerControl.realtime.subscribe('container.logs', (event) => {
    containerNamespace.to(`container:${event.containerId}`).emit('logs', event.data);
  });

  dockerControl.realtime.subscribe('container.stats', (event) => {
    containerNamespace.to(`container:${event.containerId}`).emit('stats', event.data);
  });

  dockerControl.realtime.subscribe('container.exec', (event) => {
    containerNamespace.to(`container:${event.containerId}`).emit('exec', event.data);
  });

  dockerControl.realtime.subscribe('container.files', (event) => {
    containerNamespace.to(`container:${event.containerId}`).emit('files', event.data);
  });

  dockerControl.realtime.subscribe('image.pull', (event) => {
    containerNamespace.emit('image:pull', event.data);
  });

  dockerControl.realtime.subscribe('system.event', (event) => {
    containerNamespace.emit('system:event', event.data);
  });

  // Handle connections
  containerNamespace.on('connection', (socket: Socket) => {
    console.log(`Socket connected: ${socket.id}`);

    // Setup handlers
    setupContainerHandlers(socket, dockerControl);
    setupExecHandlers(socket, dockerControl);
    setupStreamHandlers(socket, dockerControl);

    // Room management
    socket.on('subscribe', (room: string) => {
      socket.join(room);
      console.log(`Socket ${socket.id} joined room: ${room}`);
    });

    socket.on('unsubscribe', (room: string) => {
      socket.leave(room);
      console.log(`Socket ${socket.id} left room: ${room}`);
    });

    // Disconnect
    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.id}`);
    });

    // Error handling
    socket.on('error', (error) => {
      console.error(`Socket error for ${socket.id}:`, error);
    });
  });

  console.log('Socket.IO handlers configured');
}