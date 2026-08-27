/**
 * @file fastify.ts
 * @description Fastify plugin / preHandler hook adapter for AegisBreaker.
 */

import { CircuitBreaker } from '../core/circuit-breaker.js';
import { CircuitBreakerOpenError, CircuitBreakerTimeoutError } from '../core/errors.js';
import type { CircuitBreakerOptions } from '../core/types.js';

export interface FastifyPluginOptions {
  breaker?: CircuitBreaker;
  breakerOptions?: CircuitBreakerOptions;
  exposeMetricsRoute?: boolean;
  metricsPath?: string;
}

/**
 * Creates a Fastify preHandler hook for circuit breaking.
 *
 * @example
 * ```ts
 * const fastify = Fastify();
 * const paymentBreaker = createFastifyHook({
 *   breakerOptions: { name: 'fastify-payment', failureRateThreshold: 50 }
 * });
 *
 * fastify.get('/order', { preHandler: paymentBreaker }, async (request, reply) => {
 *   return { status: 'processed' };
 * });
 * ```
 */
export function createFastifyHook(options: FastifyPluginOptions = {}) {
  const breaker =
    options.breaker ??
    new CircuitBreaker(
      options.breakerOptions ?? {
        name: 'fastify-route-breaker',
        failureRateThreshold: 50,
      }
    );

  return async function aegisFastifyPreHandler(_request: any, reply: any) {
    reply.header('x-circuit-breaker-state', breaker.getState());

    const state = breaker.getState();
    if (state === 'OPEN' || state === 'FORCED_OPEN') {
      const snapshot = breaker.getSnapshot();
      const retryAfterMs = snapshot.nextPermittedProbeTimestamp
        ? Math.max(0, snapshot.nextPermittedProbeTimestamp - Date.now())
        : 60000;

      reply.header('retry-after', Math.ceil(retryAfterMs / 1000).toString());
      reply.status(503).send({
        error: 'Service Unavailable',
        message: `Circuit breaker '${breaker.name}' is ${state}. Fast-failing incoming request.`,
        retryAfterMs,
        state,
      });
    }
  };
}
