/**
 * @file count-sliding-window.ts
 * @description High-performance O(1) circular ring buffer implementing count-based sliding window.
 */

import {
  CallOutcome,
  type ISlidingWindow,
  type WindowMetricsSnapshot,
} from './sliding-window.interface.js';

export class CountSlidingWindow implements ISlidingWindow {
  private readonly size: number;
  private readonly buffer: Uint8Array;
  private head: number = 0;
  private count: number = 0;

  // Running totals maintained in O(1)
  private totalSuccess: number = 0;
  private totalFailure: number = 0;
  private totalSlowSuccess: number = 0;
  private totalSlowFailure: number = 0;

  constructor(size: number = 100) {
    if (size <= 0 || !Number.isInteger(size)) {
      throw new Error(`Sliding window size must be a positive integer, received: ${size}`);
    }
    this.size = size;
    // Uint8Array pre-allocated for zero memory allocation during runtime execution
    this.buffer = new Uint8Array(size);
  }

  public recordSuccess(_durationMs: number): void {
    this.recordOutcome(CallOutcome.SUCCESS);
  }

  public recordFailure(_durationMs: number): void {
    this.recordOutcome(CallOutcome.FAILURE);
  }

  public recordSlowSuccess(_durationMs: number): void {
    this.recordOutcome(CallOutcome.SLOW_SUCCESS);
  }

  public recordSlowFailure(_durationMs: number): void {
    this.recordOutcome(CallOutcome.SLOW_FAILURE);
  }

  private recordOutcome(outcome: CallOutcome): void {
    if (this.count >= this.size) {
      // Evict oldest outcome currently at head
      const evicted = this.buffer[this.head];
      this.decrementOutcome(evicted);
    } else {
      this.count++;
    }

    // Insert new outcome into ring buffer
    this.buffer[this.head] = outcome;
    this.incrementOutcome(outcome);

    // Advance circular pointer
    this.head = (this.head + 1) % this.size;
  }

  private incrementOutcome(outcome: number | undefined): void {
    switch (outcome) {
      case CallOutcome.SUCCESS:
        this.totalSuccess++;
        break;
      case CallOutcome.FAILURE:
        this.totalFailure++;
        break;
      case CallOutcome.SLOW_SUCCESS:
        this.totalSlowSuccess++;
        break;
      case CallOutcome.SLOW_FAILURE:
        this.totalSlowFailure++;
        break;
    }
  }

  private decrementOutcome(outcome: number | undefined): void {
    switch (outcome) {
      case CallOutcome.SUCCESS:
        this.totalSuccess = Math.max(0, this.totalSuccess - 1);
        break;
      case CallOutcome.FAILURE:
        this.totalFailure = Math.max(0, this.totalFailure - 1);
        break;
      case CallOutcome.SLOW_SUCCESS:
        this.totalSlowSuccess = Math.max(0, this.totalSlowSuccess - 1);
        break;
      case CallOutcome.SLOW_FAILURE:
        this.totalSlowFailure = Math.max(0, this.totalSlowFailure - 1);
        break;
    }
  }

  public getSnapshot(): WindowMetricsSnapshot {
    const totalCalls = this.count;
    const failedCalls = this.totalFailure + this.totalSlowFailure;
    const successfulCalls = this.totalSuccess + this.totalSlowSuccess;
    const slowCalls = this.totalSlowSuccess + this.totalSlowFailure;

    const failureRate = totalCalls > 0 ? (failedCalls / totalCalls) * 100 : 0;
    const slowCallRate = totalCalls > 0 ? (slowCalls / totalCalls) * 100 : 0;

    return {
      totalCalls,
      successfulCalls,
      failedCalls,
      slowCalls,
      slowSuccessfulCalls: this.totalSlowSuccess,
      slowFailedCalls: this.totalSlowFailure,
      failureRate: Math.round(failureRate * 100) / 100,
      slowCallRate: Math.round(slowCallRate * 100) / 100,
    };
  }

  public reset(): void {
    this.buffer.fill(0);
    this.head = 0;
    this.count = 0;
    this.totalSuccess = 0;
    this.totalFailure = 0;
    this.totalSlowSuccess = 0;
    this.totalSlowFailure = 0;
  }
}
