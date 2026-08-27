/**
 * @file http-resilience.ts
 * @description Real-world HTTP microservice communication pattern with status-code predicates.
 */

import { CircuitBreaker } from '../src/index.js';

class HttpGatewayError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
    this.name = 'HttpGatewayError';
  }
}

async function runHttpExample() {
  console.log('=== VoltBreaker HTTP Microservice Resilience Pattern ===\n');

  const paymentBreaker = new CircuitBreaker({
    name: 'stripe-payment-gateway',
    failureRateThreshold: 50,
    minimumNumberOfCalls: 4,
    slowCallRateThreshold: 50,
    slowCallDurationThresholdMs: 300, // 300ms latency tripwire
    waitDurationInOpenStateMs: 3000,
    // Don't trip breaker for user validation errors (400, 404, 422)
    ignoreException: (err) => {
      if (err instanceof HttpGatewayError) {
        return err.statusCode >= 400 && err.statusCode < 500;
      }
      return false;
    },
    // Trip breaker on server errors (500, 502, 503, 504)
    recordException: (err) => {
      if (err instanceof HttpGatewayError) {
        return err.statusCode >= 500;
      }
      return true;
    },
  });

  paymentBreaker.on('stateChange', (e) => {
    console.log(`⚡ [State] Breaker '${e.breakerName}' changed state: ${e.fromState} -> ${e.toState}`);
  });

  paymentBreaker.on('callSlow', (e) => {
    console.warn(`🐢 [Slow Call] Call took ${e.durationMs}ms (threshold: ${e.thresholdMs}ms)`);
  });

  // Simulated gateway caller
  async function chargeCreditCard(orderId: string, amount: number, simBehavior: string) {
    return paymentBreaker.execute(
      async () => {
        if (simBehavior === '404_NOT_FOUND') {
          throw new HttpGatewayError(404, 'Customer card not found on file');
        }
        if (simBehavior === '503_UNAVAILABLE') {
          throw new HttpGatewayError(503, 'Payment gateway cluster down');
        }
        if (simBehavior === 'LATENCY_SPIKE') {
          await new Promise((r) => setTimeout(r, 400));
          return { orderId, charged: amount, status: 'SUCCESS' };
        }
        return { orderId, charged: amount, status: 'SUCCESS' };
      },
      {
        fallback: (err) => {
          return {
            orderId,
            charged: 0,
            status: 'QUEUED_FOR_OFFLINE_RETRY',
            reason: (err as Error).message,
          };
        },
      }
    );
  }

  // 1. Send client 404 errors (should NOT trip breaker)
  console.log('Sending client errors (404)...');
  await chargeCreditCard('ord-1', 100, '404_NOT_FOUND');
  await chargeCreditCard('ord-2', 200, '404_NOT_FOUND');
  console.log(`Circuit state after 404s: ${paymentBreaker.getState()}`);

  // 2. Send 503 server outages (SHOULD trip breaker)
  console.log('\nSimulating payment processor downtime (503s)...');
  await chargeCreditCard('ord-3', 300, '503_UNAVAILABLE');
  await chargeCreditCard('ord-4', 400, '503_UNAVAILABLE');
  await chargeCreditCard('ord-5', 500, '503_UNAVAILABLE');
  await chargeCreditCard('ord-6', 600, '503_UNAVAILABLE');

  console.log(`Circuit state after 503s: ${paymentBreaker.getState()}`);
  console.log('Final Snapshot:', paymentBreaker.getSnapshot());
}

runHttpExample().catch(console.error);
