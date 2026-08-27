/**
 * @file fixed-backoff.ts
 * @description Constant duration backoff strategy.
 */

import type { IBackoffStrategy } from './backoff.interface.js';

export class FixedBackoff implements IBackoffStrategy {
  private readonly intervalMs: number;

  constructor(intervalMs: number = 60000) {
    this.intervalMs = Math.max(1, intervalMs);
  }

  public calculate(_attempt: number, _lastIntervalMs?: number): number {
    return this.intervalMs;
  }

  public reset(): void {
    // No-op for fixed backoff
  }
}
