import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { DockerControl } from '../../src';
import { ContainerCreateOptions } from '../../src/models/Container';

describe('DockerControl Integration Tests', () => {
  let docker: DockerControl;
  let testContainerId: string | null = null;
  const testImageName = 'alpine:latest';
  const testContainerName = `test-container-${Date.now()}`;

  beforeAll(async () => {
    docker = new DockerControl({
      transport: {
        type: 'socket',
        socketPath: '/var/run/docker.sock'
      }
    });

    await docker.connect();

    // Pull test image if not exists
    try {
      await docker.images.pull(testImageName);
    } catch (error) {
      console.log('Image already exists or pull failed:', error);
    }
  });

  afterAll(async () => {
    // Cleanup: Remove test container if it exists
    if (testContainerId) {
      try {
        await docker.containers.stop(testContainerId);
        await docker.containers.remove(testContainerId, { force: true });
      } catch (error) {
        console.log('Cleanup error:', error);
      }
    }

    await docker.disconnect();
  });

  describe('Connection', () => {
    it('should connect to Docker daemon', async () => {
      const info = await docker.system.getInfo();
      
      expect(info).toBeDefined();
      expect(info.ID).toBeDefined();
      expect(info.ServerVersion).toBeDefined();
    });

    it('should get Docker version', async () => {
      const version = await docker.system.getVersion();
      
      expect(version).toBeDefined();
      expect(version.Version).toBeDefined();
      expect(version.ApiVersion).toBeDefined();
    });
  });

  describe('Container Lifecycle', () => {
    it('should create a container', async () => {
      const options: ContainerCreateOptions = {
        name: testContainerName,
        image: testImageName,
        command: ['sh', '-c', 'sleep 300'],
        hostConfig: {
          autoRemove: false
        }
      };

      testContainerId = await docker.containers.create(options);
      
      expect(testContainerId).toBeDefined();
      expect(typeof testContainerId).toBe('string');
    });

    it('should list containers', async () => {
      const containers = await docker.containers.list({ all: true });
      
      expect(Array.isArray(containers)).toBe(true);
      const testContainer = containers.find(c => c.id === testContainerId);
      expect(testContainer).toBeDefined();
    });

    it('should get container details', async () => {
      if (!testContainerId) throw new Error('No test container');
      
      const details = await docker.containers.inspect(testContainerId);
      
      expect(details).toBeDefined();
      expect(details.Id).toBe(testContainerId);
      expect(details.Name).toContain(testContainerName);
      expect(details.Config.Image).toBe(testImageName);
    });

    it('should start a container', async () => {
      if (!testContainerId) throw new Error('No test container');
      
      await docker.containers.start(testContainerId);
      
      const details = await docker.containers.inspect(testContainerId);
      expect(details.State.Running).toBe(true);
    });

    it('should get container stats', async () => {
      if (!testContainerId) throw new Error('No test container');
      
      const stats = await docker.containers.getStats(testContainerId, { stream: false });
      
      expect(stats).toBeDefined();
      expect(stats.cpu).toBeDefined();
      expect(stats.memory).toBeDefined();
    });

    it('should stop a container', async () => {
      if (!testContainerId) throw new Error('No test container');
      
      await docker.containers.stop(testContainerId);
      
      const details = await docker.containers.inspect(testContainerId);
      expect(details.State.Running).toBe(false);
    });

    it('should restart a container', async () => {
      if (!testContainerId) throw new Error('No test container');
      
      await docker.containers.restart(testContainerId);
      
      const details = await docker.containers.inspect(testContainerId);
      expect(details.State.Running).toBe(true);
    });

    it('should remove a container', async () => {
      if (!testContainerId) throw new Error('No test container');
      
      await docker.containers.stop(testContainerId);
      await docker.containers.remove(testContainerId);
      
      const containers = await docker.containers.list({ all: true });
      const testContainer = containers.find(c => c.id === testContainerId);
      expect(testContainer).toBeUndefined();
      
      testContainerId = null;
    });
  });

  describe('Images', () => {
    it('should list images', async () => {
      const images = await docker.images.list();
      
      expect(Array.isArray(images)).toBe(true);
      expect(images.length).toBeGreaterThan(0);
      
      const alpineImage = images.find(img => 
        img.tags.some(tag => tag.includes('alpine'))
      );
      expect(alpineImage).toBeDefined();
    });

    it('should get image details', async () => {
      const images = await docker.images.list();
      const alpineImage = images.find(img => 
        img.tags.some(tag => tag.includes('alpine'))
      );
      
      if (!alpineImage) throw new Error('Alpine image not found');
      
      const details = await docker.images.inspect(alpineImage.id);
      
      expect(details).toBeDefined();
      expect(details.Id).toBeDefined();
      expect(details.RepoTags).toBeDefined();
    });

    it('should search for images', async () => {
      const results = await docker.images.search('alpine', { limit: 5 });
      
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeLessThanOrEqual(5);
      
      const alpine = results.find(r => r.name === 'alpine');
      expect(alpine).toBeDefined();
    });
  });

  describe('System', () => {
    it('should get disk usage', async () => {
      const usage = await docker.system.getDiskUsage();
      
      expect(usage).toBeDefined();
      expect(usage.images).toBeDefined();
      expect(usage.containers).toBeDefined();
      expect(usage.volumes).toBeDefined();
      expect(usage.layersSize).toBeDefined();
    });

    it('should get system resources', async () => {
      const resources = await docker.system.getResources();
      
      expect(resources).toBeDefined();
      expect(resources.cpu).toBeDefined();
      expect(resources.memory).toBeDefined();
      expect(resources.disk).toBeDefined();
    });
  });

  describe('Realtime Events', () => {
    it('should emit container events', (done) => {
      const handler = (event: any) => {
        expect(event).toBeDefined();
        expect(event.Type).toBeDefined();
        docker.realtime.off('event', handler);
        done();
      };

      docker.realtime.on('event', handler);

      // Trigger an event by creating a container
      docker.containers.create({
        name: `event-test-${Date.now()}`,
        image: testImageName,
        command: ['echo', 'test'],
        hostConfig: {
          autoRemove: true
        }
      }).then(id => {
        docker.containers.start(id).catch(console.error);
      }).catch(console.error);
    }, 10000);
  });

  describe('Error Handling', () => {
    it('should throw error for non-existent container', async () => {
      await expect(
        docker.containers.inspect('non-existent-container')
      ).rejects.toThrow();
    });

    it('should throw error for invalid image name', async () => {
      await expect(
        docker.images.pull('invalid image name')
      ).rejects.toThrow();
    });

    it('should handle network errors gracefully', async () => {
      const badDocker = new DockerControl({
        transport: {
          type: 'tcp',
          host: 'non-existent-host',
          port: 2375
        },
        request: {
          timeout: 1000,
          retries: 1
        }
      });

      await expect(badDocker.connect()).rejects.toThrow();
    });
  });
});