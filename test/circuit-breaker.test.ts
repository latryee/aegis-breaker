import { describe, expect, it, vi } from 'vitest';
import { CircuitBreaker } from '../src/core/circuit-breaker.js';
import {
  CircuitBreakerHalfOpenCapacityExceededError,
  CircuitBreakerOpenError,
  CircuitBreakerResultFailureError,
  CircuitBreakerTimeoutError,
} from '../src/core/errors.js';

describe('CircuitBreaker', () => {
  it('should successfully execute actions when CLOSED', async () => {
    const breaker = new CircuitBreaker({ name: 'test-service' });

    const result = await breaker.execute(async () => {
      return { status: 'ok', data: 42 };
    });

    expect(result).toEqual({ status: 'ok', data: 42 });
    expect(breaker.getState()).toBe('CLOSED');

    const snapshot = breaker.getSnapshot();
    expect(snapshot.totalCalls).toBe(1);
    expect(snapshot.successfulCalls).toBe(1);
    expect(snapshot.failedCalls).toBe(0);
    expect(snapshot.failureRate).toBe(0);
  });

  it('should transition from CLOSED to OPEN when failure rate threshold is exceeded', async () => {
    const breaker = new CircuitBreaker({
      minimumNumberOfCalls: 4,
      failureRateThreshold: 50,
      slidingWindowSize: 4,
      waitDurationInOpenStateMs: 5000,
    });

    const stateChanges: string[] = [];
    breaker.on('stateChange', (e) => stateChanges.push(`${e.fromState} -> ${e.toState}`));

    // 2 successes, 2 failures = 50% failure rate -> should trip to OPEN
    await breaker.execute(async () => 'ok');
    await breaker.execute(async () => 'ok');
    await expect(breaker.execute(async () => { throw new Error('fail 1'); })).rejects.toThrow('fail 1');
    await expect(breaker.execute(async () => { throw new Error('fail 2'); })).rejects.toThrow('fail 2');

    expect(breaker.getState()).toBe('OPEN');
    expect(stateChanges).toContain('CLOSED -> OPEN');

    // Next request should fail fast with CircuitBreakerOpenError
    await expect(breaker.execute(async () => 'blocked')).rejects.toThrow(CircuitBreakerOpenError);
  });

  it('should transition from CLOSED to OPEN when slow call rate threshold is exceeded', async () => {
    const breaker = new CircuitBreaker({
      minimumNumberOfCalls: 2,
      slowCallRateThreshold: 50,
      slowCallDurationThresholdMs: 50,
      slidingWindowSize: 2,
    });

    // 1 fast call, 1 slow call (60ms) -> 50% slow call rate -> trips to OPEN
    await breaker.execute(async () => 'fast');
    await breaker.execute(async () => {
      await new Promise((r) => setTimeout(r, 60));
      return 'slow';
    });

    expect(breaker.getState()).toBe('OPEN');
  });

  it('should enforce execution timeout and throw CircuitBreakerTimeoutError', async () => {
    const breaker = new CircuitBreaker({
      defaultTimeoutMs: 50,
    });

    const timeoutEvents: number[] = [];
    breaker.on('callTimeout', (e) => timeoutEvents.push(e.timeoutMs));

    await expect(
      breaker.execute(async () => {
        await new Promise((r) => setTimeout(r, 200));
        return 'too late';
      })
    ).rejects.toThrow(CircuitBreakerTimeoutError);

    expect(timeoutEvents).toHaveLength(1);
    expect(timeoutEvents[0]).toBe(50);
  });

  it('should execute fallback handler when circuit is OPEN or operation fails', async () => {
    const breaker = new CircuitBreaker({
      minimumNumberOfCalls: 1,
      failureRateThreshold: 50,
    });

    breaker.forceOpen();

    const fallbackResult = await breaker.execute(
      async () => 'primary',
      {
        fallback: (err) => `fallback-response (reason: ${(err as Error).name})`,
      }
    );

    expect(fallbackResult).toBe('fallback-response (reason: CircuitBreakerOpenError)');
  });

  it('should auto-transition from OPEN to HALF_OPEN after waitDuration and recover to CLOSED on success', async () => {
    vi.useFakeTimers();

    const breaker = new CircuitBreaker({
      minimumNumberOfCalls: 2,
      failureRateThreshold: 50,
      permittedNumberOfCallsInHalfOpenState: 2,
      waitDurationInOpenStateMs: 1000,
    });

    // Trip the breaker
    await expect(breaker.execute(async () => { throw new Error('err1'); })).rejects.toThrow();
    await expect(breaker.execute(async () => { throw new Error('err2'); })).rejects.toThrow();
    expect(breaker.getState()).toBe('OPEN');

    // Advance timer past wait duration
    vi.advanceTimersByTime(1100);

    // State should now become HALF_OPEN
    expect(breaker.getState()).toBe('HALF_OPEN');

    // Perform 2 successful trial calls in HALF_OPEN
    await breaker.execute(async () => 'trial 1');
    await breaker.execute(async () => 'trial 2');

    // Breaker should have recovered to CLOSED!
    expect(breaker.getState()).toBe('CLOSED');

    vi.useRealTimers();
  });

  it('should trip back to OPEN immediately if trial probe in HALF_OPEN fails', async () => {
    vi.useFakeTimers();

    const breaker = new CircuitBreaker({
      minimumNumberOfCalls: 2,
      failureRateThreshold: 50,
      permittedNumberOfCallsInHalfOpenState: 5,
      waitDurationInOpenStateMs: 1000,
    });

    // Trip to OPEN
    await expect(breaker.execute(async () => { throw new Error('err'); })).rejects.toThrow();
    await expect(breaker.execute(async () => { throw new Error('err'); })).rejects.toThrow();
    expect(breaker.getState()).toBe('OPEN');

    // Advance time to HALF_OPEN
    vi.advanceTimersByTime(1100);
    expect(breaker.getState()).toBe('HALF_OPEN');

    // Trial probe fails
    await expect(breaker.execute(async () => { throw new Error('trial failed'); })).rejects.toThrow();

    // Must immediately trip back to OPEN
    expect(breaker.getState()).toBe('OPEN');

    vi.useRealTimers();
  });

  it('should respect custom recordException and ignoreException predicates', async () => {
    class IgnoredBusinessError extends Error {}
    class CriticalInfrastructureError extends Error {}

    const breaker = new CircuitBreaker({
      minimumNumberOfCalls: 2,
      failureRateThreshold: 50,
      ignoreException: (err) => err instanceof IgnoredBusinessError,
    });

    // Ignored errors should not count toward failure rate
    await expect(breaker.execute(async () => { throw new IgnoredBusinessError('user not found'); })).rejects.toThrow();
    await expect(breaker.execute(async () => { throw new IgnoredBusinessError('user not found'); })).rejects.toThrow();

    const snapshot = breaker.getSnapshot();
    expect(snapshot.failedCalls).toBe(0);
    expect(breaker.getState()).toBe('CLOSED');
  });

  it('should respect recordResult predicate to trip on HTTP 500 status codes', async () => {
    const breaker = new CircuitBreaker({
      minimumNumberOfCalls: 2,
      failureRateThreshold: 50,
      recordResult: (res: any) => res && res.status >= 500,
    });

    // Returned object with status: 503 is treated as failure
    await expect(
      breaker.execute(async () => ({ status: 503, message: 'Service Unavailable' }))
    ).rejects.toThrow(CircuitBreakerResultFailureError);

    await expect(
      breaker.execute(async () => ({ status: 500, message: 'Internal Server Error' }))
    ).rejects.toThrow(CircuitBreakerResultFailureError);

    expect(breaker.getState()).toBe('OPEN');
  });

  it('should wrap functions cleanly with preserved typing', async () => {
    const breaker = new CircuitBreaker();

    const calculateTotal = breaker.wrap(async (price: number, quantity: number) => {
      return price * quantity;
    });

    const total = await calculateTotal(19.99, 3);
    expect(total).toBeCloseTo(59.97);
  });
});
