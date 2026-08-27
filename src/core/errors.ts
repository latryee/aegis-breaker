/**
 * @file errors.ts
 * @description Strongly-typed error hierarchy for VoltBreaker SDK.
 */

import type { CircuitBreakerMetricsSnapshot, CircuitBreakerState } from './types.js';

export class CircuitBreakerError extends Error {
  public override readonly name: string = 'CircuitBreakerError';

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when a call is rejected because the Circuit Breaker is in OPEN or FORCED_OPEN state.
 */
export class CircuitBreakerOpenError extends CircuitBreakerError {
  public override readonly name: string = 'CircuitBreakerOpenError';
  public readonly breakerName: string;
  public readonly state: CircuitBreakerState;
  public readonly retryAfterMs: number;
  public readonly metricsSnapshot?: CircuitBreakerMetricsSnapshot | undefined;

  constructor(
    breakerName: string,
    state: CircuitBreakerState,
    retryAfterMs: number,
    metricsSnapshot?: CircuitBreakerMetricsSnapshot | undefined
  ) {
    super(
      `Circuit breaker '${breakerName}' is ${state}. Fast-failing execution. Retry allowed in ${Math.ceil(
        retryAfterMs
      )}ms.`
    );
    this.breakerName = breakerName;
    this.state = state;
    this.retryAfterMs = retryAfterMs;
    this.metricsSnapshot = metricsSnapshot;
    Object.setPrototypeOf(this, CircuitBreakerOpenError.prototype);
  }
}

/**
 * Thrown when a call is rejected because all trial permits in HALF_OPEN state are currently occupied.
 */
export class CircuitBreakerHalfOpenCapacityExceededError extends CircuitBreakerError {
  public override readonly name: string = 'CircuitBreakerHalfOpenCapacityExceededError';
  public readonly breakerName: string;
  public readonly permittedCalls: number;

  constructor(breakerName: string, permittedCalls: number) {
    super(
      `Circuit breaker '${breakerName}' is in HALF_OPEN probe state with all ${permittedCalls} trial permits in use.`
    );
    this.breakerName = breakerName;
    this.permittedCalls = permittedCalls;
    Object.setPrototypeOf(this, CircuitBreakerHalfOpenCapacityExceededError.prototype);
  }
}

/**
 * Thrown when an execution exceeds the allotted timeout limit.
 */
export class CircuitBreakerTimeoutError extends CircuitBreakerError {
  public override readonly name: string = 'CircuitBreakerTimeoutError';
  public readonly breakerName: string;
  public readonly timeoutMs: number;
  public readonly durationMs: number;

  constructor(breakerName: string, timeoutMs: number, durationMs: number) {
    super(
      `Circuit breaker '${breakerName}' execution timed out after ${durationMs}ms (limit: ${timeoutMs}ms).`
    );
    this.breakerName = breakerName;
    this.timeoutMs = timeoutMs;
    this.durationMs = durationMs;
    Object.setPrototypeOf(this, CircuitBreakerTimeoutError.prototype);
  }
}

/**
 * Thrown when an underlying operation returns a result matching the recordResult failure predicate.
 */
export class CircuitBreakerResultFailureError extends CircuitBreakerError {
  public override readonly name: string = 'CircuitBreakerResultFailureError';
  public readonly result: unknown;

  constructor(breakerName: string, result: unknown) {
    super(`Circuit breaker '${breakerName}' recorded a failure based on returned result evaluation.`);
    this.result = result;
    Object.setPrototypeOf(this, CircuitBreakerResultFailureError.prototype);
  }
}
