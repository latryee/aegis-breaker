import { describe, expect, it } from 'vitest';
import { CircuitBreaker } from '../src/core/circuit-breaker.js';

describe('Prometheus Metrics Exporter', () => {
  it('should export valid OpenMetrics formatted prometheus metrics', async () => {
    const breaker = new CircuitBreaker({ name: 'payment-svc' });

    await breaker.execute(async () => 'ok');
    await expect(breaker.execute(async () => { throw new Error('fail'); })).rejects.toThrow();

    const metricsText = breaker.toPrometheusMetrics({
      labels: { env: 'production', cluster: 'us-east-1' },
    });

    expect(metricsText).toContain('circuit_breaker_state{name="payment-svc",env="production",cluster="us-east-1",state="CLOSED"} 0');
    expect(metricsText).toContain('circuit_breaker_calls_total{name="payment-svc",env="production",cluster="us-east-1",result="success"} 1');
    expect(metricsText).toContain('circuit_breaker_calls_total{name="payment-svc",env="production",cluster="us-east-1",result="failure"} 1');
    expect(metricsText).toContain('circuit_breaker_latency_ms{name="payment-svc",env="production",cluster="us-east-1",quantile="0.50"}');
  });
});
