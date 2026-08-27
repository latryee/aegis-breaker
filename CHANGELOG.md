# Changelog

All notable changes to **VoltBreaker** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-08-27

### Added
- **Core Engine**: High-throughput resilience engine featuring finite state machine (`CLOSED`, `OPEN`, `HALF_OPEN`, `FORCED_OPEN`, `FORCED_CLOSED`, `DISABLED`).
- **Mathematical Sliding Windows**:
  - `CountSlidingWindow`: Pre-allocated circular ring buffer with $O(1)$ sample eviction.
  - `TimeSlidingWindow`: Leaping bucket ring buffer for sliding temporal windows without background intervals.
- **Dual Trip Thresholds**: Failure rate ($> X\%$) and Slow-Call (P99/P95 latency protection) tripwires.
- **Adaptive Jittered Backoff**: Full Jitter and Decorrelated Jitter algorithms for half-open trial backoffs.
- **Observability**: Real-time snapshot API, typed lifecycle event bus, and OpenMetrics / Prometheus exporter.
- **Ergonomics**: `@Protect` method decorator, `wrap()`, and `executeWithFallback()` higher-order helpers.
- **Zero Runtime Dependencies**: Ultra-lean footprint (sub-microsecond execution overhead).
- **Interactive Visual Terminal Simulator**: `npm run demo` live ANSI dashboard.
