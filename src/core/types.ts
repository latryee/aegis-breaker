/**
 * @file types.ts
 * @description Comprehensive TypeScript type definitions for the VoltBreaker SDK.
 */

export type CircuitBreakerState =
  | 'CLOSED'
  | 'OPEN'
  | 'HALF_OPEN'
  | 'FORCED_OPEN'
  | 'FORCED_CLOSED'
  | 'DISABLED';

export type SlidingWindowType = 'TIME_BASED' | 'COUNT_BASED';

export type JitterStrategy = 'NONE' | 'FULL' | 'DECORRELATED';

export interface BackoffOptions {
  /**
   * Initial backoff duration in milliseconds when entering OPEN state.
   * @default 10000 (10 seconds)
   */
  readonly initialIntervalMs?: number | undefined;

  /**
   * Multiplier applied for each consecutive failed transition cycle.
   * @default 2
   */
  readonly multiplier?: number | undefined;

  /**
   * Maximum backoff cap in milliseconds.
   * @default 120000 (2 minutes)
   */
  readonly maxIntervalMs?: number | undefined;

  /**
   * Random jitter strategy to prevent thundering herds.
   * @default 'FULL'
   */
  readonly jitter?: JitterStrategy | undefined;
}

export interface CircuitBreakerOptions {
  /**
   * Unique identifier name for this circuit breaker instance.
   * @default 'default-breaker'
   */
  readonly name?: string | undefined;

  /**
   * Type of sliding window used to record call metrics.
   * - 'COUNT_BASED': Evaluates the last N recorded calls.
   * - 'TIME_BASED': Evaluates calls over a sliding time duration in milliseconds.
   * @default 'COUNT_BASED'
   */
  readonly slidingWindowType?: SlidingWindowType | undefined;

  /**
   * Number of calls (for COUNT_BASED) or window duration in milliseconds (for TIME_BASED).
   * @default 100
   */
  readonly slidingWindowSize?: number | undefined;

  /**
   * Number of granular time slices/buckets in TIME_BASED sliding window mode.
   * Higher bucket counts improve granularity with minimal O(1) overhead.
   * @default 10
   */
  readonly slidingWindowBuckets?: number | undefined;

  /**
   * Minimum number of recorded calls required before computing failure rates.
   * Prevents premature tripping on cold starts.
   * @default 20
   */
  readonly minimumNumberOfCalls?: number | undefined;

  /**
   * Failure rate threshold (percentage between 1 and 100).
   * When failureRate >= failureRateThreshold, state transitions to OPEN.
   * @default 50
   */
  readonly failureRateThreshold?: number | undefined;

  /**
   * Slow call rate threshold (percentage between 1 and 100).
   * When slowCallRate >= slowCallRateThreshold, state transitions to OPEN.
   * @default 100 (disabled by default)
   */
  readonly slowCallRateThreshold?: number | undefined;

  /**
   * Duration in milliseconds above which a call is classified as a slow call.
   * @default 60000
   */
  readonly slowCallDurationThresholdMs?: number | undefined;

  /**
   * Number of trial permits allowed when probing in HALF_OPEN state.
   * @default 10
   */
  readonly permittedNumberOfCallsInHalfOpenState?: number | undefined;

  /**
   * Duration in milliseconds the circuit remains in OPEN before transitioning to HALF_OPEN.
   * Can be dynamically extended if backoff options are provided.
   * @default 60000
   */
  readonly waitDurationInOpenStateMs?: number | undefined;

  /**
   * If true, automatic time-based transitions from OPEN to HALF_OPEN occur upon the next request.
   * @default true
   */
  readonly automaticTransitionFromOpenToHalfOpenEnabled?: boolean | undefined;

  /**
   * Custom backoff settings for progressive open state delays upon repeated trips.
   */
  readonly backoffOptions?: BackoffOptions | undefined;

  /**
   * Default timeout in milliseconds for wrapped executions. 0 or undefined means no timeout.
   */
  readonly defaultTimeoutMs?: number | undefined;

