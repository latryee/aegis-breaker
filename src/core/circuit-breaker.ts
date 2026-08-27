/**
 * @file circuit-breaker.ts
 * @description Core CircuitBreaker resilience engine and state coordinator.
 */

import { type IBackoffStrategy } from '../backoff/backoff.interface.js';
import { ExponentialBackoff } from '../backoff/exponential-backoff.js';
import { FixedBackoff } from '../backoff/fixed-backoff.js';
import { MemoryStorage } from '../storage/memory-storage.js';
import { type ICircuitBreakerStorage } from '../storage/storage.interface.js';
import { TypedEventEmitter } from '../telemetry/event-emitter.js';
import { MetricsCollector } from '../telemetry/metrics-collector.js';
import {
  formatPrometheusMetrics,
  type PrometheusExportOptions,
} from '../telemetry/prometheus-exporter.js';
import { CountSlidingWindow } from '../window/count-sliding-window.js';
import { type ISlidingWindow } from '../window/sliding-window.interface.js';
import { TimeSlidingWindow } from '../window/time-sliding-window.js';
import {
  CircuitBreakerHalfOpenCapacityExceededError,
  CircuitBreakerOpenError,
  CircuitBreakerResultFailureError,
  CircuitBreakerTimeoutError,
} from './errors.js';
import type {
  BreakerEventMap,
  CircuitBreakerMetricsSnapshot,
  CircuitBreakerOptions,
  CircuitBreakerState,
  ExecutionOptions,
  StateChangeReason,
} from './types.js';

export class CircuitBreaker {
  public readonly name: string;

  private readonly slidingWindow: ISlidingWindow;
  private readonly storage: ICircuitBreakerStorage;
  private readonly backoffStrategy: IBackoffStrategy;
  private readonly eventEmitter: TypedEventEmitter;
  private readonly metricsCollector: MetricsCollector;

  private readonly minimumNumberOfCalls: number;
  private readonly failureRateThreshold: number;
  private readonly slowCallRateThreshold: number;
  private readonly slowCallDurationThresholdMs: number;
  private readonly permittedNumberOfCallsInHalfOpenState: number;
  private readonly waitDurationInOpenStateMs: number;
  private readonly automaticTransitionFromOpenToHalfOpenEnabled: boolean;
  private readonly defaultTimeoutMs: number | undefined;

  private readonly recordExceptionPredicate: (error: unknown) => boolean;
  private readonly ignoreExceptionPredicate: (error: unknown) => boolean;
  private readonly recordResultPredicate: (result: unknown) => boolean;

  private stateTransitionTimestamp: number = Date.now();
  private openUntilTimestamp: number | undefined = undefined;
  private openCycleCount: number = 0;

  constructor(options: CircuitBreakerOptions = {}) {
    this.name = options.name ?? 'default-breaker';
    this.minimumNumberOfCalls = Math.max(1, options.minimumNumberOfCalls ?? 20);
    this.failureRateThreshold = Math.min(100, Math.max(1, options.failureRateThreshold ?? 50));
    this.slowCallRateThreshold = Math.min(100, Math.max(1, options.slowCallRateThreshold ?? 100));
    this.slowCallDurationThresholdMs = Math.max(0, options.slowCallDurationThresholdMs ?? 60000);
    this.permittedNumberOfCallsInHalfOpenState = Math.max(
      1,
      options.permittedNumberOfCallsInHalfOpenState ?? 10
    );
    this.waitDurationInOpenStateMs = Math.max(1, options.waitDurationInOpenStateMs ?? 60000);
    this.automaticTransitionFromOpenToHalfOpenEnabled =
      options.automaticTransitionFromOpenToHalfOpenEnabled ?? true;
    this.defaultTimeoutMs = options.defaultTimeoutMs;

    this.recordExceptionPredicate = options.recordException ?? (() => true);
    this.ignoreExceptionPredicate = options.ignoreException ?? (() => false);
    this.recordResultPredicate = options.recordResult ?? (() => false);

    // Initialize sliding window
    if (options.slidingWindowType === 'TIME_BASED') {
      this.slidingWindow = new TimeSlidingWindow(
        options.slidingWindowSize ?? 60000,
        options.slidingWindowBuckets ?? 10
      );
    } else {
      this.slidingWindow = new CountSlidingWindow(options.slidingWindowSize ?? 100);
    }

    // Initialize backoff strategy
    if (options.backoffOptions) {
      this.backoffStrategy = new ExponentialBackoff(options.backoffOptions);
    } else {
      this.backoffStrategy = new FixedBackoff(this.waitDurationInOpenStateMs);
    }

    this.storage = new MemoryStorage();
    this.eventEmitter = new TypedEventEmitter();
    this.metricsCollector = new MetricsCollector();
  }

