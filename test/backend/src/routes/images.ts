import { Router } from 'express';
import { DockerControl } from '@org/docker-control';

export function imagesRouter(dockerControl: DockerControl): Router {
  const router = Router();

  // List images
  router.get('/', async (req, res, next) => {
    try {
      const images = await dockerControl.images.list({
        all: req.query.all === 'true',
        filters: req.query.filters ? JSON.parse(req.query.filters as string) : undefined,
        digests: req.query.digests === 'true'
      });
      res.json(images);
    } catch (error) {
      next(error);
    }
  });

  // Pull image
  router.post('/pull', async (req, res, next) => {
    try {
      await dockerControl.images.pull(req.body.image, req.body.options);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  // Get image info
  router.get('/:id', async (req, res, next) => {
    try {
      const info = await dockerControl.images.inspect(req.params.id);
      res.json(info);
    } catch (error) {
      next(error);
    }
  });

  // Tag image
  router.post('/:id/tag', async (req, res, next) => {
    try {
      await dockerControl.images.tag(req.params.id, req.body);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  // Remove image
  router.delete('/:id', async (req, res, next) => {
    try {
      await dockerControl.images.remove(req.params.id, {
        force: req.query.force === 'true',
        noprune: req.query.noprune === 'true'
      });
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  // Push image
  router.post('/:id/push', async (req, res, next) => {
    try {
      await dockerControl.images.push(req.params.id, req.body);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  // Get image history
  router.get('/:id/history', async (req, res, next) => {
    try {
      const history = await dockerControl.images.history(req.params.id);
      res.json(history);
    } catch (error) {
      next(error);
    }
  });

  // Prune images
  router.post('/prune', async (req, res, next) => {
    try {
      const result = await dockerControl.images.prune(req.body);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  // Search images
  router.get('/search', async (req, res, next) => {
    try {
      const results = await dockerControl.images.search(
        req.query.term as string,
        {
          limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
          filters: req.query.filters ? JSON.parse(req.query.filters as string) : undefined
        }
      );
      res.json(results);
    } catch (error) {
      next(error);
    }
  });

  // Export image
  router.get('/:id/export', async (req, res, next) => {
    try {
      const stream = await dockerControl.images.export(req.params.id);
      res.setHeader('Content-Type', 'application/x-tar');
      res.setHeader('Content-Disposition', `attachment; filename="${req.params.id}.tar"`);
      stream.pipe(res);
    } catch (error) {
      next(error);
    }
  });

  return router;
}