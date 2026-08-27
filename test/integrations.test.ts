import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { CircuitBreaker } from '../src/core/circuit-breaker.js';
import { createExpressMiddleware } from '../src/integrations/express.js';
import { createFastifyHook } from '../src/integrations/fastify.js';

describe('Framework Integrations', () => {
  describe('Express Middleware', () => {
    it('should set state header and allow execution in CLOSED state', async () => {
      const breaker = new CircuitBreaker({ name: 'express-test' });
      const middleware = createExpressMiddleware({ breaker });

      const headers: Record<string, string> = {};
      const emitter = new EventEmitter();
      const req = {};
      const res = Object.assign(emitter, {
        setHeader: (k: string, v: string) => {
          headers[k] = v;
        },
        statusCode: 200,
        writableEnded: true,
      });

      let nextCalled = false;
      const middlewarePromise = middleware(req, res, () => {
        nextCalled = true;
        res.emit('finish');
      });

      await middlewarePromise;

      expect(nextCalled).toBe(true);
      expect(headers['X-Circuit-Breaker-State']).toBe('CLOSED');
    });

    it('should fast-fail with 503 when breaker is OPEN', async () => {
      const breaker = new CircuitBreaker({ name: 'express-open-test' });
      breaker.forceOpen();

      const middleware = createExpressMiddleware({ breaker });

      const headers: Record<string, string> = {};
      let jsonPayload: any = null;
      let statusCode = 200;

      const emitter = new EventEmitter();
      const req = {};
      const res = Object.assign(emitter, {
        setHeader: (k: string, v: string) => {
          headers[k] = v;
        },
        status: (code: number) => {
          statusCode = code;
          return res;
        },
        json: (data: any) => {
          jsonPayload = data;
        },
        headersSent: false,
      });

      let nextCalled = false;
      await middleware(req, res, () => {
        nextCalled = true;
      });

      expect(nextCalled).toBe(false);
      expect(statusCode).toBe(503);
      expect(jsonPayload.error).toBe('Service Unavailable');
      expect(headers['Retry-After']).toBeDefined();
    });
  });

  describe('Fastify Hook', () => {
    it('should allow request when CLOSED', async () => {
      const breaker = new CircuitBreaker({ name: 'fastify-test' });
      const hook = createFastifyHook({ breaker });

      const headers: Record<string, string> = {};
      const reply = {
        header: (k: string, v: string) => {
          headers[k] = v;
        },
        status: () => reply,
        send: () => reply,
      };

      await hook({}, reply);
      expect(headers['x-circuit-breaker-state']).toBe('CLOSED');
    });

    it('should reject with 503 when OPEN', async () => {
      const breaker = new CircuitBreaker({ name: 'fastify-open' });
      breaker.forceOpen();
      const hook = createFastifyHook({ breaker });

      const headers: Record<string, string> = {};
      let status = 200;
      let sentData: any = null;

      const reply = {
        header: (k: string, v: string) => {
          headers[k] = v;
        },
        status: (s: number) => {
          status = s;
          return reply;
        },
        send: (data: any) => {
          sentData = data;
          return reply;
        },
      };

      await hook({}, reply);
      expect(status).toBe(503);
      expect(sentData.error).toBe('Service Unavailable');
      expect(headers['retry-after']).toBeDefined();
    });
  });
});
