/**
 * @file basic-usage.ts
 * @description Quickstart guide for VoltBreaker Circuit Breaker.
 */

import { CircuitBreaker, CircuitBreakerOpenError } from '../src/index.js';

async function main() {
  console.log('--- VoltBreaker Quickstart ---\n');

  // 1. Configure circuit breaker
  const breaker = new CircuitBreaker({
    name: 'user-profile-service',
    failureRateThreshold: 50, // Trip when >= 50% fail
    minimumNumberOfCalls: 5, // Evaluate after 5 calls
    waitDurationInOpenStateMs: 5000, // Stay open for 5 seconds before trial probe
    backoffOptions: {
      initialIntervalMs: 2000,
      multiplier: 2,
      jitter: 'FULL',
    },
  });

  // 2. Listen to lifecycle events
  breaker.on('stateChange', (event) => {
    console.log(`🔄 [State Change] ${event.fromState} ➔ ${event.toState} (Reason: ${event.reason})`);
  });

  breaker.on('callRejected', (event) => {
    console.log(`⛔ [Rejected] Fast-failing. Retry allowed in ${Math.ceil(event.retryAfterMs)}ms`);
  });

  // 3. Simulated unreliable upstream service
  let isServiceHealthy = true;

  async function fetchUserProfile(userId: string) {
    if (!isServiceHealthy) {
      throw new Error('503 Service Unavailable: Database cluster saturated');
    }
    return { id: userId, name: 'Alice', plan: 'Enterprise' };
  }

  // 4. Wrap or execute with fallback
  const getProfile = breaker.wrap(fetchUserProfile, {
    fallback: (error, userId) => {
      console.log(`⚠️ Fallback triggered for user ${userId}: ${(error as Error).message}`);
      return { id: String(userId), name: 'Cached User', plan: 'Free (Offline Cache)' };
    },
  });

  // Phase 1: Normal traffic
  console.log('\n--- Phase 1: Healthy Traffic ---');
  for (let i = 1; i <= 3; i++) {
    const res = await getProfile(`user-${i}`);
    console.log(`✅ Success:`, res);
  }

  // Phase 2: Upstream outage
  console.log('\n--- Phase 2: Upstream Outage ---');
  isServiceHealthy = false;
  for (let i = 4; i <= 8; i++) {
    const res = await getProfile(`user-${i}`);
    console.log(`Result:`, res);
  }

  // Phase 3: State inspection
  console.log('\n--- Phase 3: Metrics Snapshot ---');
  console.log(breaker.getSnapshot());

  // Phase 4: Prometheus scrape output
  console.log('\n--- Phase 4: Prometheus Metrics ---');
  console.log(breaker.toPrometheusMetrics());
}

main().catch(console.error);