  /**
   * Returns current Circuit Breaker state.
   */
  public getState(): CircuitBreakerState {
    this.checkAutomaticStateTransition();
    return this.storage.getState();
  }

  /**
   * Subscribes to circuit breaker lifecycle events.
   */
  public on<E extends keyof BreakerEventMap>(
    event: E,
    listener: (data: BreakerEventMap[E]) => void
  ): () => void {
    return this.eventEmitter.on(event, listener);
  }

  /**
   * Subscribes to a circuit breaker event once.
   */
  public once<E extends keyof BreakerEventMap>(
    event: E,
    listener: (data: BreakerEventMap[E]) => void
  ): () => void {
    return this.eventEmitter.once(event, listener);
  }

  /**
   * Removes an event listener.
   */
  public off<E extends keyof BreakerEventMap>(
    event: E,
    listener: (data: BreakerEventMap[E]) => void
  ): void {
    this.eventEmitter.off(event, listener);
  }

  /**
   * Executes a protected asynchronous action through the circuit breaker.
   */
  public async execute<T>(
    action: (signal?: AbortSignal) => Promise<T> | T,
    options?: ExecutionOptions<T>
  ): Promise<T> {
    const isPermitted = this.acquireExecutionPermit();

    if (!isPermitted.allowed) {
      if (options?.fallback) {
        return options.fallback(isPermitted.rejectionError);
      }
      throw isPermitted.rejectionError;
    }

    const effectiveTimeout = options?.timeoutMs ?? this.defaultTimeoutMs;
    const startTime = performance.now();
    let permitAcquiredInHalfOpen = isPermitted.isHalfOpenPermit;

    try {
      let result: T;

      if (effectiveTimeout && effectiveTimeout > 0) {
        result = await this.executeWithTimeout(action, effectiveTimeout, options?.signal);
      } else {
        result = await action(options?.signal);
      }

      const durationMs = Math.round(performance.now() - startTime);

      // Check if returned value matches failure predicate
      if (this.recordResultPredicate(result)) {
        throw new CircuitBreakerResultFailureError(this.name, result);
      }

      this.handleSuccess(durationMs, permitAcquiredInHalfOpen, options?.context);
      permitAcquiredInHalfOpen = false;
      return result;
    } catch (error) {
      const durationMs = Math.round(performance.now() - startTime);

      if (this.isTimeoutError(error)) {
        this.eventEmitter.emit('callTimeout', {
          breakerName: this.name,
          timeoutMs: effectiveTimeout ?? 0,
          durationMs,
          timestamp: Date.now(),
        });
      }

      if (this.ignoreExceptionPredicate(error)) {
        if (permitAcquiredInHalfOpen) {
          this.storage.releaseHalfOpenPermit();
          permitAcquiredInHalfOpen = false;
        }
        if (options?.fallback) {
          return options.fallback(error);
        }
        throw error;
      }

      if (this.recordExceptionPredicate(error)) {
        this.handleFailure(durationMs, error, permitAcquiredInHalfOpen, options?.context);
        permitAcquiredInHalfOpen = false;
      } else if (permitAcquiredInHalfOpen) {
        this.storage.releaseHalfOpenPermit();
        permitAcquiredInHalfOpen = false;
      }

      if (options?.fallback) {
        return options.fallback(error);
      }
      throw error;
    }
  }

  /**
   * Wraps a function with circuit breaker protection, preserving type signature.
   */
  public wrap<Args extends readonly unknown[], Return>(
    fn: (...args: Args) => Promise<Return> | Return,
    options?: ExecutionOptions<Return>
  ): (...args: Args) => Promise<Return> {
    return (...args: Args) => {
      const execOpts: ExecutionOptions<Return> = {
        timeoutMs: options?.timeoutMs,
        signal: options?.signal,
        context: options?.context,
        fallback: options?.fallback
          ? (err) => options.fallback!(err, ...args)
          : undefined,
      };
      return this.execute(() => fn(...args), execOpts);
    };
  }

