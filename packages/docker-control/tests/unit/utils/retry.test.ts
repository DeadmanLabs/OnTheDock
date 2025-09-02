import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { withRetry } from '../../../src/utils/retry';

describe('withRetry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should execute function successfully on first attempt', async () => {
    const fn = jest.fn().mockResolvedValue('success');
    
    const result = await withRetry(fn, { maxAttempts: 3, delay: 10 });
    
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure and eventually succeed', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('Attempt 1'))
      .mockRejectedValueOnce(new Error('Attempt 2'))
      .mockResolvedValueOnce('success');
    
    const result = await withRetry(fn, { maxAttempts: 3, delay: 10 });
    
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should throw error after max attempts', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('Always fails'));
    
    await expect(
      withRetry(fn, { maxAttempts: 3, delay: 10 })
    ).rejects.toThrow('Always fails');
    
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should use exponential backoff', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('Attempt 1'))
      .mockRejectedValueOnce(new Error('Attempt 2'))
      .mockResolvedValueOnce('success');
    
    const startTime = Date.now();
    await withRetry(fn, { 
      maxAttempts: 3, 
      delay: 10, 
      backoff: 2 
    });
    const endTime = Date.now();
    
    // Should have delays of 10ms and 20ms (10 * 2)
    // Total minimum time should be at least 30ms
    expect(endTime - startTime).toBeGreaterThanOrEqual(30);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should respect shouldRetry predicate', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('Retryable'))
      .mockRejectedValueOnce(new Error('Not retryable'))
      .mockResolvedValueOnce('success');
    
    const shouldRetry = (error: Error) => error.message === 'Retryable';
    
    await expect(
      withRetry(fn, { 
        maxAttempts: 3, 
        delay: 10, 
        shouldRetry 
      })
    ).rejects.toThrow('Not retryable');
    
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should call onRetry callback', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('Attempt 1'))
      .mockRejectedValueOnce(new Error('Attempt 2'))
      .mockResolvedValueOnce('success');
    
    const onRetry = jest.fn();
    
    await withRetry(fn, { 
      maxAttempts: 3, 
      delay: 10, 
      onRetry 
    });
    
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 1);
    expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 2);
  });

  it('should handle async functions with parameters', async () => {
    const fn = jest.fn((a: number, b: number) => Promise.resolve(a + b));
    
    const wrappedFn = () => fn(2, 3);
    const result = await withRetry(wrappedFn, { maxAttempts: 1, delay: 10 });
    
    expect(result).toBe(5);
    expect(fn).toHaveBeenCalledWith(2, 3);
  });

  it('should respect maxDelay option', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('Attempt 1'))
      .mockRejectedValueOnce(new Error('Attempt 2'))
      .mockRejectedValueOnce(new Error('Attempt 3'))
      .mockResolvedValueOnce('success');
    
    const startTime = Date.now();
    await withRetry(fn, { 
      maxAttempts: 4, 
      delay: 10, 
      backoff: 10, // Would make delays 10, 100, 1000
      maxDelay: 50 // Cap at 50ms
    });
    const endTime = Date.now();
    
    // Should have delays of 10ms, 50ms, 50ms (capped)
    // Total time should be less than what it would be without maxDelay
    expect(endTime - startTime).toBeLessThan(1000);
    expect(fn).toHaveBeenCalledTimes(4);
  });
});