  /**
   * Predicate to determine if an error should be recorded as a breaker failure.
   * If returns false, the error is passed through without incrementing failure counters.
   * @default (error) => true
   */
  readonly recordException?: ((error: unknown) => boolean) | undefined;

  /**
   * Predicate to determine if an error should be ignored.
   * If returns true, error is not counted towards failure rate.
   * @default (error) => false
   */
  readonly ignoreException?: ((error: unknown) => boolean) | undefined;

  /**
   * Predicate to evaluate the returned result.
   * If returns true, the call is recorded as a failure even if no exception was thrown
   * (e.g. HTTP responses with status >= 500).
   * @default (result) => false
   */
  readonly recordResult?: ((result: unknown) => boolean) | undefined;
}

export interface CircuitBreakerMetricsSnapshot {
  readonly state: CircuitBreakerState;
  readonly failureRate: number;
  readonly slowCallRate: number;
  readonly totalCalls: number;
  readonly successfulCalls: number;
  readonly failedCalls: number;
  readonly slowCalls: number;
  readonly slowSuccessfulCalls: number;
  readonly slowFailedCalls: number;
  readonly notPermittedCalls: number;
  readonly stateTransitionTimestamp: number;
  readonly nextPermittedProbeTimestamp?: number | undefined;
  readonly openCycleCount: number;
}

export interface ExecutionOptions<T = unknown> {
  /**
   * Override timeout for this specific execution call in milliseconds.
   */
  readonly timeoutMs?: number | undefined;

  /**
   * Optional AbortSignal for cooperative cancellation.
   */
  readonly signal?: AbortSignal | undefined;

  /**
   * Fallback handler invoked when the call fails or is rejected due to an OPEN circuit.
   */
  readonly fallback?: ((error: unknown, ...args: readonly unknown[]) => Promise<T> | T) | undefined;

  /**
   * Context payload passed to telemetry listeners.
   */
  readonly context?: Record<string, unknown> | undefined;
}

export type StateChangeReason =
  | 'FAILURE_RATE_EXCEEDED'
  | 'SLOW_CALL_RATE_EXCEEDED'
  | 'HALF_OPEN_PROBE_FAILED'
  | 'HALF_OPEN_PROBE_SUCCEEDED'
  | 'WAIT_DURATION_EXPIRED'
  | 'MANUAL_TRANSITION'
  | 'MANUAL_RESET';

export interface StateChangeEvent {
  readonly breakerName: string;
  readonly fromState: CircuitBreakerState;
  readonly toState: CircuitBreakerState;
  readonly reason: StateChangeReason;
  readonly timestamp: number;
  readonly metrics: CircuitBreakerMetricsSnapshot;
}

export interface CallSuccessEvent {
  readonly breakerName: string;
  readonly state: CircuitBreakerState;
  readonly durationMs: number;
  readonly timestamp: number;
  readonly context?: Record<string, unknown> | undefined;
}

export interface CallFailureEvent {
  readonly breakerName: string;
  readonly state: CircuitBreakerState;
  readonly durationMs: number;
  readonly error: unknown;
  readonly timestamp: number;
  readonly context?: Record<string, unknown> | undefined;
}

export interface CallSlowEvent {
  readonly breakerName: string;
  readonly state: CircuitBreakerState;
  readonly durationMs: number;
  readonly thresholdMs: number;
  readonly timestamp: number;
}

export interface CallRejectedEvent {
  readonly breakerName: string;
  readonly state: CircuitBreakerState;
  readonly retryAfterMs: number;
  readonly timestamp: number;
  readonly context?: Record<string, unknown> | undefined;
}

export interface CallTimeoutEvent {
  readonly breakerName: string;
  readonly timeoutMs: number;
  readonly durationMs: number;
  readonly timestamp: number;
}

export interface BreakerEventMap {
  readonly stateChange: StateChangeEvent;
  readonly callSuccess: CallSuccessEvent;
  readonly callFailure: CallFailureEvent;
  readonly callSlow: CallSlowEvent;
  readonly callRejected: CallRejectedEvent;
  readonly callTimeout: CallTimeoutEvent;
  readonly reset: { readonly breakerName: string; readonly timestamp: number };
}
