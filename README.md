# StateSketch

StateSketch is an interactive mental-model lab for exploring concurrency interleavings and check-then-act atomicity.

**Status:** Experimental pre-alpha

## Demo

Prototype implementation is not available yet.

## What is StateSketch?

StateSketch is an experimental interactive CS learning project where learners control execution order and inspect how shared state changes step by step.

The project currently plans exactly one prototype scenario: **Last Seat Reservation / Check-Then-Act Atomicity**.

## Prototype

The planned learning sequence is:

**Predict → Schedule → Observe → Explain → Compare**

This interaction has not been implemented.

## Why this exists

Concurrency beginners often find it difficult to reason about interleavings and to see why a check followed by an action may not be atomic. StateSketch is intended to make that reasoning inspectable. Its learning effectiveness has not yet been established.

## Teaching Model & Limitations

- Conceptual operations are not CPU instructions.
- Learner-controlled ordering is not a complete operating-system scheduler.
- Sequential consistency is a teaching simplification, not a universal execution model.
- Concurrency is not identical to parallelism.
- StateSketch is not a C or C++ memory-model simulator.
- A mutex does not automatically own or protect a variable.

## Current Status

- **Prototype:** Pre-alpha / not yet implemented
- **Human Validation:** Deferred / not completed
- **Learning Effectiveness:** Open

## Development

Requirements: Node.js 22 or later and npm.

```sh
npm ci
npm run dev
```

## Quality Checks

```sh
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
```

Use `npm run format` to apply the project's formatting rules.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

StateSketch is available under the [MIT License](LICENSE).
