import { Router } from 'express';
import { DockerControl } from '@org/docker-control';

export function logsRouter(dockerControl: DockerControl): Router {
  const router = Router();

  // Get logs
  router.get('/containers/:id', async (req, res, next) => {
    try {
      const logs = await dockerControl.logs.getLogs(req.params.id, {
        stdout: req.query.stdout !== 'false',
        stderr: req.query.stderr !== 'false',
        since: req.query.since ? parseInt(req.query.since as string) : undefined,
        until: req.query.until ? parseInt(req.query.until as string) : undefined,
        timestamps: req.query.timestamps !== 'false',
        tail: req.query.tail ? 
          (req.query.tail === 'all' ? 'all' : parseInt(req.query.tail as string)) : 
          undefined
      });
      res.json({ logs });
    } catch (error) {
      next(error);
    }
  });

  // Stream logs (SSE)
  router.get('/containers/:id/stream', async (req, res, next) => {
    try {
      // Set up SSE
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      const stopFollowing = await dockerControl.logs.followLogs(
        req.params.id,
        (entry) => {
          res.write(`data: ${JSON.stringify(entry)}\n\n`);
        },
        {
          stdout: req.query.stdout !== 'false',
          stderr: req.query.stderr !== 'false',
          timestamps: req.query.timestamps !== 'false',
          tail: req.query.tail ? parseInt(req.query.tail as string) : 100
        }
      );

      // Clean up on client disconnect
      req.on('close', () => {
        stopFollowing();
        res.end();
      });
    } catch (error) {
      next(error);
    }
  });

  // Tail logs
  router.get('/containers/:id/tail', async (req, res, next) => {
    try {
      const entries = await dockerControl.logs.tailLogs(
        req.params.id,
        req.query.lines ? parseInt(req.query.lines as string) : 100
      );
      res.json(entries);
    } catch (error) {
      next(error);
    }
  });

  // Search logs
  router.get('/containers/:id/search', async (req, res, next) => {
    try {
      const pattern = req.query.pattern as string;
      if (!pattern) {
        res.status(400).json({ error: 'Pattern is required' });
        return;
      }

      const entries = await dockerControl.logs.searchLogs(
        req.params.id,
        pattern,
        {
          since: req.query.since ? parseInt(req.query.since as string) : undefined,
          until: req.query.until ? parseInt(req.query.until as string) : undefined,
          timestamps: true
        }
      );
      res.json(entries);
    } catch (error) {
      next(error);
    }
  });

  // Get active log streams
  router.get('/streams', async (req, res, next) => {
    try {
      const streams = dockerControl.logs.getActiveStreams();
      res.json(streams);
    } catch (error) {
      next(error);
    }
  });

  // Stop log stream
  router.delete('/containers/:id/stream', async (req, res, next) => {
    try {
      await dockerControl.logs.stopStream(req.params.id);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  return router;
}