import { describe, expect, it } from 'vitest';
import { CircuitBreaker } from '../src/core/circuit-breaker.js';
import { CircuitBreakerHalfOpenCapacityExceededError } from '../src/core/errors.js';

describe('Concurrency & Race Condition Handling', () => {
  it('should handle hundreds of simultaneous concurrent requests cleanly', async () => {
    const breaker = new CircuitBreaker({
      minimumNumberOfCalls: 100,
      failureRateThreshold: 50,
      slidingWindowSize: 100,
    });

    const concurrentRequests = 100;
    const promises = Array.from({ length: concurrentRequests }, (_, i) =>
      breaker.execute(async () => {
        // Small async jitter
        await new Promise((r) => setTimeout(r, Math.random() * 10));
        if (i % 4 === 0) {
          throw new Error(`error at ${i}`);
        }
        return `success-${i}`;
      }).catch((err) => err.message)
    );

    const results = await Promise.all(promises);
    expect(results).toHaveLength(100);

    const snapshot = breaker.getSnapshot();
    expect(snapshot.totalCalls).toBe(100);
    expect(snapshot.failedCalls).toBe(25);
    expect(snapshot.successfulCalls).toBe(75);
    expect(snapshot.failureRate).toBe(25);
    expect(breaker.getState()).toBe('CLOSED');
  });

  it('should strictly throttle half-open probe permits under high concurrent burst', async () => {
    const breaker = new CircuitBreaker({
      permittedNumberOfCallsInHalfOpenState: 3,
    });

    // Manually force HALF_OPEN
    breaker.transitionTo('HALF_OPEN', 'MANUAL_TRANSITION');

    // Fire 10 concurrent requests at the exact same tick
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        breaker.execute(async () => {
          await new Promise((r) => setTimeout(r, 50));
          return 'ok';
        })
      )
    );

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejectedCapacity = results.filter(
      (r) =>
        r.status === 'rejected' &&
        r.reason instanceof CircuitBreakerHalfOpenCapacityExceededError
    );

    // Exactly 3 permits should have been accepted, 7 rejected with capacity error
    expect(fulfilled.length).toBe(3);
    expect(rejectedCapacity.length).toBe(7);
  });
});
