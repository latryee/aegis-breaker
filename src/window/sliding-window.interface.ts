/**
 * @file sliding-window.interface.ts
 * @description Sliding window abstraction for tracking call outcomes and calculating statistical rates.
 */

export const CallOutcome = {
  SUCCESS: 0,
  FAILURE: 1,
  SLOW_SUCCESS: 2,
  SLOW_FAILURE: 3,
} as const;

export type CallOutcome = (typeof CallOutcome)[keyof typeof CallOutcome];

export interface WindowMetricsSnapshot {
  readonly totalCalls: number;
  readonly successfulCalls: number;
  readonly failedCalls: number;
  readonly slowCalls: number;
  readonly slowSuccessfulCalls: number;
  readonly slowFailedCalls: number;
  readonly failureRate: number;
  readonly slowCallRate: number;
}

export interface ISlidingWindow {
  /**
   * Records a successful execution within the normal latency threshold.
   */
  recordSuccess(durationMs: number): void;

  /**
   * Records a failed execution within the normal latency threshold.
   */
  recordFailure(durationMs: number): void;

  /**
   * Records a successful execution that exceeded the slow call latency threshold.
   */
  recordSlowSuccess(durationMs: number): void;

  /**
   * Records a failed execution that exceeded the slow call latency threshold.
   */
  recordSlowFailure(durationMs: number): void;

  /**
   * Computes an instantaneous snapshot of metrics aggregated over the active window.
   */
  getSnapshot(): WindowMetricsSnapshot;

  /**
   * Clears all recorded metrics and resets window state.
   */
  reset(): void;
}
