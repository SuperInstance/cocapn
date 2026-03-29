/**
 * Retry with Exponential Backoff
 *
 * Provides retry logic with configurable exponential backoff for resilient operations.
 */

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxAttempts?: number;
  /** Base delay in milliseconds (default: 1000ms) */
  baseDelay?: number;
  /** Maximum delay in milliseconds (default: 30000ms) */
  maxDelay?: number;
  /** Backoff multiplier (default: 2) */
  backoffFactor?: number;
  /** Add random jitter to delays (default: true) */
  jitter?: boolean;
  /** Function to determine if an error is retryable (default: retry all errors) */
  isRetryable?: (error: unknown) => boolean;
}

interface RetryError extends Error {
  attempt: number;
  totalAttempts: number;
  errors: Error[];
}

/**
 * Calculate delay with exponential backoff and optional jitter
 */
function calculateDelay(
  attempt: number,
  baseDelay: number,
  maxDelay: number,
  backoffFactor: number,
  jitter: boolean
): number {
  // Exponential backoff: baseDelay * (backoffFactor ^ (attempt - 1))
  const exponentialDelay = baseDelay * Math.pow(backoffFactor, attempt - 1);

  // Cap at maxDelay
  const cappedDelay = Math.min(exponentialDelay, maxDelay);

  if (jitter) {
    // Add random jitter: ±25% of the delay
    const jitterAmount = cappedDelay * 0.25;
    const randomJitter = (Math.random() - 0.5) * 2 * jitterAmount;
    return Math.max(0, Math.round(cappedDelay + randomJitter));
  }

  return Math.round(cappedDelay);
}

/**
 * Execute a function with retry logic and exponential backoff
 *
 * @param fn - Async function to execute
 * @param options - Retry configuration options
 * @param onRetry - Optional callback called before each retry
 * @returns Result of the function
 * @throws RetryError with all attempts' errors if all retries fail
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
  onRetry?: (attempt: number, error: Error) => void
): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelay = 1000,
    maxDelay = 30000,
    backoffFactor = 2,
    jitter = true,
    isRetryable = () => true,
  } = options;

  const errors: Error[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      errors.push(err);

      // Check if this error is retryable
      if (!isRetryable(err)) {
        throw err;
      }

      // If this was the last attempt, throw the retry error
      if (attempt === maxAttempts) {
        const retryError: RetryError = new Error(
          `Operation failed after ${maxAttempts} attempts: ${err.message}`
        ) as RetryError;
        retryError.attempt = attempt;
        retryError.totalAttempts = maxAttempts;
        retryError.errors = errors;
        retryError.cause = err;
        throw retryError;
      }

      // Calculate delay and wait before retry
      const delay = calculateDelay(attempt, baseDelay, maxDelay, backoffFactor, jitter);

      if (onRetry) {
        onRetry(attempt, err);
      }

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // This should never be reached, but TypeScript needs it
  throw new Error('Unexpected error in retry logic');
}

/**
 * Create a retryable version of a function
 *
 * @param fn - Async function to wrap
 * @param defaultOptions - Default retry options
 * @returns Wrapped function with retry logic
 */
export function createRetryable<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  defaultOptions: RetryOptions = {}
): T & { withRetry: (options?: RetryOptions) => T } {
  const retryableFn = (async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    return withRetry(
      () => fn(...args),
      defaultOptions
    ) as Promise<ReturnType<T>>;
  }) as T & { withRetry: (options?: RetryOptions) => T };

  retryableFn.withRetry = (options?: RetryOptions) => {
    return createRetryable(fn, { ...defaultOptions, ...options });
  };

  return retryableFn;
}

/**
 * Check if an error is a network-related error that should be retried
 */
export function isNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  const name = error.name.toLowerCase();

  // Common network error patterns
  return (
    name.includes('fetch') ||
    name.includes('network') ||
    message.includes('econnrefused') ||
    message.includes('enotfound') ||
    message.includes('etimedout') ||
    message.includes('econnreset') ||
    message.includes('socket hang up') ||
    message.includes('network error') ||
    message.includes('fetch failed')
  );
}

/**
 * Check if an HTTP response indicates a retryable error
 */
export function isRetryableHttpCode(status: number): boolean {
  // Retry on: 408 (Request Timeout), 429 (Rate Limit), 500+, 503, 504
  return (
    status === 408 ||
    status === 429 ||
    (status >= 500 && status <= 599)
  );
}
