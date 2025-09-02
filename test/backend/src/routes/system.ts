import { Router } from 'express';
import { DockerControl } from '@org/docker-control';

export function systemRouter(dockerControl: DockerControl): Router {
  const router = Router();

  // Get system info
  router.get('/info', async (req, res, next) => {
    try {
      const info = await dockerControl.system.getInfo();
      res.json(info);
    } catch (error) {
      next(error);
    }
  });

  // Get version
  router.get('/version', async (req, res, next) => {
    try {
      const version = await dockerControl.system.getVersion();
      res.json(version);
    } catch (error) {
      next(error);
    }
  });

  // Get disk usage
  router.get('/df', async (req, res, next) => {
    try {
      const usage = await dockerControl.system.getDiskUsage();
      res.json(usage);
    } catch (error) {
      next(error);
    }
  });

  // Get data usage summary
  router.get('/usage', async (req, res, next) => {
    try {
      const summary = await dockerControl.system.getDataUsageSummary();
      res.json(summary);
    } catch (error) {
      next(error);
    }
  });

  // Ping Docker
  router.get('/ping', async (req, res, next) => {
    try {
      const isAlive = await dockerControl.system.ping();
      res.json({ alive: isAlive });
    } catch (error) {
      next(error);
    }
  });

  // Prune all
  router.post('/prune', async (req, res, next) => {
    try {
      const result = await dockerControl.system.pruneAll(req.body);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  // Get system resources
  router.get('/resources', async (req, res, next) => {
    try {
      const resources = await dockerControl.system.getSystemResources();
      res.json(resources);
    } catch (error) {
      next(error);
    }
  });

  // Get Docker config
  router.get('/config', async (req, res, next) => {
    try {
      const config = await dockerControl.system.getDockerConfig();
      res.json(config);
    } catch (error) {
      next(error);
    }
  });

  return router;
}