/**
 * @file storage.interface.ts
 * @description Storage abstraction for managing circuit breaker state and half-open trial permits.
 * Enables seamless switching between zero-overhead in-memory state and distributed coordination (e.g. Redis).
 */

import type { CircuitBreakerState } from '../core/types.js';

export interface ICircuitBreakerStorage {
  /**
   * Retrieves the current persisted state.
   */
  getState(): CircuitBreakerState;

  /**
   * Updates the persisted circuit breaker state.
   */
  setState(state: CircuitBreakerState): void;

  /**
   * Attempts to acquire an execution permit when probing in HALF_OPEN state.
   * Returns true if permit acquired, false if permit pool is saturated.
   */
  acquireHalfOpenPermit(maxPermits: number): boolean;

  /**
   * Releases an active trial permit.
   */
  releaseHalfOpenPermit(): void;

  /**
   * Returns the count of currently active trial permits.
   */
  getActiveHalfOpenPermits(): number;

  /**
   * Resets internal storage counters.
   */
  reset(): void;
}
