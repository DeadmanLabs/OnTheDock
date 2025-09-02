import { describe, it, expect } from '@jest/globals';
import { 
  DockerError, 
  DockerConnectionError, 
  DockerNotFoundError,
  DockerConflictError,
  DockerTimeoutError,
  DockerPermissionError,
  isDockerError
} from '../../../src/errors/DockerError';

describe('DockerError', () => {
  describe('DockerError base class', () => {
    it('should create an error with message and code', () => {
      const error = new DockerError('Test error', 'TEST_ERROR');
      
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(DockerError);
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_ERROR');
      expect(error.name).toBe('DockerError');
    });

    it('should include statusCode and details', () => {
      const error = new DockerError('Test error', 'TEST_ERROR', 500, { foo: 'bar' });
      
      expect(error.statusCode).toBe(500);
      expect(error.details).toEqual({ foo: 'bar' });
    });

    it('should have a stack trace', () => {
      const error = new DockerError('Test error', 'TEST_ERROR');
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('DockerError');
    });
  });

  describe('DockerConnectionError', () => {
    it('should create a connection error', () => {
      const error = new DockerConnectionError('Connection failed');
      
      expect(error).toBeInstanceOf(DockerConnectionError);
      expect(error.code).toBe('CONNECTION_ERROR');
      expect(error.statusCode).toBe(503);
    });
  });

  describe('DockerNotFoundError', () => {
    it('should create a not found error', () => {
      const error = new DockerNotFoundError('Container not found');
      
      expect(error).toBeInstanceOf(DockerNotFoundError);
      expect(error.code).toBe('NOT_FOUND');
      expect(error.statusCode).toBe(404);
    });
  });

  describe('DockerConflictError', () => {
    it('should create a conflict error', () => {
      const error = new DockerConflictError('Name already in use');
      
      expect(error).toBeInstanceOf(DockerConflictError);
      expect(error.code).toBe('CONFLICT');
      expect(error.statusCode).toBe(409);
    });
  });

  describe('DockerTimeoutError', () => {
    it('should create a timeout error', () => {
      const error = new DockerTimeoutError('Operation timed out');
      
      expect(error).toBeInstanceOf(DockerTimeoutError);
      expect(error.code).toBe('TIMEOUT');
      expect(error.statusCode).toBe(408);
    });
  });

  describe('DockerPermissionError', () => {
    it('should create a permission error', () => {
      const error = new DockerPermissionError('Access denied');
      
      expect(error).toBeInstanceOf(DockerPermissionError);
      expect(error.code).toBe('PERMISSION_DENIED');
      expect(error.statusCode).toBe(403);
    });
  });

  describe('isDockerError', () => {
    it('should return true for DockerError instances', () => {
      const error = new DockerError('Test', 'TEST');
      expect(isDockerError(error)).toBe(true);
    });

    it('should return true for DockerError subclasses', () => {
      const errors = [
        new DockerConnectionError('Test'),
        new DockerNotFoundError('Test'),
        new DockerConflictError('Test'),
        new DockerTimeoutError('Test'),
        new DockerPermissionError('Test')
      ];

      errors.forEach(error => {
        expect(isDockerError(error)).toBe(true);
      });
    });

    it('should return false for regular errors', () => {
      const error = new Error('Regular error');
      expect(isDockerError(error)).toBe(false);
    });

    it('should return false for non-error objects', () => {
      expect(isDockerError('string')).toBe(false);
      expect(isDockerError(123)).toBe(false);
      expect(isDockerError(null)).toBe(false);
      expect(isDockerError(undefined)).toBe(false);
      expect(isDockerError({})).toBe(false);
    });
  });
});