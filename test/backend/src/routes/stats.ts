import { Router } from 'express';
import { DockerControl } from '@org/docker-control';

export function statsRouter(dockerControl: DockerControl): Router {
  const router = Router();

  // Get container stats (one-shot)
  router.get('/containers/:id', async (req, res, next) => {
    try {
      const stats = await dockerControl.stats.getStats(req.params.id);
      res.json(stats);
    } catch (error) {
      next(error);
    }
  });

  // Stream stats (SSE)
  router.get('/containers/:id/stream', async (req, res, next) => {
    try {
      // Set up SSE
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      const stopStream = await dockerControl.stats.streamStats(
        req.params.id,
        (stats) => {
          res.write(`data: ${JSON.stringify(stats)}\n\n`);
        },
        {
          interval: req.query.interval ? parseInt(req.query.interval as string) : 1000
        }
      );

      // Clean up on client disconnect
      req.on('close', () => {
        stopStream();
        res.end();
      });
    } catch (error) {
      next(error);
    }
  });

  // Get all container stats
  router.get('/all', async (req, res, next) => {
    try {
      const statsMap = await dockerControl.stats.getAllStats();
      const stats = Array.from(statsMap.entries()).map(([id, data]) => ({
        containerId: id,
        ...data
      }));
      res.json(stats);
    } catch (error) {
      next(error);
    }
  });

  // Get resource usage
  router.get('/containers/:id/usage', async (req, res, next) => {
    try {
      const usage = await dockerControl.stats.getResourceUsage(req.params.id);
      res.json(usage);
    } catch (error) {
      next(error);
    }
  });

  // Get active stats streams
  router.get('/streams', async (req, res, next) => {
    try {
      const streams = dockerControl.stats.getActiveStreams();
      res.json(streams);
    } catch (error) {
      next(error);
    }
  });

  // Stop stats stream
  router.delete('/containers/:id/stream', async (req, res, next) => {
    try {
      dockerControl.stats.stopStream(req.params.id);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  return router;
}