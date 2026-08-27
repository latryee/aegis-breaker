/**
 * @file functional.ts
 * @description Higher-order functional wrappers and pipeline composition utilities.
 */

import { CircuitBreaker } from '../core/circuit-breaker.js';
import type { ExecutionOptions } from '../core/types.js';

/**
 * Creates a protected higher-order wrapper around an asynchronous function.
 */
export function withCircuitBreaker<Args extends readonly unknown[], Return>(
  breaker: CircuitBreaker,
  fn: (...args: Args) => Promise<Return> | Return,
  options?: ExecutionOptions<Return>
): (...args: Args) => Promise<Return> {
  return breaker.wrap(fn, options);
}

/**
 * Executes a function with a circuit breaker and an immediate inline fallback.
 */
export async function executeWithFallback<T>(
  breaker: CircuitBreaker,
  action: (signal?: AbortSignal) => Promise<T> | T,
  fallback: (error: unknown) => Promise<T> | T,
  options?: Omit<ExecutionOptions<T>, 'fallback'>
): Promise<T> {
  return breaker.execute(action, {
    ...options,
    fallback,
  });
}
