/**
 * @file event-emitter.ts
 * @description Zero-dependency, memory-safe, strongly-typed event emitter.
 */

import type { BreakerEventMap } from '../core/types.js';

type Listener<T> = (data: T) => void;

export class TypedEventEmitter {
  private readonly listeners = new Map<keyof BreakerEventMap, Set<Listener<any>>>();

  public on<E extends keyof BreakerEventMap>(
    event: E,
    listener: Listener<BreakerEventMap[E]>
  ): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener);

    // Return unregister callback for convenient cleanup
    return () => this.off(event, listener);
  }

  public once<E extends keyof BreakerEventMap>(
    event: E,
    listener: Listener<BreakerEventMap[E]>
  ): () => void {
    const wrapped: Listener<BreakerEventMap[E]> = (data) => {
      this.off(event, wrapped);
      listener(data);
    };
    return this.on(event, wrapped);
  }

  public off<E extends keyof BreakerEventMap>(
    event: E,
    listener: Listener<BreakerEventMap[E]>
  ): void {
    const set = this.listeners.get(event);
    if (set) {
      set.delete(listener);
      if (set.size === 0) {
        this.listeners.delete(event);
      }
    }
  }

  public emit<E extends keyof BreakerEventMap>(event: E, data: BreakerEventMap[E]): void {
    const set = this.listeners.get(event);
    if (set) {
      for (const listener of set) {
        try {
          listener(data);
        } catch (error) {
          // Prevent user listener errors from crashing circuit breaker execution
          console.error(
            `[VoltBreaker] Uncaught exception in event listener for '${String(event)}':`,
            error
          );
        }
      }
    }
  }

  public listenerCount<E extends keyof BreakerEventMap>(event: E): number {
    return this.listeners.get(event)?.size ?? 0;
  }

  public removeAllListeners(): void {
    this.listeners.clear();
  }
}
