import { Socket } from 'socket.io';
import { DockerControl } from '@org/docker-control';

export function setupContainerHandlers(socket: Socket, dockerControl: DockerControl): void {
  // List containers
  socket.on('containers:list', async (options, callback) => {
    try {
      const containers = await dockerControl.containers.list(options);
      callback({ success: true, data: containers });
    } catch (error: any) {
      callback({ success: false, error: error.message });
    }
  });

  // Create container
  socket.on('container:create', async (spec, callback) => {
    try {
      const containerId = await dockerControl.containers.create(spec);
      callback({ success: true, data: { id: containerId } });
    } catch (error: any) {
      callback({ success: false, error: error.message });
    }
  });

  // Start container
  socket.on('container:start', async (containerId, options, callback) => {
    try {
      await dockerControl.containers.start(containerId, options);
      callback({ success: true });
    } catch (error: any) {
      callback({ success: false, error: error.message });
    }
  });

  // Stop container
  socket.on('container:stop', async (containerId, options, callback) => {
    try {
      await dockerControl.containers.stop(containerId, options);
      callback({ success: true });
    } catch (error: any) {
      callback({ success: false, error: error.message });
    }
  });

  // Restart container
  socket.on('container:restart', async (containerId, options, callback) => {
    try {
      await dockerControl.containers.restart(containerId, options);
      callback({ success: true });
    } catch (error: any) {
      callback({ success: false, error: error.message });
    }
  });

  // Remove container
  socket.on('container:remove', async (containerId, options, callback) => {
    try {
      await dockerControl.containers.remove(containerId, options);
      callback({ success: true });
    } catch (error: any) {
      callback({ success: false, error: error.message });
    }
  });

  // Inspect container
  socket.on('container:inspect', async (containerId, callback) => {
    try {
      const info = await dockerControl.containers.inspect(containerId);
      callback({ success: true, data: info });
    } catch (error: any) {
      callback({ success: false, error: error.message });
    }
  });

  // Update container
  socket.on('container:update', async (containerId, options, callback) => {
    try {
      await dockerControl.containers.update(containerId, options);
      callback({ success: true });
    } catch (error: any) {
      callback({ success: false, error: error.message });
    }
  });

  // Pause/Unpause
  socket.on('container:pause', async (containerId, callback) => {
    try {
      await dockerControl.containers.pause(containerId);
      callback({ success: true });
    } catch (error: any) {
      callback({ success: false, error: error.message });
    }
  });

  socket.on('container:unpause', async (containerId, callback) => {
    try {
      await dockerControl.containers.unpause(containerId);
      callback({ success: true });
    } catch (error: any) {
      callback({ success: false, error: error.message });
    }
  });

  // Kill container
  socket.on('container:kill', async (containerId, signal, callback) => {
    try {
      await dockerControl.containers.kill(containerId, signal);
      callback({ success: true });
    } catch (error: any) {
      callback({ success: false, error: error.message });
    }
  });
}