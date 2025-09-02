import { Request, Response, NextFunction } from 'express';
import { isDockerError } from '@org/docker-control';

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  console.error('Error:', err);

  if (isDockerError(err)) {
    res.status(err.statusCode || 500).json({
      error: err.code,
      message: err.message,
      details: err.details
    });
    return;
  }

  if (err.name === 'ValidationError') {
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: err.message,
      details: err.errors
    });
    return;
  }

  res.status(err.status || 500).json({
    error: 'INTERNAL_SERVER_ERROR',
    message: err.message || 'An unexpected error occurred'
  });
}