import { Bench } from 'tinybench';
import { CircuitBreaker } from '../src/core/circuit-breaker.js';
import { CountSlidingWindow } from '../src/window/count-sliding-window.js';
import { TimeSlidingWindow } from '../src/window/time-sliding-window.js';

async function runBenchmarks() {
  console.log('⚡ Running VoltBreaker High-Throughput Benchmarks...\n');

  const bench = new Bench({ time: 1000 });

  const rawFn = async (x: number) => x * 2;

  const breakerClosed = new CircuitBreaker({
    name: 'bench-closed',
    slidingWindowSize: 1000,
    minimumNumberOfCalls: 500,
  });

  const breakerOpen = new CircuitBreaker({
    name: 'bench-open',
  });
  breakerOpen.forceOpen();

  const countWindow = new CountSlidingWindow(100);
  const timeWindow = new TimeSlidingWindow(60000, 10);

  bench
    .add('Baseline Raw Async Function', async () => {
      await rawFn(21);
    })
    .add('VoltBreaker execute() (CLOSED state - Full Window + Telemetry)', async () => {
      await breakerClosed.execute(() => rawFn(21));
    })
    .add('VoltBreaker execute() (OPEN state - Fast Fail Rejection)', async () => {
      try {
        await breakerOpen.execute(() => rawFn(21));
      } catch {
        // expected fast fail
      }
    })
    .add('CountSlidingWindow recordSuccess() [O(1) Ring Buffer]', () => {
      countWindow.recordSuccess(5);
    })
    .add('TimeSlidingWindow recordSuccess() [O(1) Leaping Bucket]', () => {
      timeWindow.recordSuccess(5);
    });

  await bench.run();

  console.table(bench.table());
}

runBenchmarks().catch(console.error);
