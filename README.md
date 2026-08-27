# 🛡️ AegisBreaker

> **High-throughput, zero-dependency, mathematical sliding-window Circuit Breaker and Fault Tolerance engine for modern TypeScript & JavaScript runtimes.**

[![CI](https://github.com/latryee/aegis-breaker/actions/workflows/ci.yml/badge.svg)](https://github.com/latryee/aegis-breaker/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7+-3178C6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-success.svg)](https://www.npmjs.com/package/aegis-breaker)
[![Throughput](https://img.shields.io/badge/throughput-2.7M%2B%20ops%2Fsec-brightgreen.svg)](#benchmarks)

---

## 🌟 Why AegisBreaker?

Most Node.js / JavaScript circuit breaker libraries are either abandoned, bloated with heavy dependency trees, or rely on naive in-memory counters that fail to account for continuous time windows, slow-call latency degradation, or thundering herds upon recovery.

**AegisBreaker** is built with senior systems-engineering rigor:
- **Zero Runtime Dependencies**: Ultra-lean, zero attack surface, sub-microsecond invocation overhead (~400ns).
- **Leaping-Bucket Sliding Windows**: Pre-allocated circular ring buffers and time-sliced epoch buckets operating in $O(1)$ constant time with bounded $O(1)$ memory.
- **Dual Trip Thresholds**: Trips on both **Failure Rate** ($> X\%$) and **Slow-Call (P99 Latency)** degradation ($> Y\%$).
- **Adaptive Jittered Probes**: Bounded trial permit pool in `HALF_OPEN` with Exponential Backoff + Full / Decorrelated Jitter to prevent downstream cascades.
- **Full Observability**: Real-time snapshot metrics, typed lifecycle event bus, and native **Prometheus / OpenMetrics** exposition format.
- **Universal Runtime**: Seamlessly runs on Node.js ($\ge 18$), Bun, Deno, Cloudflare Workers, and modern browsers. Dual ESM + CommonJS builds with strict `.d.ts` declaration maps.

---

## 📐 Architecture & State Machine

```
               ┌──────────────────────────────┐
               │           CLOSED             │ ◄──────────────┐
               │   (Normal healthy flow)      │                │
               └──────────────┬───────────────┘                │
                              │                                │
                 Failure Rate │ Slow Call                      │ Probe Quorum
                 Threshold    │ Threshold                      │ Succeeded
                 Exceeded     │ Exceeded                       │
                              ▼                                │
               ┌──────────────────────────────┐                │
               │            OPEN              │                │
               │   (Fast-fail in 0ms)         │                │
               └──────────────┬───────────────┘                │
                              │                                │
                 Wait Duration│ Jittered                       │
                 Expired      │ Backoff                        │
                              ▼                                │
               ┌──────────────────────────────┐                │
               │          HALF_OPEN           │ ───────────────┘
               │  (Bounded trial probe pool)  │   Probe Failed
               └──────────────────────────────┘ ───────────────► (Trip back to OPEN)
```

---

## 📦 Installation

```bash
npm install aegis-breaker
# or
pnpm add aegis-breaker
# or
yarn add aegis-breaker
# or
bun add aegis-breaker
```

---

## 🚀 Quick Start

### 1. Functional Execution

```ts
import { CircuitBreaker } from 'aegis-breaker';

const breaker = new CircuitBreaker({
  name: 'payment-gateway',
  failureRateThreshold: 50,          // Trip if >= 50% calls fail
  minimumNumberOfCalls: 10,          // Warm-up sample size
  waitDurationInOpenStateMs: 10000,  // Wait 10s before testing recovery
  backoffOptions: {
    initialIntervalMs: 5000,
    multiplier: 2,
    jitter: 'FULL',                  // Prevent thundering herd
  },
});

// Execute protected async action
const result = await breaker.execute(
  async (signal) => {
    const response = await fetch('https://api.stripe.com/v1/charges', { signal });
    return response.json();
  },
  {
    timeoutMs: 3000, // Per-execution timeout
    fallback: (err) => {
      console.warn('Payment gateway unavailable, queuing offline:', err);
      return { status: 'QUEUED_FOR_RETRY' };
    },
  }
);
```

### 2. Method Decorator (`@Protect`)

```ts
import { Protect } from 'aegis-breaker';

class OrderService {
  @Protect({
    name: 'inventory-service',
    failureRateThreshold: 40,
    slowCallDurationThresholdMs: 500, // Flag calls > 500ms
    slowCallRateThreshold: 30,        // Trip if > 30% are slow
  })
  async reserveInventory(itemId: string, count: number) {
    return await api.post(`/inventory/${itemId}/reserve`, { count });
  }
}
```

### 3. Function Wrapper

```ts
import { withCircuitBreaker, CircuitBreaker } from 'aegis-breaker';

const breaker = new CircuitBreaker({ name: 'user-service' });

const getUser = withCircuitBreaker(breaker, async (userId: string) => {
  return await db.users.findById(userId);
});

const user = await getUser('user-123');
```

---

## 📊 Live Interactive Dashboard Simulation

AegisBreaker includes a terminal traffic simulator showcasing dynamic fault injection, circuit trips, fast-fail rejection, backoff cooldown, and automatic self-healing.

```bash
npm run demo
```

```
╔═══════════════════════════════════════════════════════════════════╗
║             🛡️ AEGISBREAKER RESILIENCE ENGINE DEMO 🛡️             ║
║   Mathematical Sliding-Window & Adaptive Circuit Breaking Demo   ║
╚═══════════════════════════════════════════════════════════════════╝

▶ PHASE 1: Healthy Steady State (0% error rate, low latency)
  [Call #1] ✔ SUCCESS | State:  CLOSED 🟢 
  [Call #2] ✔ SUCCESS | State:  CLOSED 🟢 

▶ PHASE 2: Upstream Outage Injected (100% error rate)
  [Call #6] ⛑ FALLBACK ACTIVATED: Stored in durable fallback cache (Error)
  ➔ [STATE CHANGE]  CLOSED 🟢  ➔  OPEN 🔴   (Reason: FAILURE_RATE_EXCEEDED)

▶ PHASE 3: Circuit is OPEN (Shedding upstream load instantly with 0ms latency)
  ⛔ [FAST FAIL] Fast-rejected in 0ms to protect system. Retry probe in 1892ms

▶ PHASE 4: Cooldown period running... Upstream service self-healing
  Waiting for waitDurationInOpenStateMs (2.1s)...

▶ PHASE 5: Trial Probes in HALF_OPEN State
  ➔ [STATE CHANGE]  OPEN 🔴  ➔  HALF-OPEN 🟡   (Reason: WAIT_DURATION_EXPIRED)
  [Probe #13] ✔ PROBE SUCCESS | Current State:  HALF-OPEN 🟡 
  ➔ [STATE CHANGE]  HALF-OPEN 🟡  ➔  CLOSED 🟢   (Reason: HALF_OPEN_PROBE_SUCCEEDED)

═══════════════════════════════════════════════════════════════════
📊 FINAL TELEMETRY SNAPSHOT:
  Current State      :  CLOSED 🟢 
  Total Active Calls : 1
  Successful Calls   : 1
  Failed Calls       : 0
  Fast-Fail Rejects  : 2
  Failure Rate       : [░░░░░░░░░░░░░░░] 0.0%
═══════════════════════════════════════════════════════════════════
```

---

## 📈 Benchmarks

Microbenchmarks measured on Intel Core / AMD Ryzen (Node.js 24, V8 Engine):

| Benchmark Scenario | Throughput (ops/sec) | Latency (avg) | Memory Overhead |
| :--- | :---: | :---: | :---: |
| **Baseline Raw Async Function** | **9.50M** ops/s | 112 ns | 0 B |
| **AegisBreaker `.execute()` (CLOSED State)** | **2.78M** ops/s | 415 ns | $O(1)$ bounded |
| **CountSlidingWindow `recordSuccess()`** | **19.36M** ops/s | 39 ns | 0 allocations |
| **TimeSlidingWindow `recordSuccess()`** | **10.10M** ops/s | 88 ns | 0 allocations |

---

## 🔍 Feature Comparison

| Feature | **AegisBreaker** | Opossum | Cockatiel | Resilience4j (Java) |
| :--- | :---: | :---: | :---: | :---: |
| **Zero External Runtime Dependencies** | ✅ Yes | ❌ (events, etc.) | ❌ | ✅ Yes |
| **Count-Based Sliding Window** | ✅ $O(1)$ RingBuffer | ❌ | ❌ | ✅ |
| **Time-Based Leaping Bucket Window** | ✅ $O(1)$ Buckets | ⚠️ Rolling Window | ⚠️ Counter | ✅ |
| **Slow Call / Latency Degradation Tripping** | ✅ Yes | ❌ | ❌ | ✅ |
| **Adaptive Jittered Backoff (Full & Decorrelated)** | ✅ Yes | ❌ Fixed | ⚠️ Basic Exponential | ⚠️ |
| **Half-Open Permit Quorum Pool** | ✅ Bounded | ⚠️ Single Request | ⚠️ Basic | ✅ Bounded |
| **Prometheus / OpenMetrics Exporter** | ✅ Native built-in | ❌ External Plugin | ❌ | ✅ Micrometer |
| **Sub-Microsecond Execution Overhead** | ✅ ~400ns | ❌ ~5-15µs | ❌ ~2-5µs | ✅ |

---

## 🛠 Advanced Usage

### 1. HTTP Status Code Filtering

In microservices, client errors (`400 Bad Request`, `404 Not Found`, `422 Unprocessable Entity`) should NOT trip the circuit breaker. Only infrastructure outages (`500`, `502`, `503`, `504`) or connection timeouts should.

```ts
const breaker = new CircuitBreaker({
  name: 'catalog-service',
  minimumNumberOfCalls: 20,
  failureRateThreshold: 50,
  // Ignore 4xx client errors
  ignoreException: (err: any) => err.statusCode >= 400 && err.statusCode < 500,
  // Trip on 5xx server faults
  recordException: (err: any) => err.statusCode >= 500,
  // Trip on HTTP response objects with error status codes
  recordResult: (res: any) => res?.status >= 500,
});
```

### 2. Prometheus / OpenMetrics Scraping

```ts
import { CircuitBreaker } from 'aegis-breaker';

const breaker = new CircuitBreaker({ name: 'billing_service' });

// Express / Fastify / Next.js metric endpoint handler
app.get('/metrics', (req, res) => {
  res.setHeader('Content-Type', 'text/plain; version=0.0.4');
  res.send(breaker.toPrometheusMetrics({
    labels: { cluster: 'us-east-1', environment: 'production' },
  }));
});
```

Sample Prometheus metrics output:
```promql
# HELP circuit_breaker_state Current state of the circuit breaker (0=CLOSED, 1=HALF_OPEN, 2=OPEN, 3=FORCED_OPEN, 4=FORCED_CLOSED, 5=DISABLED)
# TYPE circuit_breaker_state gauge
circuit_breaker_state{name="billing_service",cluster="us-east-1",environment="production",state="CLOSED"} 0

# HELP circuit_breaker_failure_rate_percent Current rolling failure rate percentage
# TYPE circuit_breaker_failure_rate_percent gauge
circuit_breaker_failure_rate_percent{name="billing_service",cluster="us-east-1",environment="production"} 0.0

# HELP circuit_breaker_calls_total Total number of calls recorded
# TYPE circuit_breaker_calls_total counter
circuit_breaker_calls_total{name="billing_service",cluster="us-east-1",environment="production",result="success"} 1420
circuit_breaker_calls_total{name="billing_service",cluster="us-east-1",environment="production",result="failure"} 3
circuit_breaker_calls_total{name="billing_service",cluster="us-east-1",environment="production",result="rejected"} 0

# HELP circuit_breaker_latency_ms Latency percentiles estimated by reservoir sampling
# TYPE circuit_breaker_latency_ms gauge
circuit_breaker_latency_ms{name="billing_service",cluster="us-east-1",environment="production",quantile="0.50"} 12
circuit_breaker_latency_ms{name="billing_service",cluster="us-east-1",environment="production",quantile="0.99"} 45
circuit_breaker_latency_ms{name="billing_service",cluster="us-east-1",environment="production",quantile="mean"} 14.2
```

---

## ⚙️ Configuration Reference

| Option | Type | Default | Description |
| :--- | :--- | :---: | :--- |
| `name` | `string` | `'default-breaker'` | Unique identifier name for telemetry. |
| `slidingWindowType` | `'COUNT_BASED' \| 'TIME_BASED'` | `'COUNT_BASED'` | Type of sliding statistical window. |
| `slidingWindowSize` | `number` | `100` | Sample size for `COUNT_BASED` or duration in ms for `TIME_BASED`. |
| `slidingWindowBuckets` | `number` | `10` | Number of epoch slices for `TIME_BASED` window. |
| `minimumNumberOfCalls` | `number` | `20` | Minimum recorded calls before computing failure rates (cold start protection). |
| `failureRateThreshold` | `number` | `50` | Percentage threshold ($1-100$) of failed calls to trip to `OPEN`. |
| `slowCallRateThreshold` | `number` | `100` | Percentage threshold ($1-100$) of slow calls to trip to `OPEN`. |
| `slowCallDurationThresholdMs` | `number` | `60000` | Latency threshold in ms above which a call is marked slow. |
| `permittedNumberOfCallsInHalfOpenState` | `number` | `10` | Trial permit capacity in `HALF_OPEN` probe state. |
| `waitDurationInOpenStateMs` | `number` | `60000` | Base duration in ms before attempting trial recovery. |
| `backoffOptions` | `BackoffOptions` | `undefined` | Exponential backoff config (`initialIntervalMs`, `multiplier`, `maxIntervalMs`, `jitter`). |
| `defaultTimeoutMs` | `number` | `undefined` | Default execution timeout in milliseconds. |
| `ignoreException` | `(err) => boolean` | `() => false` | Errors that bypass failure counting (e.g. 4xx). |
| `recordException` | `(err) => boolean` | `() => true` | Errors that increment failure counters. |
| `recordResult` | `(res) => boolean` | `() => false` | Result evaluation predicate for error mapping. |

---

## 🧪 Testing

```bash
# Run unit & concurrency test suites
npm run test

# Run tests with coverage
npm run test:coverage

# Run strict TypeScript typechecking
npm run typecheck
```

---

## 📄 License

MIT © [latryee](LICENSE)
