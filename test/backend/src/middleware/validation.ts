import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

// Validation schemas
const containerNameSchema = z.string()
  .min(1)
  .max(255)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9_\-\.]*$/);

const imageNameSchema = z.string()
  .min(1)
  .max(255)
  .regex(/^[a-z0-9]+(?:[._\-\/][a-z0-9]+)*(?::[a-z0-9]+(?:[._\-][a-z0-9]+)*)?$/i);

const pathSchema = z.string()
  .min(1)
  .max(4096)
  .refine(path => !path.includes('..'), 'Path traversal detected');

const portSchema = z.number()
  .int()
  .min(1)
  .max(65535);

const commandSchema = z.array(z.string().max(10000));

const envSchema = z.array(
  z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*=.*$/)
);

// Middleware functions
export function validateContainerName(req: Request, res: Response, next: NextFunction) {
  try {
    if (req.body.name) {
      req.body.name = containerNameSchema.parse(req.body.name);
    }
    next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid container name',
        details: error.errors
      });
    }
    next(error);
  }
}

export function validateImageName(req: Request, res: Response, next: NextFunction) {
  try {
    const image = req.body.image || req.params.image || req.query.image;
    if (image) {
      imageNameSchema.parse(image);
    }
    next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid image name',
        details: error.errors
      });
    }
    next(error);
  }
}

export function validatePath(req: Request, res: Response, next: NextFunction) {
  try {
    const paths = [
      req.body.path,
      req.body.hostPath,
      req.body.containerPath,
      req.params.path,
      req.query.path
    ].filter(Boolean);

    for (const path of paths) {
      if (typeof path === 'string') {
        pathSchema.parse(path);
      }
    }
    next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid path',
        details: error.errors
      });
    }
    next(error);
  }
}

export function validateCommand(req: Request, res: Response, next: NextFunction) {
  try {
    if (req.body.command) {
      const commands = Array.isArray(req.body.command) 
        ? req.body.command 
        : [req.body.command];
      
      req.body.command = commandSchema.parse(commands);
    }
    next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid command',
        details: error.errors
      });
    }
    next(error);
  }
}

export function validatePortBindings(req: Request, res: Response, next: NextFunction) {
  try {
    if (req.body.hostConfig?.portBindings) {
      for (const [containerPort, hostPorts] of Object.entries(req.body.hostConfig.portBindings)) {
        // Validate container port format
        const match = containerPort.match(/^(\d+)\/(tcp|udp)$/);
        if (!match) {
          throw new Error(`Invalid container port format: ${containerPort}`);
        }
        
        const port = parseInt(match[1], 10);
        portSchema.parse(port);
        
        // Validate host ports
        if (Array.isArray(hostPorts)) {
          for (const hostPort of hostPorts as any[]) {
            if (hostPort.HostPort) {
              const hp = parseInt(hostPort.HostPort, 10);
              portSchema.parse(hp);
            }
          }
        }
      }
    }
    next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid port configuration',
        details: error.errors
      });
    }
    if (error instanceof Error) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: error.message
      });
    }
    next(error);
  }
}

export function validateEnvironmentVariables(req: Request, res: Response, next: NextFunction) {
  try {
    if (req.body.env) {
      req.body.env = envSchema.parse(req.body.env);
    }
    next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid environment variables',
        details: error.errors
      });
    }
    next(error);
  }
}

export function validateVolumeMounts(req: Request, res: Response, next: NextFunction) {
  try {
    if (req.body.hostConfig?.binds) {
      const binds = req.body.hostConfig.binds;
      
      for (const bind of binds) {
        const parts = bind.split(':');
        if (parts.length < 2 || parts.length > 3) {
          throw new Error(`Invalid volume mount format: ${bind}`);
        }
        
        const [hostPath, containerPath] = parts;
        
        // Check for dangerous paths
        const dangerousPaths = [
          '/etc/passwd',
          '/etc/shadow',
          '/etc/sudoers',
          '/root/.ssh',
          '/var/run/docker.sock'
        ];
        
        for (const dangerous of dangerousPaths) {
          if (hostPath.startsWith(dangerous)) {
            throw new Error(`Mounting ${dangerous} is not allowed for security reasons`);
          }
        }
        
        pathSchema.parse(hostPath);
        pathSchema.parse(containerPath);
      }
    }
    next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid volume configuration',
        details: error.errors
      });
    }
    if (error instanceof Error) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: error.message
      });
    }
    next(error);
  }
}

