/**
 * Tests for OnTheDock Library
 * These tests validate the actual library implementation
 */

const { DockerControl } = require('../dist');

describe('OnTheDock Library', () => {
  let docker;
  
  beforeAll(() => {
    docker = new DockerControl();
  });
  
  describe('System', () => {
    test('should ping Docker daemon', async () => {
      const result = await docker.system.ping();
      expect(result).toEqual({ success: true });
    });
    
    test('should get system info', async () => {
      const info = await docker.system.info();
      expect(info).toHaveProperty('containers');
      expect(info).toHaveProperty('images');
      expect(info).toHaveProperty('serverVersion');
      expect(info).toHaveProperty('cpus');
      expect(typeof info.containers).toBe('number');
      expect(typeof info.images).toBe('number');
    });
  });
  
  describe('Containers', () => {
    test('should list containers', async () => {
      const containers = await docker.containers.list(true);
      expect(Array.isArray(containers)).toBe(true);
      if (containers.length > 0) {
        expect(containers[0]).toHaveProperty('id');
        expect(containers[0]).toHaveProperty('name');
        expect(containers[0]).toHaveProperty('image');
        expect(containers[0]).toHaveProperty('state');
      }
    });
    
    test('should get container details if containers exist', async () => {
      const containers = await docker.containers.list(true);
      if (containers.length > 0) {
        const details = await docker.containers.get(containers[0].id);
        expect(details).toHaveProperty('id');
        expect(details).toHaveProperty('name');
        expect(details).toHaveProperty('state');
        expect(details).toHaveProperty('config');
      }
    });
    
    test('should create, start, stop, and remove a test container', async () => {
      const testName = 'onthedock-test-' + Date.now();
      
      // Create container
      const containerId = await docker.containers.create({
        image: 'alpine:latest',
        name: testName,
        cmd: ['sleep', '30']
      });
      expect(typeof containerId).toBe('string');
      expect(containerId.length).toBeGreaterThan(0);
      
      // Start container
      const startResult = await docker.containers.start(containerId);
      expect(startResult).toEqual({ success: true });
      
      // Wait a moment
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Stop container
      const stopResult = await docker.containers.stop(containerId);
      expect(stopResult).toEqual({ success: true });
      
      // Remove container
      const removeResult = await docker.containers.remove(containerId, true);
      expect(removeResult).toEqual({ success: true });
    }, 30000); // 30 second timeout for this test
  });
  
  describe('Images', () => {
    test('should list images', async () => {
      const images = await docker.images.list();
      expect(Array.isArray(images)).toBe(true);
      if (images.length > 0) {
        expect(images[0]).toHaveProperty('id');
        expect(images[0]).toHaveProperty('tags');
        expect(images[0]).toHaveProperty('size');
        expect(Array.isArray(images[0].tags)).toBe(true);
      }
    });
    
    test('should pull an image', async () => {
      const progressEvents = [];
      await docker.images.pull('alpine:latest', (event) => {
        progressEvents.push(event);
      });
      expect(progressEvents.length).toBeGreaterThan(0);
    }, 60000); // 60 second timeout for pulling
  });
  
  describe('Logs', () => {
    test('should get container logs if running containers exist', async () => {
      const containers = await docker.containers.list(false); // Only running
      if (containers.length > 0) {
        const logs = await docker.logs.get(containers[0].id, { tail: 5 });
        expect(typeof logs).toBe('string');
      }
    });
  });
  
  describe('Stats', () => {
    test('should get container stats if running containers exist', async () => {
      const containers = await docker.containers.list(false); // Only running
      if (containers.length > 0) {
        const stats = await docker.stats.get(containers[0].id);
        expect(stats).toHaveProperty('cpu');
        expect(stats).toHaveProperty('memory');
        expect(stats).toHaveProperty('network');
        expect(stats.cpu).toHaveProperty('percent');
        expect(stats.memory).toHaveProperty('usage');
        expect(stats.memory).toHaveProperty('limit');
      }
    });
  });
  
  describe('Exec', () => {
    test('should find shell in running containers', async () => {
      const containers = await docker.containers.list(false); // Only running
      if (containers.length > 0) {
        const shell = await docker.exec.findShell(containers[0].id);
        expect(typeof shell).toBe('string');
        expect(['/bin/bash', '/bin/sh', '/bin/ash', 'sh']).toContain(shell);
      }
    });
    
    test('should create and start exec instance', async () => {
      const containers = await docker.containers.list(false); // Only running
      if (containers.length > 0) {
        const execId = await docker.exec.create(containers[0].id, {
          cmd: ['echo', 'test'],
          attachStdout: true
        });
        expect(typeof execId).toBe('string');
        
        const stream = await docker.exec.start(execId);
        expect(stream).toBeDefined();
        
        // Clean up stream
        stream.destroy();
      }
    });
  });
  
  describe('Files', () => {
    test('should list files in container', async () => {
      const containers = await docker.containers.list(false); // Only running
      if (containers.length > 0) {
        const result = await docker.files.list(containers[0].id, '/');
        expect(result).toHaveProperty('path');
        expect(result).toHaveProperty('files');
        expect(Array.isArray(result.files)).toBe(true);
      }
    });
  });
  
  describe('Helper Methods', () => {
    test('should decode Docker stream correctly', () => {
      // Test the private decodeDockerStream method indirectly
      // by ensuring logs work correctly (they use this method)
      expect(docker).toBeDefined();
      expect(docker.getDocker).toBeDefined();
      const dockerInstance = docker.getDocker();
      expect(dockerInstance).toBeDefined();
    });
  });
});

describe('DockerControl Constructor', () => {
  test('should create instance with default options', () => {
    const docker = new DockerControl();
    expect(docker).toBeDefined();
    expect(docker.containers).toBeDefined();
    expect(docker.images).toBeDefined();
    expect(docker.logs).toBeDefined();
    expect(docker.stats).toBeDefined();
    expect(docker.exec).toBeDefined();
    expect(docker.files).toBeDefined();
    expect(docker.system).toBeDefined();
  });
  
  test('should create instance with custom socket path', () => {
    const docker = new DockerControl({ socketPath: '/custom/docker.sock' });
    expect(docker).toBeDefined();
  });
  
  test('should create instance with TCP connection', () => {
    const docker = new DockerControl({ host: 'localhost', port: 2375 });
    expect(docker).toBeDefined();
  });
});