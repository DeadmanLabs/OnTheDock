import { Router } from 'express';
import { DockerControl } from '@org/docker-control';
import multer from 'multer';

const upload = multer({ storage: multer.memoryStorage() });

export function containersRouter(dockerControl: DockerControl): Router {
  const router = Router();

  // List containers
  router.get('/', async (req, res, next) => {
    try {
      const containers = await dockerControl.containers.list({
        all: req.query.all === 'true',
        limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
        filters: req.query.filters ? JSON.parse(req.query.filters as string) : undefined
      });
      res.json(containers);
    } catch (error) {
      next(error);
    }
  });

  // Create container
  router.post('/', async (req, res, next) => {
    try {
      const containerId = await dockerControl.containers.create(req.body);
      res.status(201).json({ id: containerId });
    } catch (error) {
      next(error);
    }
  });

  // Get container info
  router.get('/:id', async (req, res, next) => {
    try {
      const info = await dockerControl.containers.inspect(req.params.id);
      res.json(info);
    } catch (error) {
      next(error);
    }
  });

  // Start container
  router.post('/:id/start', async (req, res, next) => {
    try {
      await dockerControl.containers.start(req.params.id, req.body);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  // Stop container
  router.post('/:id/stop', async (req, res, next) => {
    try {
      await dockerControl.containers.stop(req.params.id, req.body);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  // Restart container
  router.post('/:id/restart', async (req, res, next) => {
    try {
      await dockerControl.containers.restart(req.params.id, req.body);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  // Pause container
  router.post('/:id/pause', async (req, res, next) => {
    try {
      await dockerControl.containers.pause(req.params.id);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  // Unpause container
  router.post('/:id/unpause', async (req, res, next) => {
    try {
      await dockerControl.containers.unpause(req.params.id);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  // Kill container
  router.post('/:id/kill', async (req, res, next) => {
    try {
      await dockerControl.containers.kill(req.params.id, req.body.signal);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  // Remove container
  router.delete('/:id', async (req, res, next) => {
    try {
      await dockerControl.containers.remove(req.params.id, {
        force: req.query.force === 'true',
        removeVolumes: req.query.v === 'true'
      });
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  // Update container
  router.put('/:id', async (req, res, next) => {
    try {
      await dockerControl.containers.update(req.params.id, req.body);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  // Rename container
  router.post('/:id/rename', async (req, res, next) => {
    try {
      await dockerControl.containers.rename(req.params.id, req.body.name);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  // Prune containers
  router.post('/prune', async (req, res, next) => {
    try {
      const result = await dockerControl.containers.prune(req.body);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  // Wait for container
  router.post('/:id/wait', async (req, res, next) => {
    try {
      const exitCode = await dockerControl.containers.wait(req.params.id, req.body.condition);
      res.json({ exitCode });
    } catch (error) {
      next(error);
    }
  });

  return router;
}