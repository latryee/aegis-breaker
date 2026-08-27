/**
 * @file prometheus-exporter.ts
 * @description Exports Circuit Breaker state and metrics into standard Prometheus exposition format.
 */

import type { CircuitBreakerMetricsSnapshot } from '../core/types.js';
import type { CumulativeMetrics } from './metrics-collector.js';

export interface PrometheusExportOptions {
  prefix?: string;
  labels?: Record<string, string>;
}

export function formatPrometheusMetrics(
  breakerName: string,
  snapshot: CircuitBreakerMetricsSnapshot,
  cumulative: CumulativeMetrics,
  percentiles: { p50: number; p90: number; p99: number; mean: number },
  options: PrometheusExportOptions = {}
): string {
  const prefix = options.prefix ?? 'circuit_breaker';
  const customLabels = options.labels
    ? Object.entries(options.labels)
        .map(([k, v]) => `${k}="${v}"`)
        .join(',')
    : '';

  const labelBase = `name="${breakerName}"${customLabels ? `,${customLabels}` : ''}`;

  const stateNumericMap: Record<string, number> = {
    CLOSED: 0,
    HALF_OPEN: 1,
    OPEN: 2,
    FORCED_OPEN: 3,
    FORCED_CLOSED: 4,
    DISABLED: 5,
  };

  const stateCode = stateNumericMap[snapshot.state] ?? -1;

  const lines = [
    `# HELP ${prefix}_state Current state of the circuit breaker (0=CLOSED, 1=HALF_OPEN, 2=OPEN, 3=FORCED_OPEN, 4=FORCED_CLOSED, 5=DISABLED)`,
    `# TYPE ${prefix}_state gauge`,
    `${prefix}_state{${labelBase},state="${snapshot.state}"} ${stateCode}`,
    '',
    `# HELP ${prefix}_failure_rate_percent Current rolling failure rate percentage`,
    `# TYPE ${prefix}_failure_rate_percent gauge`,
    `${prefix}_failure_rate_percent{${labelBase}} ${snapshot.failureRate}`,
    '',
    `# HELP ${prefix}_slow_call_rate_percent Current rolling slow call rate percentage`,
    `# TYPE ${prefix}_slow_call_rate_percent gauge`,
    `${prefix}_slow_call_rate_percent{${labelBase}} ${snapshot.slowCallRate}`,
    '',
    `# HELP ${prefix}_calls_total Total number of calls recorded`,
    `# TYPE ${prefix}_calls_total counter`,
    `${prefix}_calls_total{${labelBase},result="success"} ${cumulative.successfulCalls}`,
    `${prefix}_calls_total{${labelBase},result="failure"} ${cumulative.failedCalls}`,
    `${prefix}_calls_total{${labelBase},result="slow"} ${cumulative.slowCalls}`,
    `${prefix}_calls_total{${labelBase},result="rejected"} ${cumulative.rejectedCalls}`,
    `${prefix}_calls_total{${labelBase},result="timeout"} ${cumulative.timeoutCalls}`,
    '',
    `# HELP ${prefix}_latency_ms Latency percentiles estimated by reservoir sampling`,
    `# TYPE ${prefix}_latency_ms gauge`,
    `${prefix}_latency_ms{${labelBase},quantile="0.50"} ${percentiles.p50}`,
    `${prefix}_latency_ms{${labelBase},quantile="0.90"} ${percentiles.p90}`,
    `${prefix}_latency_ms{${labelBase},quantile="0.99"} ${percentiles.p99}`,
    `${prefix}_latency_ms{${labelBase},quantile="mean"} ${percentiles.mean}`,
  ];

  return lines.join('\n') + '\n';
}
