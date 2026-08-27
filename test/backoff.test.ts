import { describe, expect, it } from 'vitest';
import { ExponentialBackoff } from '../src/backoff/exponential-backoff.js';
import { FixedBackoff } from '../src/backoff/fixed-backoff.js';

describe('FixedBackoff', () => {
  it('should return constant duration', () => {
    const backoff = new FixedBackoff(5000);
    expect(backoff.calculate(0)).toBe(5000);
    expect(backoff.calculate(1)).toBe(5000);
    expect(backoff.calculate(5)).toBe(5000);
  });
});

describe('ExponentialBackoff', () => {
  it('should scale exponentially without jitter', () => {
    const backoff = new ExponentialBackoff({
      initialIntervalMs: 1000,
      multiplier: 2,
      maxIntervalMs: 10000,
      jitter: 'NONE',
    });

    expect(backoff.calculate(0)).toBe(1000);
    expect(backoff.calculate(1)).toBe(2000);
    expect(backoff.calculate(2)).toBe(4000);
    expect(backoff.calculate(3)).toBe(8000);
    // Capped at maxIntervalMs
    expect(backoff.calculate(4)).toBe(10000);
    expect(backoff.calculate(10)).toBe(10000);
  });

  it('should stay within bounds with FULL jitter', () => {
    const backoff = new ExponentialBackoff({
      initialIntervalMs: 1000,
      multiplier: 2,
      maxIntervalMs: 8000,
      jitter: 'FULL',
    });

    for (let i = 0; i < 50; i++) {
      const delay = backoff.calculate(2); // max 4000
      expect(delay).toBeGreaterThanOrEqual(0);
      expect(delay).toBeLessThanOrEqual(4000);
    }
  });

  it('should stay within bounds with DECORRELATED jitter', () => {
    const backoff = new ExponentialBackoff({
      initialIntervalMs: 1000,
      maxIntervalMs: 10000,
      jitter: 'DECORRELATED',
    });

    let prev = 1000;
    for (let i = 0; i < 20; i++) {
      const delay = backoff.calculate(i, prev);
      expect(delay).toBeGreaterThanOrEqual(1000);
      expect(delay).toBeLessThanOrEqual(10000);
      prev = delay;
    }
  });
});
