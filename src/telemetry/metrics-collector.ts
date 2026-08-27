/**
 * @file metrics-collector.ts
 * @description Lifetime metrics aggregator and latency percentile estimator.
 */

export interface CumulativeMetrics {
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  slowCalls: number;
  rejectedCalls: number;
  timeoutCalls: number;
  totalDurationMs: number;
}

export class MetricsCollector {
  private cumulative: CumulativeMetrics = {
    totalCalls: 0,
    successfulCalls: 0,
    failedCalls: 0,
    slowCalls: 0,
    rejectedCalls: 0,
    timeoutCalls: 0,
    totalDurationMs: 0,
  };

  // Reservoir sample for latency percentiles (P50, P90, P99)
  private readonly reservoirSize: number = 256;
  private readonly latencySamples: number[] = [];

  public recordSuccess(durationMs: number, isSlow: boolean): void {
    this.cumulative.totalCalls++;
    this.cumulative.successfulCalls++;
    this.cumulative.totalDurationMs += durationMs;
    if (isSlow) {
      this.cumulative.slowCalls++;
    }
    this.addLatencySample(durationMs);
  }

  public recordFailure(durationMs: number, isSlow: boolean): void {
    this.cumulative.totalCalls++;
    this.cumulative.failedCalls++;
    this.cumulative.totalDurationMs += durationMs;
    if (isSlow) {
      this.cumulative.slowCalls++;
    }
    this.addLatencySample(durationMs);
  }

  public recordRejected(): void {
    this.cumulative.rejectedCalls++;
  }

  public recordTimeout(durationMs: number): void {
    this.cumulative.totalCalls++;
    this.cumulative.failedCalls++;
    this.cumulative.timeoutCalls++;
    this.cumulative.totalDurationMs += durationMs;
    this.addLatencySample(durationMs);
  }

  private addLatencySample(durationMs: number): void {
    if (this.latencySamples.length < this.reservoirSize) {
      this.latencySamples.push(durationMs);
    } else {
      // Vitter's reservoir sampling algorithm R
      const replaceIndex = Math.floor(Math.random() * this.cumulative.totalCalls);
      if (replaceIndex < this.reservoirSize) {
        this.latencySamples[replaceIndex] = durationMs;
      }
    }
  }

  public getLatencyPercentiles(): { p50: number; p90: number; p99: number; mean: number } {
    if (this.latencySamples.length === 0) {
      return { p50: 0, p90: 0, p99: 0, mean: 0 };
    }

    const sorted = [...this.latencySamples].sort((a, b) => a - b);
    const len = sorted.length;

    const p50 = sorted[Math.floor(len * 0.5)] ?? 0;
    const p90 = sorted[Math.floor(len * 0.9)] ?? 0;
    const p99 = sorted[Math.floor(len * 0.99)] ?? 0;
    const mean =
      this.cumulative.totalCalls > 0
        ? Math.round((this.cumulative.totalDurationMs / this.cumulative.totalCalls) * 100) / 100
        : 0;

    return { p50, p90, p99, mean };
  }

  public getCumulative(): Readonly<CumulativeMetrics> {
    return { ...this.cumulative };
  }

  public reset(): void {
    this.cumulative = {
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      slowCalls: 0,
      rejectedCalls: 0,
      timeoutCalls: 0,
      totalDurationMs: 0,
    };
    this.latencySamples.length = 0;
  }
}
