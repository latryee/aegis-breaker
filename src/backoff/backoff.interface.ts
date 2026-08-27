/**
 * @file backoff.interface.ts
 * @description Backoff calculation interface for circuit breaker state recovery.
 */

export interface IBackoffStrategy {
  /**
   * Computes the duration in milliseconds to remain in OPEN state for a given failure cycle attempt.
   * @param attempt Number of consecutive failed open cycles (0-indexed or 1-indexed)
   * @param lastIntervalMs Previous interval in milliseconds (used in decorrelated jitter)
   */
  calculate(attempt: number, lastIntervalMs?: number): number;

  /**
   * Resets internal backoff state upon successful circuit closure.
   */
  reset(): void;
}