  private acquireExecutionPermit():
    | { allowed: true; isHalfOpenPermit: boolean }
    | { allowed: false; rejectionError: Error } {
    this.checkAutomaticStateTransition();
    const state = this.storage.getState();

    switch (state) {
      case 'CLOSED':
      case 'FORCED_CLOSED':
      case 'DISABLED':
        return { allowed: true, isHalfOpenPermit: false };

      case 'OPEN':
      case 'FORCED_OPEN': {
        const retryAfterMs =
          state === 'FORCED_OPEN'
            ? Infinity
            : Math.max(0, (this.openUntilTimestamp ?? Date.now()) - Date.now());

        this.metricsCollector.recordRejected();
        this.eventEmitter.emit('callRejected', {
          breakerName: this.name,
          state,
          retryAfterMs,
          timestamp: Date.now(),
        });

        return {
          allowed: false,
          rejectionError: new CircuitBreakerOpenError(
            this.name,
            state,
            retryAfterMs,
            this.getSnapshot()
          ),
        };
      }

      case 'HALF_OPEN': {
        const acquired = this.storage.acquireHalfOpenPermit(
          this.permittedNumberOfCallsInHalfOpenState
        );
        if (acquired) {
          return { allowed: true, isHalfOpenPermit: true };
        }

        this.metricsCollector.recordRejected();
        this.eventEmitter.emit('callRejected', {
          breakerName: this.name,
          state: 'HALF_OPEN',
          retryAfterMs: 0,
          timestamp: Date.now(),
        });

        return {
          allowed: false,
          rejectionError: new CircuitBreakerHalfOpenCapacityExceededError(
            this.name,
            this.permittedNumberOfCallsInHalfOpenState
          ),
        };
      }
    }
  }

  private handleSuccess(
    durationMs: number,
    wasHalfOpenPermit: boolean,
    context?: Record<string, unknown> | undefined
  ): void {
    const isSlow = durationMs >= this.slowCallDurationThresholdMs;

    if (isSlow) {
      this.slidingWindow.recordSlowSuccess(durationMs);
      this.eventEmitter.emit('callSlow', {
        breakerName: this.name,
        state: this.storage.getState(),
        durationMs,
        thresholdMs: this.slowCallDurationThresholdMs,
        timestamp: Date.now(),
      });
    } else {
      this.slidingWindow.recordSuccess(durationMs);
    }

    this.metricsCollector.recordSuccess(durationMs, isSlow);
    this.eventEmitter.emit('callSuccess', {
      breakerName: this.name,
      state: this.storage.getState(),
      durationMs,
      timestamp: Date.now(),
      context,
    });

    if (wasHalfOpenPermit) {
      this.storage.releaseHalfOpenPermit();
      this.evaluateHalfOpenStateTransition();
    } else if (this.storage.getState() === 'CLOSED') {
      this.evaluateClosedStateTransition();
    }
  }

  private handleFailure(
    durationMs: number,
    error: unknown,
    wasHalfOpenPermit: boolean,
    context?: Record<string, unknown> | undefined
  ): void {
    const isSlow = durationMs >= this.slowCallDurationThresholdMs;

    if (isSlow) {
      this.slidingWindow.recordSlowFailure(durationMs);
    } else {
      this.slidingWindow.recordFailure(durationMs);
    }

    this.metricsCollector.recordFailure(durationMs, isSlow);
    this.eventEmitter.emit('callFailure', {
      breakerName: this.name,
      state: this.storage.getState(),
      durationMs,
      error,
      timestamp: Date.now(),
      context,
    });

    if (wasHalfOpenPermit) {
      this.storage.releaseHalfOpenPermit();
      // Any failure during HALF_OPEN probing trips immediately back to OPEN
      this.transitionTo('OPEN', 'HALF_OPEN_PROBE_FAILED');
    } else if (this.storage.getState() === 'CLOSED') {
      this.evaluateClosedStateTransition();
    }
  }

  private evaluateClosedStateTransition(): void {
    const snapshot = this.slidingWindow.getSnapshot();

    if (snapshot.totalCalls >= this.minimumNumberOfCalls) {
      if (snapshot.failureRate >= this.failureRateThreshold) {
        this.transitionTo('OPEN', 'FAILURE_RATE_EXCEEDED');
      } else if (snapshot.slowCallRate >= this.slowCallRateThreshold) {
        this.transitionTo('OPEN', 'SLOW_CALL_RATE_EXCEEDED');
      }
    }
  }

  private evaluateHalfOpenStateTransition(): void {
    const snapshot = this.slidingWindow.getSnapshot();

    if (snapshot.totalCalls >= this.permittedNumberOfCallsInHalfOpenState) {
      if (
        snapshot.failureRate < this.failureRateThreshold &&
        snapshot.slowCallRate < this.slowCallRateThreshold
      ) {
        this.transitionTo('CLOSED', 'HALF_OPEN_PROBE_SUCCEEDED');
      } else {
        this.transitionTo('OPEN', 'HALF_OPEN_PROBE_FAILED');
      }
    }
  }

