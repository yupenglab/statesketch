# StateSketch

StateSketch is an interactive mental-model lab for exploring concurrency interleavings and check-then-act atomicity.

**Status:** Experimental pre-alpha

## Demo

Run the local development server to explore the pre-alpha Last Seat Reservation lab. No hosted demo is published yet.

## What is StateSketch?

StateSketch is an experimental interactive CS learning project where learners control execution order and inspect how shared state changes step by step.

The project currently plans exactly one prototype scenario: **Last Seat Reservation / Check-Then-Act Atomicity**.

## Prototype

The planned learning sequence is:

**Predict → Schedule → Observe → Explain → Compare**

Prediction, unsafe scheduling, and violation analysis are implemented. The lab includes state inspection, Back, retained future, alternate scheduling, Reset run, a saved first-violation trace, and a causal checkpoint. Compare remains deferred.

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

- **Prototype:** Pre-alpha / Predict + Unsafe Lab + Violation Analysis
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
npm run test:e2e
```

Use `npm run format` to apply the project's formatting rules.

Before the first browser test, run `npx playwright install --no-shell chromium`.
The Chromium-only journey starts its own local server. The CI `quality` job
uses Chromium's new headless mode, installs it with
`npx playwright install --with-deps --no-shell chromium`, and runs
the same browser tests alongside typecheck, lint, formatting, unit tests, and build.

## Implementation boundaries

`src/application/learning-session/` holds the committed prediction, unsafe
session, first saved violating scheduling trace, checkpoint answer, and replay-derived
causal analysis. React owns form drafts and renders derived views. Scheduling,
Back, retained future and Reset delegate to `unsafe-session`; domain transitions
and invariants remain in `src/domain/unsafe-reservation/`. Reset preserves the
prediction, saved violation evidence, and latest checkpoint answer. Analysis is an
explicit learner action after a real violation. Synchronization and Compare are not
implemented.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

StateSketch is available under the [MIT License](LICENSE).
