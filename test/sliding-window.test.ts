import { describe, expect, it } from 'vitest';
import { CountSlidingWindow } from '../src/window/count-sliding-window.js';
import { TimeSlidingWindow } from '../src/window/time-sliding-window.js';

describe('CountSlidingWindow', () => {
  it('should initialize with zero counts', () => {
    const window = new CountSlidingWindow(10);
    const snapshot = window.getSnapshot();

    expect(snapshot.totalCalls).toBe(0);
    expect(snapshot.successfulCalls).toBe(0);
    expect(snapshot.failedCalls).toBe(0);
    expect(snapshot.failureRate).toBe(0);
    expect(snapshot.slowCallRate).toBe(0);
  });

  it('should accurately track successes and failures within capacity', () => {
    const window = new CountSlidingWindow(10);

    window.recordSuccess(20);
    window.recordSuccess(30);
    window.recordFailure(40);
    window.recordFailure(50);

    const snapshot = window.getSnapshot();
    expect(snapshot.totalCalls).toBe(4);
    expect(snapshot.successfulCalls).toBe(2);
    expect(snapshot.failedCalls).toBe(2);
    expect(snapshot.failureRate).toBe(50);
  });

  it('should accurately evict oldest results when ring buffer overflows', () => {
    const window = new CountSlidingWindow(4);

    // Record 4 failures -> 100% failure rate
    window.recordFailure(10);
    window.recordFailure(10);
    window.recordFailure(10);
    window.recordFailure(10);

    expect(window.getSnapshot().failureRate).toBe(100);

    // Now record 4 successes -> should evict all failures -> 0% failure rate
    window.recordSuccess(10);
    window.recordSuccess(10);
    window.recordSuccess(10);
    window.recordSuccess(10);

    const snapshot = window.getSnapshot();
    expect(snapshot.totalCalls).toBe(4);
    expect(snapshot.successfulCalls).toBe(4);
    expect(snapshot.failedCalls).toBe(0);
    expect(snapshot.failureRate).toBe(0);
  });

  it('should track slow calls and slow call rate', () => {
    const window = new CountSlidingWindow(4);

    window.recordSuccess(10);
    window.recordSlowSuccess(500);
    window.recordSlowFailure(600);
    window.recordFailure(20);

    const snapshot = window.getSnapshot();
    expect(snapshot.totalCalls).toBe(4);
    expect(snapshot.successfulCalls).toBe(2);
    expect(snapshot.failedCalls).toBe(2);
    expect(snapshot.slowCalls).toBe(2);
    expect(snapshot.slowCallRate).toBe(50);
    expect(snapshot.failureRate).toBe(50);
  });

  it('should reset properly', () => {
    const window = new CountSlidingWindow(10);
    window.recordSuccess(10);
    window.recordFailure(10);
    window.reset();

    const snapshot = window.getSnapshot();
    expect(snapshot.totalCalls).toBe(0);
    expect(snapshot.failureRate).toBe(0);
  });
});

describe('TimeSlidingWindow', () => {
  it('should record calls in time buckets and calculate rates', () => {
    // 10 second window, 10 buckets (1 sec per bucket)
    const window = new TimeSlidingWindow(10000, 10);

    window.recordSuccess(10);
    window.recordSuccess(20);
    window.recordFailure(30);

    const snapshot = window.getSnapshot();
    expect(snapshot.totalCalls).toBe(3);
    expect(snapshot.successfulCalls).toBe(2);
    expect(snapshot.failedCalls).toBe(1);
    expect(snapshot.failureRate).toBeCloseTo(33.33, 1);
  });

  it('should roll over and evict buckets older than window duration', () => {
    const window = new TimeSlidingWindow(5000, 5); // 5 buckets, 1000ms each
    const baseTime = 100000;

    // Record at baseTime (epoch 100)
    // We simulate by monkey-patching or passing time if testable
    // Let's test getSnapshot at simulated future times
    window.recordSuccess(10);

    // Snapshot at current time
    const initial = window.getSnapshot();
    expect(initial.totalCalls).toBe(1);

    // Snapshot 10 seconds later (stale buckets evicted)
    const futureSnapshot = window.getSnapshot(Date.now() + 20000);
    expect(futureSnapshot.totalCalls).toBe(0);
  });
});
