import { Router } from 'express';
import { DockerControl } from '@org/docker-control';
import multer from 'multer';

const upload = multer({ storage: multer.memoryStorage() });

export function filesRouter(dockerControl: DockerControl): Router {
  const router = Router();

  // List files in directory
  router.get('/containers/:id/ls', async (req, res, next) => {
    try {
      const files = await dockerControl.files.list(
        req.params.id,
        req.query.path as string,
        {
          recursive: req.query.recursive === 'true',
          includeHidden: req.query.includeHidden === 'true'
        }
      );
      res.json(files);
    } catch (error) {
      next(error);
    }
  });

  // Get file stats
  router.get('/containers/:id/stat', async (req, res, next) => {
    try {
      const stat = await dockerControl.files.stat(
        req.params.id,
        req.query.path as string
      );
      res.json(stat);
    } catch (error) {
      next(error);
    }
  });

  // Upload file
  router.post('/containers/:id/upload', upload.single('file'), async (req, res, next) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'No file provided' });
        return;
      }

      await dockerControl.files.upload(
        req.params.id,
        req.file.buffer,
        req.body.path,
        {
          noOverwriteDirNonDir: req.body.noOverwriteDirNonDir === 'true',
          copyUIDGID: req.body.copyUIDGID === 'true'
        }
      );
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  // Download file
  router.get('/containers/:id/download', async (req, res, next) => {
    try {
      const buffer = await dockerControl.files.download(
        req.params.id,
        req.query.path as string
      );
      
      const filename = (req.query.path as string).split('/').pop() || 'download';
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (error) {
      next(error);
    }
  });

  // Delete file
  router.delete('/containers/:id/file', async (req, res, next) => {
    try {
      await dockerControl.files.delete(
        req.params.id,
        req.query.path as string
      );
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  // Create directory
  router.post('/containers/:id/mkdir', async (req, res, next) => {
    try {
      await dockerControl.files.mkdir(
        req.params.id,
        req.body.path,
        {
          recursive: req.body.recursive,
          mode: req.body.mode
        }
      );
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  // Copy file
  router.post('/containers/:id/copy', async (req, res, next) => {
    try {
      await dockerControl.files.copy(
        req.params.id,
        req.body.source,
        req.body.destination
      );
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  // Move file
  router.post('/containers/:id/move', async (req, res, next) => {
    try {
      await dockerControl.files.move(
        req.params.id,
        req.body.source,
        req.body.destination
      );
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  return router;
}