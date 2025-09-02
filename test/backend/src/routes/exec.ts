import { Router } from 'express';
import { DockerControl } from '@org/docker-control';

export function execRouter(dockerControl: DockerControl): Router {
  const router = Router();

  // Create exec instance
  router.post('/containers/:id/exec', async (req, res, next) => {
    try {
      const execId = await dockerControl.exec.create(req.params.id, req.body);
      res.json({ id: execId });
    } catch (error) {
      next(error);
    }
  });

  // Start exec instance (non-interactive)
  router.post('/:id/start', async (req, res, next) => {
    try {
      // For non-interactive, we'll collect output
      const stream = await dockerControl.exec.start(req.params.id, req.body);
      
      let output = '';
      stream.on('data', (chunk: Buffer) => {
        output += chunk.toString();
      });
      
      stream.on('end', () => {
        res.json({ output });
      });
      
      stream.on('error', next);
    } catch (error) {
      next(error);
    }
  });

  // Inspect exec instance
  router.get('/:id', async (req, res, next) => {
    try {
      const info = await dockerControl.exec.inspect(req.params.id);
      res.json(info);
    } catch (error) {
      next(error);
    }
  });

  // Resize TTY
  router.post('/:id/resize', async (req, res, next) => {
    try {
      await dockerControl.exec.resize(req.params.id, req.body);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  // Run command and get output
  router.post('/containers/:id/command', async (req, res, next) => {
    try {
      const result = await dockerControl.exec.command(
        req.params.id,
        req.body.cmd,
        req.body.options
      );
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  // Get active sessions
  router.get('/sessions', async (req, res, next) => {
    try {
      const sessions = dockerControl.exec.getActiveSessions();
      res.json(sessions);
    } catch (error) {
      next(error);
    }
  });

  // Get sessions by container
  router.get('/containers/:id/sessions', async (req, res, next) => {
    try {
      const sessions = dockerControl.exec.getSessionsByContainer(req.params.id);
      res.json(sessions);
    } catch (error) {
      next(error);
    }
  });

  return router;
}