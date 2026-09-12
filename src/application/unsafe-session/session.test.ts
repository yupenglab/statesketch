import { describe, expect, it } from 'vitest';

import {
  createInitialUnsafeState,
  replayUnsafeExecution,
} from '../../domain/unsafe-reservation';
import {
  createInitialUnsafeSession,
  deriveUnsafeSessionView,
  reduceUnsafeSession,
  SessionTimelineError,
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

describe('unsafe session reducer', () => {
  it('creates the initial timeline and derives initial domain execution', () => {
    const session = createInitialUnsafeSession();
    const view = deriveUnsafeSessionView(session);

    expect(session).toEqual({ schedulerChoices: [], cursor: 0 });
    expect(view.currentExecution).toEqual(createInitialUnsafeState());
    expect(view.currentStep).toBe(0);
    expect(view.canBack).toBe(false);
    expect(view.activeTransitionFacts).toEqual([]);
    expect(view.runnableThreadIds).toEqual(['A', 'B']);
    expect(view.executionComplete).toBe(false);
    expect(view.invariant).toBe('HOLDS');
  });

  it('schedules exactly one domain operation per action', () => {
    const initial = createInitialUnsafeSession();
    const initialSnapshot = structuredClone(initial);
    const initialChoices = initial.schedulerChoices;
    const afterA = schedule(initial, 'A');
    const afterAB = schedule(afterA, 'B');

    expect(initial).toEqual(initialSnapshot);
    expect(initial.schedulerChoices).toBe(initialChoices);
    expect(afterA).toEqual({ schedulerChoices: ['A'], cursor: 1 });
    expect(deriveUnsafeSessionView(afterA).activeTransitionFacts).toHaveLength(
      1,
    );
    expect(
      deriveUnsafeSessionView(afterA).activeTransitionFacts[0],
    ).toMatchObject({
      threadId: 'A',
      operation: 'CHECK',
    });
    expect(afterAB).toEqual({ schedulerChoices: ['A', 'B'], cursor: 2 });
    expect(deriveUnsafeSessionView(afterAB).activeTransitionFacts).toHaveLength(
      2,
    );
  });

  it('moves Back one cursor step while retaining the timeline', () => {
    const full = schedule(createInitialUnsafeSession(), 'A', 'B', 'A');
    const previousSnapshot = structuredClone(full);

    const rewound = reduceUnsafeSession(full, { type: 'BACK' });

    expect(full).toEqual(previousSnapshot);
    expect(rewound.schedulerChoices).toBe(full.schedulerChoices);
    expect(rewound).toEqual({ schedulerChoices: ['A', 'B', 'A'], cursor: 2 });
    expect(deriveUnsafeSessionView(rewound).currentExecution).toEqual(
      replayUnsafeExecution(['A', 'B']).finalState,
    );
  });

  it('backs up to zero one step at a time and then no-ops idempotently', () => {
    const full = schedule(createInitialUnsafeSession(), 'A', 'B', 'A');
    const atTwo = reduceUnsafeSession(full, { type: 'BACK' });
    const atOne = reduceUnsafeSession(atTwo, { type: 'BACK' });
    const atZero = reduceUnsafeSession(atOne, { type: 'BACK' });
    const stillAtZero = reduceUnsafeSession(atZero, { type: 'BACK' });

    expect([atTwo.cursor, atOne.cursor, atZero.cursor]).toEqual([2, 1, 0]);
    expect(atZero.schedulerChoices).toEqual(['A', 'B', 'A']);
    expect(stillAtZero).toBe(atZero);
  });

  it('resets active and rewound timelines while initial reset is an idempotent no-op', () => {
    const initial = createInitialUnsafeSession();
    const active = schedule(initial, 'A', 'B', 'A');
    const rewound = reduceUnsafeSession(active, { type: 'BACK' });
    const activeSnapshot = structuredClone(active);
    const rewoundSnapshot = structuredClone(rewound);

    const resetActive = reduceUnsafeSession(active, { type: 'RESET_RUN' });
    const resetRewound = reduceUnsafeSession(rewound, { type: 'RESET_RUN' });

    expect(active).toEqual(activeSnapshot);
    expect(rewound).toEqual(rewoundSnapshot);
    expect(resetActive).toEqual({ schedulerChoices: [], cursor: 0 });
    expect(resetRewound).toEqual({ schedulerChoices: [], cursor: 0 });
    expect(deriveUnsafeSessionView(resetActive).currentExecution).toEqual(
      createInitialUnsafeState(),
    );
    expect(reduceUnsafeSession(initial, { type: 'RESET_RUN' })).toBe(initial);
  });

  it('rejects scheduling a finished thread without changing the session', () => {
    const session = schedule(createInitialUnsafeSession(), 'A', 'A');
    const snapshot = structuredClone(session);

    expect(() =>
      reduceUnsafeSession(session, { type: 'SCHEDULE_THREAD', threadId: 'A' }),
    ).toThrowError(
      expect.objectContaining<Partial<SessionTimelineError>>({
        code: 'INVALID_SCHEDULE',
      }),
    );
    expect(session).toEqual(snapshot);
    expect(session.schedulerChoices).toEqual(['A', 'A']);
    expect(session.cursor).toBe(2);
  });

  it.each([
    { schedulerChoices: ['A'] as const, cursor: -1 },
    { schedulerChoices: ['A'] as const, cursor: 2 },
  ])('rejects malformed cursor $cursor without clamping', (session) => {
    expect(() => deriveUnsafeSessionView(session)).toThrowError(
      expect.objectContaining<Partial<SessionTimelineError>>({
        code: 'INVALID_SESSION',
      }),
    );
    expect(() => reduceUnsafeSession(session, { type: 'BACK' })).toThrowError(
      expect.objectContaining<Partial<SessionTimelineError>>({
        code: 'INVALID_SESSION',
      }),
    );
  });

  it('rejects a malformed retained timeline instead of repairing it', () => {
    const session: UnsafeSessionState = {
      schedulerChoices: ['A', 'A', 'A'],
      cursor: 2,
    };

    expect(() => deriveUnsafeSessionView(session)).toThrowError(
      expect.objectContaining<Partial<SessionTimelineError>>({
        code: 'INVALID_SESSION',
      }),
    );
    expect(session).toEqual({ schedulerChoices: ['A', 'A', 'A'], cursor: 2 });
  });

  it('derives equivalent views from structurally identical canonical state', () => {
    const firstSession: UnsafeSessionState = {
      schedulerChoices: ['A', 'B', 'A', 'B'],
      cursor: 2,
    };
    const secondSession: UnsafeSessionState = structuredClone(firstSession);

    expect(deriveUnsafeSessionView(secondSession)).toEqual(
      deriveUnsafeSessionView(firstSession),
    );
  });
});
