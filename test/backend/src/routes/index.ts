import { Application } from 'express';
import { DockerControl } from '@org/docker-control';
import { containersRouter } from './containers';
import { imagesRouter } from './images';
import { systemRouter } from './system';
import { execRouter } from './exec';
import { filesRouter } from './files';
import { logsRouter } from './logs';
import { statsRouter } from './stats';

export function setupRoutes(app: Application, dockerControl: DockerControl): void {
  // API routes
  app.use('/api/containers', containersRouter(dockerControl));
  app.use('/api/images', imagesRouter(dockerControl));
  app.use('/api/system', systemRouter(dockerControl));
  app.use('/api/exec', execRouter(dockerControl));
  app.use('/api/files', filesRouter(dockerControl));
  app.use('/api/logs', logsRouter(dockerControl));
  app.use('/api/stats', statsRouter(dockerControl));
  
  // 404 handler
  app.use('/api/*', (req, res) => {
    res.status(404).json({ error: 'NOT_FOUND', message: 'API endpoint not found' });
  });
}