/**
 * @file index.ts
 * @description VoltBreaker - Production-Grade Circuit Breaker & Resilience SDK.
 */

// Core Engine & Errors
export { CircuitBreaker } from './core/circuit-breaker.js';
export {
  CircuitBreakerError,
  CircuitBreakerHalfOpenCapacityExceededError,
  CircuitBreakerOpenError,
  CircuitBreakerResultFailureError,
  CircuitBreakerTimeoutError,
} from './core/errors.js';

// Types & Interfaces
export type {
  BackoffOptions,
  BreakerEventMap,
  CallFailureEvent,
  CallRejectedEvent,
  CallSlowEvent,
  CallSuccessEvent,
  CallTimeoutEvent,
  CircuitBreakerMetricsSnapshot,
  CircuitBreakerOptions,
  CircuitBreakerState,
  ExecutionOptions,
  JitterStrategy,
  SlidingWindowType,
  StateChangeEvent,
  StateChangeReason,
} from './core/types.js';

// Sliding Windows
export { CountSlidingWindow } from './window/count-sliding-window.js';
export {
  CallOutcome,
  type ISlidingWindow,
  type WindowMetricsSnapshot,
} from './window/sliding-window.interface.js';
export { TimeSlidingWindow } from './window/time-sliding-window.js';

// Backoff Strategies
export type { IBackoffStrategy } from './backoff/backoff.interface.js';
export { ExponentialBackoff } from './backoff/exponential-backoff.js';
export { FixedBackoff } from './backoff/fixed-backoff.js';

// Telemetry & Metrics
export { TypedEventEmitter } from './telemetry/event-emitter.js';
export { type CumulativeMetrics, MetricsCollector } from './telemetry/metrics-collector.js';
export {
  formatPrometheusMetrics,
  type PrometheusExportOptions,
} from './telemetry/prometheus-exporter.js';

// Storage Abstractions
export { MemoryStorage } from './storage/memory-storage.js';
export type { ICircuitBreakerStorage } from './storage/storage.interface.js';

// Wrappers & Decorators
export { Protect } from './wrappers/decorators.js';
export { executeWithFallback, withCircuitBreaker } from './wrappers/functional.js';
