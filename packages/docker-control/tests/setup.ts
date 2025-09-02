import { jest } from '@jest/globals';

// Increase timeout for Docker operations
jest.setTimeout(30000);

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  error: jest.fn(),
  warn: jest.fn(),
  log: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
};

// Setup test environment variables
process.env.NODE_ENV = 'test';
process.env.DOCKER_SOCKET = '/var/run/docker.sock';