/**
 * @file express.ts
 * @description Express.js middleware adapter for AegisBreaker.
 */

import { CircuitBreaker } from '../core/circuit-breaker.js';
import { CircuitBreakerOpenError, CircuitBreakerTimeoutError } from '../core/errors.js';
import type { CircuitBreakerOptions } from '../core/types.js';

export interface ExpressMiddlewareOptions {
  breaker?: CircuitBreaker;
  breakerOptions?: CircuitBreakerOptions;
  /**
   * Custom response handler when the circuit breaker is OPEN.
   */
  onRejected?: (req: any, res: any, error: CircuitBreakerOpenError) => void;
  /**
   * Set custom response headers indicating circuit state and retry delay.
   * @default true
   */
  includeHeaders?: boolean;
}

/**
 * Creates an Express middleware that protects downstream handlers with AegisBreaker.
 *
 * @example
 * ```ts
 * const app = express();
 * const paymentBreaker = createExpressMiddleware({
 *   breakerOptions: { name: 'payment-gateway', failureRateThreshold: 50 }
 * });
 *
 * app.post('/checkout', paymentBreaker, async (req, res) => {
 *   const charge = await chargeStripe(req.body);
 *   res.json(charge);
 * });
 * ```
 */
export function createExpressMiddleware(options: ExpressMiddlewareOptions = {}) {
  const breaker =
    options.breaker ??
    new CircuitBreaker(
      options.breakerOptions ?? {
        name: 'express-route-breaker',
        failureRateThreshold: 50,
      }
    );

  const includeHeaders = options.includeHeaders ?? true;

  return async function aegisExpressMiddleware(req: any, res: any, next: (err?: any) => void) {
    if (includeHeaders) {
      res.setHeader('X-Circuit-Breaker-State', breaker.getState());
    }

    try {
      // Execute the request inside the circuit breaker boundary
      await breaker.execute(async () => {
        return new Promise<void>((resolve, reject) => {
          // Intercept finish / close events to detect HTTP 5xx errors
          const cleanup = () => {
            res.removeListener('finish', onFinish);
            res.removeListener('close', onClose);
          };

          const onFinish = () => {
            cleanup();
            if (res.statusCode >= 500) {
              reject(new Error(`HTTP ${res.statusCode} internal server error`));
            } else {
              resolve();
            }
          };

          const onClose = () => {
            cleanup();
            if (!res.writableEnded) {
              reject(new Error('HTTP request connection closed prematurely'));
            } else {
              resolve();
            }
          };

          res.once('finish', onFinish);
          res.once('close', onClose);

          // Proceed to route handler
          next();
        });
      });
    } catch (error) {
      if (error instanceof CircuitBreakerOpenError) {
        if (includeHeaders) {
          res.setHeader('Retry-After', Math.ceil(error.retryAfterMs / 1000).toString());
          res.setHeader('X-Circuit-Breaker-State', 'OPEN');
        }

        if (options.onRejected) {
          return options.onRejected(req, res, error);
        }

        if (!res.headersSent) {
          res.status(503).json({
            error: 'Service Unavailable',
            message: `Service is temporarily degraded and fast-failing requests.`,
            retryAfterMs: Math.ceil(error.retryAfterMs),
            state: error.state,
          });
        }
        return;
      }

      if (error instanceof CircuitBreakerTimeoutError) {
        if (!res.headersSent) {
          res.status(504).json({
            error: 'Gateway Timeout',
            message: error.message,
          });
        }
        return;
      }

      // Allow default error middleware to handle unexpected errors if headers not yet sent
      if (!res.headersSent) {
        next(error);
      }
    }
  };
}
