/**
 * @file live-demo.ts
 * @description Interactive visual terminal simulation of VoltBreaker in action.
 */

import { CircuitBreaker } from '../src/index.js';

// ANSI escape codes for clean terminal UI
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function renderStateBadge(state: string): string {
  switch (state) {
    case 'CLOSED':
      return `${c.bgGreen}${c.white}${c.bold} CLOSED 🟢 ${c.reset}`;
    case 'OPEN':
      return `${c.bgRed}${c.white}${c.bold} OPEN 🔴 ${c.reset}`;
    case 'HALF_OPEN':
      return `${c.bgYellow}${c.white}${c.bold} HALF-OPEN 🟡 ${c.reset}`;
    default:
      return `${c.bold} ${state} ${c.reset}`;
  }
}

function renderProgressBar(percentage: number, length: number = 20, color: string = c.cyan): string {
  const filled = Math.min(length, Math.max(0, Math.round((percentage / 100) * length)));
  const empty = length - filled;
  return `${color}[${'█'.repeat(filled)}${'░'.repeat(empty)}] ${percentage.toFixed(1)}%${c.reset}`;
}

async function runLiveSimulation() {
  console.clear();
  console.log(`${c.bold}${c.cyan}╔═══════════════════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.bold}${c.cyan}║             ⚡ VOLTBREAKER RESILIENCE ENGINE DEMO ⚡             ║${c.reset}`);
  console.log(`${c.bold}${c.cyan}║   Mathematical Sliding-Window & Adaptive Circuit Breaking Demo   ║${c.reset}`);
  console.log(`${c.bold}${c.cyan}╚═══════════════════════════════════════════════════════════════════╝${c.reset}\n`);

  const breaker = new CircuitBreaker({
    name: 'order-processing-engine',
    slidingWindowType: 'COUNT_BASED',
    slidingWindowSize: 10,
    minimumNumberOfCalls: 4,
    failureRateThreshold: 50,
    slowCallRateThreshold: 50,
    slowCallDurationThresholdMs: 150,
    permittedNumberOfCallsInHalfOpenState: 3,
    waitDurationInOpenStateMs: 2000,
  });

  breaker.on('stateChange', (event) => {
    console.log(
      `\n  ${c.bold}${c.magenta}➔ [STATE CHANGE]${c.reset} ${renderStateBadge(
        event.fromState
      )} ➔ ${renderStateBadge(event.toState)}  ${c.dim}(Reason: ${event.reason})${c.reset}\n`
    );
  });

  breaker.on('callSlow', (event) => {
    console.log(
      `  ${c.yellow}🐢 [LATENCY SPIKE] Execution took ${event.durationMs}ms (Threshold: ${event.thresholdMs}ms)${c.reset}`
    );
  });

  breaker.on('callRejected', (event) => {
    console.log(
      `  ${c.red}⛔ [FAST FAIL] Fast-rejected in 0ms to protect system. Retry probe in ${Math.ceil(
        event.retryAfterMs
      )}ms${c.reset}`
    );
  });

  let simulatedFailureRate = 0;
  let simulatedLatencyMs = 10;

  async function mockOrderService(id: number) {
    await sleep(simulatedLatencyMs);
    if (Math.random() < simulatedFailureRate) {
      throw new Error(`Upstream cluster connection timed out on order #${id}`);
    }
    return { orderId: id, status: 'PROCESSED' };
  }

  // Phase 1: Healthy Steady State
  console.log(`${c.bold}${c.green}▶ PHASE 1: Healthy Steady State (0% error rate, low latency)${c.reset}`);
  for (let i = 1; i <= 5; i++) {
    try {
      await breaker.execute(() => mockOrderService(i));
      console.log(`  [Call #${i}] ${c.green}✔ SUCCESS${c.reset} | State: ${renderStateBadge(breaker.getState())}`);
    } catch (err: any) {
      console.log(`  [Call #${i}] ${c.red}✖ ERROR: ${err.message}${c.reset}`);
    }
    await sleep(100);
  }

  // Phase 2: Injecting Faults
  console.log(`\n${c.bold}${c.yellow}▶ PHASE 2: Upstream Outage Injected (100% error rate)${c.reset}`);
  simulatedFailureRate = 1.0;

  for (let i = 6; i <= 9; i++) {
    try {
      await breaker.execute(() => mockOrderService(i), {
        fallback: (err) => {
          console.log(`  [Call #${i}] ${c.yellow}⛑ FALLBACK ACTIVATED: Stored in durable fallback cache${c.reset} (${(err as Error).name})`);
          return { orderId: i, status: 'QUEUED_OFFLINE' };
        },
      });
    } catch (err: any) {
      console.log(`  [Call #${i}] ${c.red}✖ REJECTED: ${err.message}${c.reset}`);
    }
    await sleep(100);
  }

  // Phase 3: Fast-Failing while OPEN
  console.log(`\n${c.bold}${c.red}▶ PHASE 3: Circuit is OPEN (Shedding upstream load instantly with 0ms latency)${c.reset}`);
  for (let i = 10; i <= 12; i++) {
    try {
      await breaker.execute(() => mockOrderService(i), {
        fallback: () => ({ orderId: i, status: 'CACHED' }),
      });
    } catch (err: any) {
      console.log(`  [Call #${i}] ${c.red}✖ REJECTED: ${err.message}${c.reset}`);
    }
    await sleep(100);
  }

  // Phase 4: Cooldown & Recovery
  console.log(`\n${c.bold}${c.cyan}▶ PHASE 4: Cooldown period running... Upstream service self-healing${c.reset}`);
  console.log(`  ${c.dim}Fixing upstream database replica...${c.reset}`);
  simulatedFailureRate = 0.0;
  simulatedLatencyMs = 12;

  console.log(`  ${c.dim}Waiting for waitDurationInOpenStateMs (2.1s)...${c.reset}`);
  await sleep(2100);

  // Phase 5: Trial Probes in HALF_OPEN & Self-Healing
  console.log(`\n${c.bold}${c.green}▶ PHASE 5: Trial Probes in HALF_OPEN State${c.reset}`);
  for (let i = 13; i <= 16; i++) {
    try {
      await breaker.execute(() => mockOrderService(i));
      console.log(`  [Probe #${i}] ${c.green}✔ PROBE SUCCESS${c.reset} | Current State: ${renderStateBadge(breaker.getState())}`);
    } catch (err: any) {
      console.log(`  [Probe #${i}] ${c.red}✖ PROBE FAILED: ${err.message}${c.reset}`);
    }
    await sleep(150);
  }

  // Print final dashboard
  const snapshot = breaker.getSnapshot();
  console.log(`\n${c.bold}${c.cyan}═══════════════════════════════════════════════════════════════════${c.reset}`);
  console.log(`${c.bold}📊 FINAL TELEMETRY SNAPSHOT:${c.reset}`);
  console.log(`  Current State      : ${renderStateBadge(snapshot.state)}`);
  console.log(`  Total Active Calls : ${c.bold}${snapshot.totalCalls}${c.reset}`);
  console.log(`  Successful Calls   : ${c.green}${snapshot.successfulCalls}${c.reset}`);
  console.log(`  Failed Calls       : ${c.red}${snapshot.failedCalls}${c.reset}`);
  console.log(`  Fast-Fail Rejects  : ${c.yellow}${snapshot.notPermittedCalls}${c.reset}`);
  console.log(`  Failure Rate       : ${renderProgressBar(snapshot.failureRate, 15, c.green)}`);
  console.log(`  Open Cycles        : ${c.bold}${snapshot.openCycleCount}${c.reset}`);
  console.log(`${c.bold}${c.cyan}═══════════════════════════════════════════════════════════════════${c.reset}\n`);
}

runLiveSimulation().catch(console.error);
