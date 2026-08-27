/**
 * @file decorators.ts
 * @description Method decorators for class-based enterprise architectures (NestJS, Express controllers, etc.).
 */

import { CircuitBreaker } from '../core/circuit-breaker.js';
import type { CircuitBreakerOptions, ExecutionOptions } from '../core/types.js';

/**
 * Method decorator that wraps a class method execution with a Circuit Breaker.
 * Can take either an existing CircuitBreaker instance or CircuitBreakerOptions to create one.
 *
 * @example
 * ```ts
 * class PaymentGatewayService {
 *   @Protect({ failureRateThreshold: 40, waitDurationInOpenStateMs: 15000 })
 *   async chargeCard(amount: number): Promise<ChargeResult> {
 *     // ...
 *   }
 * }
 * ```
 */
export function Protect(
  breakerOrOptions: CircuitBreaker | CircuitBreakerOptions,
  executionOptions?: ExecutionOptions
) {
  const breaker =
    breakerOrOptions instanceof CircuitBreaker
      ? breakerOrOptions
      : new CircuitBreaker(breakerOrOptions);

  return function (
    _target: any,
    propertyKey: string | symbol,
    descriptor: TypedPropertyDescriptor<(...args: any[]) => Promise<any>>
  ): TypedPropertyDescriptor<(...args: any[]) => Promise<any>> {
    const originalMethod = descriptor.value;
    if (!originalMethod) {
      return descriptor;
    }

    descriptor.value = async function (...args: any[]): Promise<any> {
      return breaker.execute(() => originalMethod.apply(this, args), {
        ...executionOptions,
        context: {
          method: String(propertyKey),
          ...executionOptions?.context,
        },
      });
    };

    return descriptor;
  };
}
