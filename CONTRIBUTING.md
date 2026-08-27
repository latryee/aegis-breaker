# Contributing to VoltBreaker

We welcome contributions to VoltBreaker! Whether submitting bug reports, proposing enhancements, or creating pull requests, please follow these guidelines.

## Development Workflow

1. **Clone & Install Dependencies**:
   ```bash
   git clone https://github.com/yourusername/voltbreaker.git
   cd voltbreaker
   npm install
   ```

2. **Run Tests**:
   ```bash
   npm run test
   ```

3. **Run Typecheck & Build**:
   ```bash
   npm run typecheck
   npm run build
   ```

4. **Run Performance Benchmarks**:
   ```bash
   npm run bench
   ```

5. **Run the Interactive Demo**:
   ```bash
   npm run demo
   ```

## Architecture Principles

- **Zero Runtime Dependencies**: Core packages MUST have zero external production dependencies.
- **Constant Time & Memory**: Data structures used in call paths must operate in $O(1)$ time with bounded memory allocations.
- **Strict Typing**: No `any` escapes in public APIs. Ensure full generic type inference.
- **Concurrency Safety**: Half-open trial permits and state transitions must be resilient under asynchronous multi-worker bursts.