  private checkAutomaticStateTransition(): void {
    if (
      this.automaticTransitionFromOpenToHalfOpenEnabled &&
      this.storage.getState() === 'OPEN' &&
      this.openUntilTimestamp !== undefined &&
      Date.now() >= this.openUntilTimestamp
    ) {
      this.transitionTo('HALF_OPEN', 'WAIT_DURATION_EXPIRED');
    }
  }

  public transitionTo(toState: CircuitBreakerState, reason: StateChangeReason): void {
    const fromState = this.storage.getState();
    if (fromState === toState) {
      return;
    }

    this.stateTransitionTimestamp = Date.now();
    this.storage.setState(toState);

    if (toState === 'OPEN') {
      this.openCycleCount++;
      const waitDuration = this.backoffStrategy.calculate(this.openCycleCount - 1);
      this.openUntilTimestamp = Date.now() + waitDuration;
    } else if (toState === 'CLOSED') {
      this.openCycleCount = 0;
      this.openUntilTimestamp = undefined;
      this.backoffStrategy.reset();
      this.slidingWindow.reset();
    } else if (toState === 'HALF_OPEN') {
      this.slidingWindow.reset();
    }

    const currentSnapshot = this.getSnapshot();
    this.eventEmitter.emit('stateChange', {
      breakerName: this.name,
      fromState,
      toState,
      reason,
      timestamp: this.stateTransitionTimestamp,
      metrics: currentSnapshot,
    });
  }

  public forceOpen(): void {
    this.transitionTo('FORCED_OPEN', 'MANUAL_TRANSITION');
  }

  public forceClosed(): void {
    this.transitionTo('FORCED_CLOSED', 'MANUAL_TRANSITION');
  }

  public disable(): void {
    this.transitionTo('DISABLED', 'MANUAL_TRANSITION');
  }

  public reset(): void {
    this.transitionTo('CLOSED', 'MANUAL_RESET');
    this.slidingWindow.reset();
    this.metricsCollector.reset();
    this.storage.reset();
    this.eventEmitter.emit('reset', {
      breakerName: this.name,
      timestamp: Date.now(),
    });
  }

  public getSnapshot(): CircuitBreakerMetricsSnapshot {
    const windowSnapshot = this.slidingWindow.getSnapshot();
    return {
      state: this.storage.getState(),
      failureRate: windowSnapshot.failureRate,
      slowCallRate: windowSnapshot.slowCallRate,
      totalCalls: windowSnapshot.totalCalls,
      successfulCalls: windowSnapshot.successfulCalls,
      failedCalls: windowSnapshot.failedCalls,
      slowCalls: windowSnapshot.slowCalls,
      slowSuccessfulCalls: windowSnapshot.slowSuccessfulCalls,
      slowFailedCalls: windowSnapshot.slowFailedCalls,
      notPermittedCalls: this.metricsCollector.getCumulative().rejectedCalls,
      stateTransitionTimestamp: this.stateTransitionTimestamp,
      nextPermittedProbeTimestamp: this.openUntilTimestamp,
      openCycleCount: this.openCycleCount,
    };
  }

  public toPrometheusMetrics(options?: PrometheusExportOptions): string {
    return formatPrometheusMetrics(
      this.name,
      this.getSnapshot(),
      this.metricsCollector.getCumulative(),
      this.metricsCollector.getLatencyPercentiles(),
      options
    );
  }

  private async executeWithTimeout<T>(
    action: (signal?: AbortSignal) => Promise<T> | T,
    timeoutMs: number,
    externalSignal?: AbortSignal
  ): Promise<T> {
    const controller = new AbortController();

    const onExternalAbort = () => controller.abort();
    if (externalSignal) {
      if (externalSignal.aborted) {
        controller.abort();
      } else {
        externalSignal.addEventListener('abort', onExternalAbort, { once: true });
      }
    }

    let timer: ReturnType<typeof setTimeout> | undefined;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new CircuitBreakerTimeoutError(this.name, timeoutMs, timeoutMs));
      }, timeoutMs);
    });

    try {
      const result = await Promise.race([action(controller.signal), timeoutPromise]);
      return result;
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      if (externalSignal) {
        externalSignal.removeEventListener('abort', onExternalAbort);
      }
    }
  }

  private isTimeoutError(error: unknown): boolean {
    return error instanceof CircuitBreakerTimeoutError;
  }
}
