/**
 * @file express-middleware.ts
 * @description Real-world production Express.js service protected by AegisBreaker.
 */

import { CircuitBreaker, createExpressMiddleware } from '../src/index.js';

// Mock Express-like app for standalone demonstration without external npm packages
function createMockServer() {
  const breaker = new CircuitBreaker({
    name: 'stripe-checkout-api',
    failureRateThreshold: 50,
    minimumNumberOfCalls: 3,
    slowCallDurationThresholdMs: 200,
    waitDurationInOpenStateMs: 3000,
  });

  const middleware = createExpressMiddleware({
    breaker,
    includeHeaders: true,
  });

  console.log('🚀 [Express Server Mock] Started with AegisBreaker route guard\n');

  async function handleRequest(requestId: number, simulateError: boolean) {
    const headers: Record<string, string> = {};
    let responseStatus = 200;
    let responseBody: any = null;

    const req = { id: requestId, path: '/api/v1/checkout' };
    const res = {
      setHeader: (k: string, v: string) => {
        headers[k] = v;
      },
      status: (s: number) => {
        responseStatus = s;
        return res;
      },
      json: (b: any) => {
        responseBody = b;
        return res;
      },
      writableEnded: false,
      statusCode: 200,
      once: (event: string, cb: () => void) => {
        // mock event dispatcher
      },
      removeListener: () => {},
    };

    // Middleware interception
    await middleware(req, res, async () => {
      if (simulateError) {
        res.statusCode = 503;
        throw new Error('503 Service Unavailable: Stripe gateway down');
      }
      res.statusCode = 200;
      res.json({ status: 'CHARGED', amount: 99.99, orderId: `ord-${requestId}` });
    });

    return { status: res.statusCode || responseStatus, body: responseBody, headers };
  }

  return { breaker, handleRequest };
}

async function runExpressDemo() {
  const server = createMockServer();

  console.log('--- Step 1: Normal healthy traffic ---');
  for (let i = 1; i <= 2; i++) {
    const res = await server.handleRequest(i, false);
    console.log(`[Req #${i}] HTTP ${res.status}:`, res.body);
  }

  console.log('\n--- Step 2: Outage starts (503s) ---');
  for (let i = 3; i <= 6; i++) {
    try {
      const res = await server.handleRequest(i, true);
      console.log(`[Req #${i}] HTTP ${res.status}:`, res.body, `State Header: ${res.headers['X-Circuit-Breaker-State']}`);
    } catch (e: any) {
      console.log(`[Req #${i}] Handled error: ${e.message}`);
    }
  }

  console.log('\n--- Step 3: Fast-fail while OPEN (Immediate 503 with Retry-After header) ---');
  const openRes = await server.handleRequest(7, false);
  console.log(`[Req #7] HTTP ${openRes.status}:`, openRes.body, `Headers:`, openRes.headers);

  console.log('\n--- Step 4: Prometheus scraping endpoint output ---');
  console.log(server.breaker.toPrometheusMetrics({ labels: { route: '/api/v1/checkout' } }));
}

runExpressDemo().catch(console.error);
