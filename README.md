# StateSketch

StateSketch is an interactive mental-model lab for exploring concurrency interleavings and check-then-act atomicity.

**Status:** Experimental pre-alpha

## Demo

Run the local development server to explore the pre-alpha Last Seat Reservation lab. No hosted demo is published yet.

## What is StateSketch?

StateSketch is an experimental interactive CS learning project where learners control execution order and inspect how shared state changes step by step.

The project currently contains exactly one prototype scenario: **Last Seat Reservation / Check-Then-Act Atomicity**.

StateSketch keeps the current learning session in memory only. Refreshing the
page starts a fresh session.

## Prototype

The planned learning sequence is:

**Predict → Schedule → Observe → Explain → Compare**

Prediction, unsafe scheduling, violation analysis, synchronized exploration,
causal Compare, and Final Insight are implemented. Both explorations include
state inspection, Back, retained future, alternate scheduling, and run Reset.
After reviewing a saved first violation and submitting a causal checkpoint,
learners explicitly try the synchronized version. Compare requires a completed
synchronized execution with a real blocked LOCK attempt; a safe run without
contention remains valid and can be revisited with Back or Reset.

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

- **Prototype:** Pre-alpha / Complete Last Seat Reservation learning loop
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
explicit learner action after a real violation.

`src/domain/synchronized-reservation/` is a separate, deterministic domain for
LOCK, CHECK, COMMIT and explicit UNLOCK. A contended LOCK records a blocked attempt
before CHECK; UNLOCK wakes the waiter without transferring ownership. Its tests
traverse every legal schedule and prefix through the domain's runnable selector.

`src/application/synchronized-session/` stores only `schedulerChoices + cursor`.
All execution state, operation facts, eligibility and history derive from replay
of the applied prefix. Back retains future choices, matching choices reuse them,
and a different legal choice replaces only the abandoned future. Reset affects
only the synchronized timeline and preserves earlier learning artifacts.

Compare derives its unsafe evidence exclusively from `SavedUnsafeTrace` and its
synchronized evidence from the current completed synchronized session. Milestones
are aligned by causal roles, not matching step indices or fixed thread identities.
The comparison and insight phases disallow timeline controls; there is no second
saved synchronized trace. Final Insight reflects on the initial prediction and
explains the same-mutex CHECK → dependent COMMIT region and model limitations.
Only Final Insight offers Start over, which clears the entire learning session.

The single `quality` check includes exhaustive synchronized timeline/cursor tests,
mixed-role comparison tests, component coverage for blocking and no-block runs,
the three earlier browser journeys, and one complete Chromium learning-loop
journey. There are no new dependencies, persistence, deployment, or Public Alpha
release changes.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

StateSketch is available under the [MIT License](LICENSE).
