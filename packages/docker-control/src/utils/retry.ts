import pRetry from 'p-retry';
import debug from 'debug';

const log = debug('docker-control:utils:retry');

export interface RetryOptions {
  retries?: number;
  factor?: number;
  minTimeout?: number;
  maxTimeout?: number;
  randomize?: boolean;
  onFailedAttempt?: (error: pRetry.FailedAttemptError) => void | Promise<void>;
  shouldRetry?: (error: any) => boolean;
}

export class RetryHelper {
  static async withRetry<T>(
    fn: () => Promise<T>,
    options?: RetryOptions
  ): Promise<T> {
    const defaultOptions: pRetry.Options = {
      retries: options?.retries ?? 3,
      factor: options?.factor ?? 2,
      minTimeout: options?.minTimeout ?? 1000,
      maxTimeout: options?.maxTimeout ?? 30000,
      randomize: options?.randomize ?? true,
      onFailedAttempt: (error) => {
        log(
          `Attempt ${error.attemptNumber} failed. ${error.retriesLeft} retries left.`,
          error.message
        );
        if (options?.onFailedAttempt) {
          options.onFailedAttempt(error);
        }
      }
    };

    if (options?.shouldRetry) {
      const originalFn = fn;
      fn = async () => {
        try {
          return await originalFn();
        } catch (error) {
          if (!options.shouldRetry!(error)) {
            throw new pRetry.AbortError(error);
          }
          throw error;
        }
      };
    }

    return pRetry(fn, defaultOptions);
  }

  static async withExponentialBackoff<T>(
    fn: () => Promise<T>,
    maxAttempts: number = 5
  ): Promise<T> {
    return this.withRetry(fn, {
      retries: maxAttempts - 1,
      factor: 2,
      minTimeout: 1000,
      maxTimeout: 30000
    });
  }

  static async withLinearBackoff<T>(
    fn: () => Promise<T>,
    maxAttempts: number = 5,
    delay: number = 1000
  ): Promise<T> {
    return this.withRetry(fn, {
      retries: maxAttempts - 1,
      factor: 1,
      minTimeout: delay,
      maxTimeout: delay
    });
  }

  static isRetryableError(error: any): boolean {
    // Network errors
    if (error.code === 'ECONNREFUSED' || 
        error.code === 'ECONNRESET' || 
        error.code === 'ETIMEDOUT' ||
        error.code === 'ENOTFOUND' ||
        error.code === 'ENETUNREACH') {
      return true;
    }

    // HTTP status codes that are retryable
    const statusCode = error.statusCode || error.status;
    if (statusCode === 408 || // Request Timeout
        statusCode === 429 || // Too Many Requests
        statusCode === 500 || // Internal Server Error
        statusCode === 502 || // Bad Gateway
        statusCode === 503 || // Service Unavailable
        statusCode === 504) { // Gateway Timeout
      return true;
    }

    // Docker specific errors
    if (error.message && (
        error.message.includes('daemon is not running') ||
        error.message.includes('Cannot connect to the Docker daemon') ||
        error.message.includes('socket hang up'))) {
      return true;
    }

    return false;
  }

  static async retryWithTimeout<T>(
    fn: () => Promise<T>,
    timeout: number,
    options?: RetryOptions
  ): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Operation timed out after ${timeout}ms`)), timeout);
    });

    const retryPromise = this.withRetry(fn, options);

    return Promise.race([retryPromise, timeoutPromise]);
  }

  static createRetryableFunction<T extends (...args: any[]) => Promise<any>>(
    fn: T,
    options?: RetryOptions
  ): T {
    return (async (...args: Parameters<T>) => {
      return this.withRetry(() => fn(...args), options);
    }) as T;
  }

  static async retryUntilSuccess<T>(
    fn: () => Promise<T>,
    predicate: (result: T) => boolean,
    options?: RetryOptions & { maxDuration?: number }
  ): Promise<T> {
    const startTime = Date.now();
    const maxDuration = options?.maxDuration || 60000; // 1 minute default

    const wrappedFn = async () => {
      if (options?.maxDuration && Date.now() - startTime > maxDuration) {
        throw new Error(`Maximum duration of ${maxDuration}ms exceeded`);
      }

      const result = await fn();
      if (!predicate(result)) {
        throw new Error('Predicate not satisfied');
      }
      return result;
    };

    return this.withRetry(wrappedFn, {
      ...options,
      shouldRetry: (error) => {
        if (error.message === 'Predicate not satisfied') {
          return true;
        }
        return options?.shouldRetry ? options.shouldRetry(error) : this.isRetryableError(error);
      }
    });
  }
}