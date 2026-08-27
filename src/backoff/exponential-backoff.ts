/**
 * @file exponential-backoff.ts
 * @description Exponential backoff implementation with Full Jitter and Decorrelated Jitter.
 * Based on AWS Architecture resilience principles: https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/
 */

import type { BackoffOptions, JitterStrategy } from '../core/types.js';
import type { IBackoffStrategy } from './backoff.interface.js';

export class ExponentialBackoff implements IBackoffStrategy {
  private readonly initialIntervalMs: number;
  private readonly multiplier: number;
  private readonly maxIntervalMs: number;
  private readonly jitter: JitterStrategy;
  private lastCalculatedInterval: number;

  constructor(options: BackoffOptions = {}) {
    this.initialIntervalMs = Math.max(1, options.initialIntervalMs ?? 10000);
    this.multiplier = Math.max(1, options.multiplier ?? 2);
    this.maxIntervalMs = Math.max(this.initialIntervalMs, options.maxIntervalMs ?? 120000);
    this.jitter = options.jitter ?? 'FULL';
    this.lastCalculatedInterval = this.initialIntervalMs;
  }

  public calculate(attempt: number, lastIntervalMs?: number): number {
    const safeAttempt = Math.max(0, attempt);
    const prev = lastIntervalMs ?? this.lastCalculatedInterval;

    let delay: number;

    switch (this.jitter) {
      case 'FULL': {
        // Full Jitter: Sleep = rand(0, min(maxInterval, initialInterval * 2^attempt))
        const cappedInterval = Math.min(
          this.maxIntervalMs,
          this.initialIntervalMs * Math.pow(this.multiplier, safeAttempt)
        );
        delay = Math.random() * cappedInterval;
        break;
      }

      case 'DECORRELATED': {
        // Decorrelated Jitter: Sleep = min(maxInterval, rand(initialInterval, prev * 3))
        const high = Math.max(this.initialIntervalMs, prev * 3);
        const low = this.initialIntervalMs;
        delay = Math.min(this.maxIntervalMs, low + Math.random() * (high - low));
        break;
      }

      case 'NONE':
      default: {
        delay = Math.min(
          this.maxIntervalMs,
          this.initialIntervalMs * Math.pow(this.multiplier, safeAttempt)
        );
        break;
      }
    }

    this.lastCalculatedInterval = Math.round(delay);
    return this.lastCalculatedInterval;
  }

  public reset(): void {
    this.lastCalculatedInterval = this.initialIntervalMs;
  }
}
