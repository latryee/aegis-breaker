/**
 * @file time-sliding-window.ts
 * @description Leaping-bucket circular ring buffer for time-based sliding window metrics.
 */

import {
  type ISlidingWindow,
  type WindowMetricsSnapshot,
} from './sliding-window.interface.js';

interface TimeBucket {
  epochIndex: number;
  success: number;
  failure: number;
  slowSuccess: number;
  slowFailure: number;
}

export class TimeSlidingWindow implements ISlidingWindow {
  private readonly windowDurationMs: number;
  private readonly bucketCount: number;
  private readonly bucketDurationMs: number;
  private readonly buckets: TimeBucket[];

  constructor(windowDurationMs: number = 60000, bucketCount: number = 10) {
    if (windowDurationMs <= 0) {
      throw new Error(`Window duration must be > 0, received: ${windowDurationMs}`);
    }
    if (bucketCount <= 0 || !Number.isInteger(bucketCount)) {
      throw new Error(`Bucket count must be a positive integer, received: ${bucketCount}`);
    }

    this.windowDurationMs = windowDurationMs;
    this.bucketCount = bucketCount;
    this.bucketDurationMs = Math.max(1, Math.floor(windowDurationMs / bucketCount));

    this.buckets = Array.from({ length: bucketCount }, () => ({
      epochIndex: -1,
      success: 0,
      failure: 0,
      slowSuccess: 0,
      slowFailure: 0,
    }));
  }

  public recordSuccess(_durationMs: number): void {
    const bucket = this.getOrRefreshCurrentBucket();
    bucket.success++;
  }

  public recordFailure(_durationMs: number): void {
    const bucket = this.getOrRefreshCurrentBucket();
    bucket.failure++;
  }

  public recordSlowSuccess(_durationMs: number): void {
    const bucket = this.getOrRefreshCurrentBucket();
    bucket.slowSuccess++;
  }

  public recordSlowFailure(_durationMs: number): void {
    const bucket = this.getOrRefreshCurrentBucket();
    bucket.slowFailure++;
  }

  private getOrRefreshCurrentBucket(now: number = Date.now()): TimeBucket {
    const currentEpoch = Math.floor(now / this.bucketDurationMs);
    const bucketIndex = ((currentEpoch % this.bucketCount) + this.bucketCount) % this.bucketCount;
    const bucket = this.buckets[bucketIndex]!;

    if (bucket.epochIndex !== currentEpoch) {
      bucket.epochIndex = currentEpoch;
      bucket.success = 0;
      bucket.failure = 0;
      bucket.slowSuccess = 0;
      bucket.slowFailure = 0;
    }

    return bucket;
  }

  public getSnapshot(now: number = Date.now()): WindowMetricsSnapshot {
    const currentEpoch = Math.floor(now / this.bucketDurationMs);

    let totalSuccess = 0;
    let totalFailure = 0;
    let totalSlowSuccess = 0;
    let totalSlowFailure = 0;

    for (let i = 0; i < this.bucketCount; i++) {
      const bucket = this.buckets[i]!;
      // Only include buckets within the active sliding time frame
      if (bucket.epochIndex >= 0 && currentEpoch - bucket.epochIndex < this.bucketCount) {
        totalSuccess += bucket.success;
        totalFailure += bucket.failure;
        totalSlowSuccess += bucket.slowSuccess;
        totalSlowFailure += bucket.slowFailure;
      }
    }

    const failedCalls = totalFailure + totalSlowFailure;
    const successfulCalls = totalSuccess + totalSlowSuccess;
    const slowCalls = totalSlowSuccess + totalSlowFailure;
    const totalCalls = successfulCalls + failedCalls;

    const failureRate = totalCalls > 0 ? (failedCalls / totalCalls) * 100 : 0;
    const slowCallRate = totalCalls > 0 ? (slowCalls / totalCalls) * 100 : 0;

    return {
      totalCalls,
      successfulCalls,
      failedCalls,
      slowCalls,
      slowSuccessfulCalls: totalSlowSuccess,
      slowFailedCalls: totalSlowFailure,
      failureRate: Math.round(failureRate * 100) / 100,
      slowCallRate: Math.round(slowCallRate * 100) / 100,
    };
  }

  public reset(): void {
    for (let i = 0; i < this.bucketCount; i++) {
      const bucket = this.buckets[i]!;
      bucket.epochIndex = -1;
      bucket.success = 0;
      bucket.failure = 0;
      bucket.slowSuccess = 0;
      bucket.slowFailure = 0;
    }
  }
}
