import { describe, expect, it } from 'vitest';
import { CircuitBreaker } from '../src/core/circuit-breaker.js';
import { Protect } from '../src/wrappers/decorators.js';
import { executeWithFallback, withCircuitBreaker } from '../src/wrappers/functional.js';

describe('Functional Wrappers & Decorators', () => {
  it('withCircuitBreaker should wrap functions and preserve arguments and return values', async () => {
    const breaker = new CircuitBreaker();
    const add = withCircuitBreaker(breaker, async (a: number, b: number) => a + b);

    const sum = await add(15, 27);
    expect(sum).toBe(42);
  });

  it('executeWithFallback should catch error and invoke fallback', async () => {
    const breaker = new CircuitBreaker();
    const result = await executeWithFallback(
      breaker,
      async () => {
        throw new Error('Database unreachable');
      },
      (err) => `cached-fallback-${(err as Error).message}`
    );

    expect(result).toBe('cached-fallback-Database unreachable');
  });

  it('@Protect decorator should guard class methods', async () => {
    class PaymentGateway {
      @Protect({
        name: 'payment-method-breaker',
        minimumNumberOfCalls: 2,
        failureRateThreshold: 50,
      })
      async processPayment(amount: number): Promise<string> {
        if (amount <= 0) {
          throw new Error('Invalid amount');
        }
        return `charged $${amount}`;
      }
    }

    const gateway = new PaymentGateway();
    const success = await gateway.processPayment(100);
    expect(success).toBe('charged $100');

    await expect(gateway.processPayment(-10)).rejects.toThrow('Invalid amount');
  });
});
