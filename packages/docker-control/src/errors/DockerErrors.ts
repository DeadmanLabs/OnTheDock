export class DockerError extends Error {
  public readonly code: string;
  public readonly statusCode?: number;
  public readonly details?: any;

  constructor(message: string, code: string, statusCode?: number, details?: any) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ConfigurationError extends DockerError {
  constructor(message: string, details?: any) {
    super(message, 'CONFIGURATION_ERROR', 400, details);
  }
}

export class AuthenticationError extends DockerError {
  constructor(message: string, details?: any) {
    super(message, 'AUTH_ERROR', 401, details);
  }
}

export class NotFoundError extends DockerError {
  constructor(resource: string, identifier: string) {
    super(`${resource} not found: ${identifier}`, 'NOT_FOUND', 404);
  }
}

export class ConflictError extends DockerError {
  constructor(message: string, details?: any) {
    super(message, 'CONFLICT', 409, details);
  }
}

export class ResourceError extends DockerError {
  constructor(message: string, details?: any) {
    super(message, 'RESOURCE_ERROR', 507, details);
  }
}

export class TimeoutError extends DockerError {
  constructor(operation: string, timeout: number) {
    super(`Operation '${operation}' timed out after ${timeout}ms`, 'TIMEOUT', 408);
  }
}

export class IOError extends DockerError {
  constructor(message: string, details?: any) {
    super(message, 'IO_ERROR', 500, details);
  }
}

export class StreamError extends DockerError {
  constructor(message: string, details?: any) {
    super(message, 'STREAM_ERROR', 500, details);
  }
}

export class ValidationError extends DockerError {
  constructor(message: string, details?: any) {
    super(message, 'VALIDATION_ERROR', 400, details);
  }
}

export class PermissionError extends DockerError {
  constructor(message: string, details?: any) {
    super(message, 'PERMISSION_ERROR', 403, details);
  }
}

export class NetworkError extends DockerError {
  constructor(message: string, details?: any) {
    super(message, 'NETWORK_ERROR', 503, details);
  }
}

export function isDockerError(error: any): error is DockerError {
  return error instanceof DockerError;
}

export function handleDockerodeError(error: any): DockerError {
  if (isDockerError(error)) {
    return error;
  }

  const message = error.message || 'Unknown Docker error';
  const statusCode = error.statusCode || error.status;

  switch (statusCode) {
    case 400:
      return new ValidationError(message, error);
    case 401:
      return new AuthenticationError(message, error);
    case 403:
      return new PermissionError(message, error);
    case 404:
      return new NotFoundError('Resource', message);
    case 409:
      return new ConflictError(message, error);
    case 408:
      return new TimeoutError('Docker operation', 0);
    case 500:
    case 501:
    case 502:
    case 503:
      return new IOError(message, error);
    default:
      return new DockerError(message, 'UNKNOWN_ERROR', statusCode, error);
  }
}