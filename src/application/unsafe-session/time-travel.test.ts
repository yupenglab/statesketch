import { describe, expect, it } from 'vitest';

import { replayUnsafeExecution } from '../../domain/unsafe-reservation';
import {
  createInitialUnsafeSession,
  deriveUnsafeSessionView,
  reduceUnsafeSession,
  type UnsafeSessionState,
} from './index';

function schedule(
  session: UnsafeSessionState,
  ...threadIds: readonly ('A' | 'B')[]
): UnsafeSessionState {
  return threadIds.reduce(
    (current, threadId) =>
      reduceUnsafeSession(current, { type: 'SCHEDULE_THREAD', threadId }),
    session,
  );
}

function rewind(
  session: UnsafeSessionState,
  steps: number,
): UnsafeSessionState {
  return Array.from({ length: steps }).reduce<UnsafeSessionState>(
    (current) => reduceUnsafeSession(current, { type: 'BACK' }),
    session,
  );
}

describe('unsafe session time travel', () => {
  it('retains choices and future facts after Back', () => {
    const full = schedule(createInitialUnsafeSession(), 'A', 'B', 'A', 'B');
    const rewound = rewind(full, 2);
    const view = deriveUnsafeSessionView(rewound);

    expect(rewound.schedulerChoices).toBe(full.schedulerChoices);
    expect(rewound).toEqual({
      schedulerChoices: ['A', 'B', 'A', 'B'],
      cursor: 2,
    });
    expect(view.appliedSchedulingChoices).toEqual(['A', 'B']);
    expect(view.retainedFutureChoices).toEqual(['A', 'B']);
    expect(view.activeTransitionFacts.map((facts) => facts.operation)).toEqual([
      'CHECK',
      'CHECK',
    ]);
    expect(
      view.retainedFutureTransitionFacts.map((facts) => [
        facts.threadId,
        facts.operation,
      ]),
    ).toEqual([
      ['A', 'COMMIT'],
      ['B', 'COMMIT'],
    ]);
  });

  it('reuses the same retained future choice without rebuilding the timeline', () => {
    const full = schedule(createInitialUnsafeSession(), 'A', 'B', 'A', 'B');
    const rewound = rewind(full, 2);
    const rewoundSnapshot = structuredClone(rewound);

    const continued = reduceUnsafeSession(rewound, {
      type: 'SCHEDULE_THREAD',
      threadId: 'A',
    });

    expect(rewound).toEqual(rewoundSnapshot);
    expect(continued.schedulerChoices).toBe(full.schedulerChoices);
    expect(continued).toEqual({
      schedulerChoices: ['A', 'B', 'A', 'B'],
      cursor: 3,
    });
    expect(deriveUnsafeSessionView(continued).retainedFutureChoices).toEqual([
      'B',
    ]);
  });

  it('truncates abandoned future when an alternate legal thread is selected', () => {
    const full = schedule(createInitialUnsafeSession(), 'A', 'B', 'A', 'B');
    const rewound = rewind(full, 2);
    const rewoundSnapshot = structuredClone(rewound);

    const branched = reduceUnsafeSession(rewound, {
      type: 'SCHEDULE_THREAD',
      threadId: 'B',
    });
    const view = deriveUnsafeSessionView(branched);
    const expectedReplay = replayUnsafeExecution(['A', 'B', 'B']);

    expect(rewound).toEqual(rewoundSnapshot);
    expect(branched).toEqual({ schedulerChoices: ['A', 'B', 'B'], cursor: 3 });
    expect(branched.schedulerChoices).not.toBe(full.schedulerChoices);
    expect(view.currentExecution).toEqual(expectedReplay.finalState);
    expect(view.activeTransitionFacts).toEqual(
      expectedReplay.steps.map((step) => step.facts),
    );
    expect(view.activeTransitionFacts.at(-1)).toMatchObject({
      threadId: 'B',
      operation: 'COMMIT',
    });
    expect(view.retainedFutureChoices).toEqual([]);
    expect(view.retainedFutureTransitionFacts).toEqual([]);
  });
});