export function validateContainerId(req: Request, res: Response, next: NextFunction) {
  const id = req.params.id || req.body.containerId;
  
  if (!id) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'Container ID is required'
    });
  }
  
  // Docker container IDs are 12 or 64 character hex strings
  const idRegex = /^[a-f0-9]{12,64}$/i;
  if (!idRegex.test(id as string)) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'Invalid container ID format'
    });
  }
  
  next();
}

export function sanitizeInput(req: Request, res: Response, next: NextFunction) {
  const sanitizeObject = (obj: any): any => {
    if (typeof obj === 'string') {
      // Remove null bytes and control characters
      return obj.replace(/\0/g, '').replace(/[\x00-\x1F\x7F]/g, '');
    } else if (Array.isArray(obj)) {
      return obj.map(sanitizeObject);
    } else if (obj && typeof obj === 'object') {
      const sanitized: any = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          sanitized[key] = sanitizeObject(obj[key]);
        }
      }
      return sanitized;
    }
    return obj;
  };
  
  req.body = sanitizeObject(req.body);
  req.query = sanitizeObject(req.query);
  req.params = sanitizeObject(req.params);
  
  next();
}

// Validate resource limits
export function validateResourceLimits(req: Request, res: Response, next: NextFunction) {
  try {
    if (req.body.hostConfig) {
      const config = req.body.hostConfig;
      
      // Memory limit (min 4MB, max 128GB)
      if (config.memory) {
        const memory = parseInt(config.memory, 10);
        if (isNaN(memory) || memory < 4194304 || memory > 137438953472) {
          throw new Error('Memory limit must be between 4MB and 128GB');
        }
      }
      
      // CPU shares (min 0, max 262144)
      if (config.cpuShares) {
        const cpu = parseInt(config.cpuShares, 10);
        if (isNaN(cpu) || cpu < 0 || cpu > 262144) {
          throw new Error('CPU shares must be between 0 and 262144');
        }
      }
      
      // CPU quota (min -1, max 1000000)
      if (config.cpuQuota) {
        const quota = parseInt(config.cpuQuota, 10);
        if (isNaN(quota) || (quota !== -1 && (quota < 1000 || quota > 1000000))) {
          throw new Error('CPU quota must be -1 or between 1000 and 1000000');
        }
      }
    }
    next();
  } catch (error) {
    if (error instanceof Error) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: error.message
      });
    }
    next(error);
  }
}

// Validate Dockerfile content
export function validateDockerfile(req: Request, res: Response, next: NextFunction) {
  try {
    if (req.body.dockerfile) {
      const content = req.body.dockerfile;
      const lines = content.split('\n');
      
      if (lines.length > 1000) {
        throw new Error('Dockerfile exceeds maximum of 1000 lines');
      }
      
      for (const line of lines) {
        if (line.length > 10000) {
          throw new Error('Dockerfile line exceeds maximum length of 10000 characters');
        }
        
        // Check for dangerous instructions
        const trimmed = line.trim().toUpperCase();
        if (trimmed.includes('--PRIVILEGED')) {
          throw new Error('Privileged mode not allowed in Dockerfile');
        }
        if (trimmed.startsWith('ADD') && trimmed.includes('HTTP') && !trimmed.includes('HTTPS')) {
          console.warn('Warning: Insecure HTTP URL detected in Dockerfile ADD instruction');
        }
      }
    }
    next();
  } catch (error) {
    if (error instanceof Error) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: error.message
      });
    }
    next(error);
  }
}