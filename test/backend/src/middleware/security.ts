import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { InputValidator } from '@org/docker-control/security/InputValidator';

// Rate limiting configurations for different endpoints
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

export const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10, // Limit each IP to 10 requests per windowMs for sensitive operations
  message: 'Too many requests for this operation, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // Limit auth attempts
  skipSuccessfulRequests: true,
  message: 'Too many authentication attempts, please try again later.',
});

// Request size limiting
export const requestSizeLimiter = (req: Request, res: Response, next: NextFunction) => {
  const contentLength = parseInt(req.headers['content-length'] || '0', 10);
  const maxSize = 50 * 1024 * 1024; // 50MB

  if (contentLength > maxSize) {
    return res.status(413).json({
      success: false,
      error: 'Request entity too large'
    });
  }

  next();
};

// Input validation middleware
export const validateContainerName = (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.body.name) {
      req.body.name = InputValidator.validateContainerName(req.body.name);
    }
    next();
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

export const validateImageName = (req: Request, res: Response, next: NextFunction) => {
  try {
    const image = req.body.image || req.params.image || req.query.image;
    if (image) {
      InputValidator.validateImageName(image as string);
    }
    next();
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

export const validatePath = (req: Request, res: Response, next: NextFunction) => {
  try {
    const path = req.body.path || req.params.path || req.query.path;
    if (path) {
      InputValidator.validatePath(path as string);
    }
    next();
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

export const validateCommand = (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.body.command) {
      req.body.command = InputValidator.validateCommand(req.body.command);
    }
    next();
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

// Security headers middleware
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "ws:", "wss:"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
});

// API key authentication (optional)
export const apiKeyAuth = (req: Request, res: Response, next: NextFunction) => {
  const apiKey = req.headers['x-api-key'] || req.query.apiKey;
  const expectedKey = process.env.API_KEY;

  // Skip if no API key is configured
  if (!expectedKey) {
    return next();
  }

  if (!apiKey || apiKey !== expectedKey) {
    return res.status(401).json({
      success: false,
      error: 'Invalid or missing API key'
    });
  }

  next();
};

// Container ID validation
export const validateContainerId = (req: Request, res: Response, next: NextFunction) => {
  const id = req.params.id || req.body.containerId;
  
  if (!id) {
    return res.status(400).json({
      success: false,
      error: 'Container ID is required'
    });
  }

  // Docker container IDs are 64 character hex strings
  const idRegex = /^[a-f0-9]{12,64}$/i;
  if (!idRegex.test(id as string)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid container ID format'
    });
  }

  next();
};

// Prevent directory traversal in file operations
export const preventDirectoryTraversal = (req: Request, res: Response, next: NextFunction) => {
  const paths = [
    req.body.path,
    req.body.hostPath,
    req.body.containerPath,
    req.params.path,
    req.query.path
  ].filter(Boolean);

  for (const path of paths) {
    if (typeof path === 'string' && path.includes('..')) {
      return res.status(400).json({
        success: false,
        error: 'Path traversal detected'
      });
    }
  }

  next();
};

// Sanitize user input
export const sanitizeInput = (req: Request, res: Response, next: NextFunction) => {
  const sanitizeObject = (obj: any): any => {
    if (typeof obj === 'string') {
      // Remove null bytes
      return obj.replace(/\0/g, '');
    } else if (Array.isArray(obj)) {
      return obj.map(sanitizeObject);
    } else if (obj && typeof obj === 'object') {
      const sanitized: any = {};
      for (const key in obj) {
        sanitized[key] = sanitizeObject(obj[key]);
      }
      return sanitized;
    }
    return obj;
  };

  req.body = sanitizeObject(req.body);
  req.query = sanitizeObject(req.query);
  req.params = sanitizeObject(req.params);

  next();
};

// Audit logging middleware
export const auditLog = (action: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const timestamp = new Date().toISOString();
    const ip = req.ip || req.socket.remoteAddress;
    const user = (req as any).user?.id || 'anonymous';
    
    console.log(JSON.stringify({
      timestamp,
      action,
      user,
      ip,
      method: req.method,
      path: req.path,
      params: req.params,
      query: req.query,
      body: req.body
    }));

    next();
  };
};

// Error handler middleware
export const errorHandler = (err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', err);

  // Don't leak error details in production
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  res.status(500).json({
    success: false,
    error: isDevelopment ? err.message : 'Internal server error',
    ...(isDevelopment && { stack: err.stack })
  });
};

// CORS configuration
export const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'];
    
    // Allow requests with no origin (like mobile apps or Postman)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
};

// WebSocket authentication
export const authenticateSocket = (socket: any, next: (err?: Error) => void) => {
  const token = socket.handshake.auth.token;
  const expectedToken = process.env.SOCKET_TOKEN;

  // Skip if no token is configured
  if (!expectedToken) {
    return next();
  }

  if (!token || token !== expectedToken) {
    return next(new Error('Authentication failed'));
  }

  next();
};

// Permission checker for dangerous operations
export const requirePermission = (permission: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    // Implement your permission logic here
    // For now, we'll use a simple environment variable check
    const allowDangerous = process.env.ALLOW_DANGEROUS_OPERATIONS === 'true';
    
    const dangerousOperations = ['remove', 'prune', 'kill', 'force'];
    
    if (dangerousOperations.includes(permission) && !allowDangerous) {
      return res.status(403).json({
        success: false,
        error: 'This operation is not permitted'
      });
    }

    next();
  };
};