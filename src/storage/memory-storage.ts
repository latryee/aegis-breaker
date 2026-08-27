/**
 * @file memory-storage.ts
 * @description Ultra-fast in-memory state and permit manager.
 */

import type { CircuitBreakerState } from '../core/types.js';
import type { ICircuitBreakerStorage } from './storage.interface.js';

export class MemoryStorage implements ICircuitBreakerStorage {
  private currentState: CircuitBreakerState = 'CLOSED';
  private activeHalfOpenPermits: number = 0;

  public getState(): CircuitBreakerState {
    return this.currentState;
  }

  public setState(state: CircuitBreakerState): void {
    this.currentState = state;
    if (state !== 'HALF_OPEN') {
      this.activeHalfOpenPermits = 0;
    }
  }

  public acquireHalfOpenPermit(maxPermits: number): boolean {
    if (this.activeHalfOpenPermits < maxPermits) {
      this.activeHalfOpenPermits++;
      return true;
    }
    return false;
  }

  public releaseHalfOpenPermit(): void {
    this.activeHalfOpenPermits = Math.max(0, this.activeHalfOpenPermits - 1);
  }

  public getActiveHalfOpenPermits(): number {
    return this.activeHalfOpenPermits;
  }

  public reset(): void {
    this.currentState = 'CLOSED';
    this.activeHalfOpenPermits = 0;
  }
}
