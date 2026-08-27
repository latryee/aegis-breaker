/**
 * @file fastify-plugin.ts
 * @description Fastify preHandler route hook integration example for AegisBreaker.
 */

import { CircuitBreaker, createFastifyHook } from '../src/index.js';

async function runFastifyDemo() {
  console.log('=== Fastify + AegisBreaker High-Performance Resilience Plugin ===\n');

  const userBreaker = new CircuitBreaker({
    name: 'fastify-users-service',
    failureRateThreshold: 50,
    minimumNumberOfCalls: 3,
  });

  const hook = createFastifyHook({ breaker: userBreaker });

  // Simulate Fastify request processing
  async function simulateFastifyRoute(userId: string) {
    const headers: Record<string, string> = {};
    let responseStatus = 200;
    let responsePayload: any = null;

    const reply = {
      header: (k: string, v: string) => {
        headers[k] = v;
      },
      status: (code: number) => {
        responseStatus = code;
        return reply;
      },
      send: (data: any) => {
        responsePayload = data;
        return reply;
      },
    };

    // Fastify preHandler hook
    await hook({}, reply);

    if (responseStatus === 503) {
      return { status: 503, body: responsePayload, headers };
    }

    // Actual route logic executed through breaker
    return await userBreaker.execute(
      async () => {
        return { status: 200, body: { userId, name: `User ${userId}`, tier: 'pro' }, headers };
      },
      {
        fallback: (err) => ({
          status: 200,
          body: { userId, name: 'Offline User', cached: true, reason: (err as Error).message },
          headers,
        }),
      }
    );
  }

  console.log('Sending request #1:');
  const res1 = await simulateFastifyRoute('usr-101');
  console.log('Response:', res1);

  console.log('\nTripping circuit to OPEN for testing...');
  userBreaker.forceOpen();

  console.log('\nSending request #2 while OPEN:');
  const res2 = await simulateFastifyRoute('usr-102');
  console.log('Response:', res2);
}

runFastifyDemo().catch(console.error);
