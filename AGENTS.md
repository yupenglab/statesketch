# Engineering Agent Contract

This file defines the execution contract for coding agents working on StateSketch.

## Project Scope

Prototype V1 currently targets exactly one scenario: **Last Seat Reservation**.

It teaches **Check-Then-Act Atomicity**.

Do not add a second scenario without explicit project-level approval.

## Frozen Product Behavior

Future implementation must preserve this learning sequence:

**Predict → Schedule → Observe → Explain → Compare**

- The learner chooses thread scheduling.
- One scheduling action executes exactly one pedagogical operation.
- There is no hidden execution.
- Back rewinds exactly one operation.
- Alternate scheduling after rewind truncates the previous future.
- At most one unsafe reference trace may be saved.

## Domain Rules

- Keep domain simulation independent of React.
- Use deterministic, pure transitions.
- Maintain canonical state only; do not duplicate derived values as mutable truth.
- Keep invariants in domain logic.
- Reject impossible transitions.
- Treat scheduler choice as thread identity.
- Derive the next operation.

## Semantic Truth

Future `TransitionFacts`, or an explicitly approved equivalent, must drive:

- state delta;
- history;
- explanation; and
- accessibility announcements.

Do not duplicate simulation interpretation inside React components.

## Pedagogical Safety

Never imply that:

- a pedagogical operation is a CPU instruction;
- the learner scheduler is a full operating-system scheduler;
- sequential consistency represents all real systems;
- concurrency is identical to parallelism;
- this simulator represents C or C++ data-race semantics; or
- a mutex automatically protects or owns a variable.

## Accessibility

Accessibility regressions count as correctness regressions. Require:

- keyboard support;
- state that is not communicated by color alone;
- accessible status announcements;
- an accessible blocked reason;
- stable focus behavior; and
- semantic parity when reduced motion is enabled.

## Anti-Generalization

Do not introduce any of the following without explicit approval:

- a scenario registry;
- a generic concurrency DSL;
- an arbitrary thread engine;
- a plugin system;
- a generic mutex graph;
- a course framework;
- a backend;
- authentication; or
- an AI tutor.

## Verification

Before claiming completion, run every applicable canonical check. Never claim that a command passed unless it was actually run successfully.
