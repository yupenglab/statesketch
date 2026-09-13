import { describe, expect, it } from 'vitest';
import {
  createInitialSynchronizedSession as initial,
  reduceSynchronizedSession as reduce,
  deriveSynchronizedSessionView as view,
  type SynchronizedSessionState,
} from './index';
import {
  replaySynchronizedExecution as replay,
  getRunnableThreadIds,
  isExecutionComplete,
  type SchedulingChoice,
} from '../../domain/synchronized-reservation';

function completeSchedules(
  prefix: readonly SchedulingChoice[] = [],
): readonly SchedulingChoice[][] {
  const state = replay(prefix).finalState;
  return isExecutionComplete(state)
    ? [[...prefix]]
    : getRunnableThreadIds(state).flatMap((id) =>
        completeSchedules([...prefix, id]),
      );
}
const schedules = completeSchedules();
describe('synchronized session canonical timeline', () => {
  it('starts with only choices and cursor; views are deterministic replay projections', () => {
    const session = initial();
    expect(session).toEqual({ schedulerChoices: [], cursor: 0 });
    expect(Object.keys(session)).toEqual(['schedulerChoices', 'cursor']);
    expect(view(session).currentExecution).toEqual(replay([]).finalState);
    expect(view(session).runnableThreadIds).toEqual(['A', 'B']);
    expect(reduce(session, { type: 'BACK' })).toBe(session);
    expect(view(session)).toEqual(view(session));
  });
  it.each(schedules.map((choices) => [choices.join(''), choices] as const))(
    'exhaustive timeline/cursor and branch integrity: %s',
    (_, choices) => {
      let session = initial();
      for (const id of choices) {
        const prior = structuredClone(session);
        const next = reduce(session, { type: 'SCHEDULE_THREAD', threadId: id });
        expect(next.cursor).toBe(session.cursor + 1);
        expect(next.schedulerChoices).toHaveLength(next.cursor);
        expect(session).toEqual(prior);
        expect(Object.isFrozen(next)).toBe(true);
        expect(Object.isFrozen(next.schedulerChoices)).toBe(true);
        session = next;
      }
      expect(view(session).executionComplete).toBe(true);
      for (let cursor = choices.length; cursor >= 0; cursor--) {
        const before = structuredClone(session);
        const projection = view(session);
        const replayed = replay(choices.slice(0, cursor));
        expect(projection.currentExecution).toEqual(replayed.finalState);
        expect(projection.activeTransitionFacts).toEqual(
          replayed.steps.map((s) => s.facts),
        );
        expect(projection.retainedFutureTransitionFacts).toEqual(
          replay(choices)
            .steps.slice(cursor)
            .map((s) => s.facts),
        );
        expect(projection.hasBlockedLockAttempt).toBe(
          replayed.steps.some(
            (s) =>
              s.facts.operation === 'LOCK' && s.facts.outcome === 'BLOCKED',
          ),
        );
        expect(view(session)).toEqual(projection);
        for (const id of getRunnableThreadIds(replayed.finalState)) {
          const branched = reduce(session, {
            type: 'SCHEDULE_THREAD',
            threadId: id,
          });
          if (id === choices[cursor])
            expect(branched.schedulerChoices).toBe(session.schedulerChoices);
          else
            expect(branched.schedulerChoices).toEqual([
              ...choices.slice(0, cursor),
              id,
            ]);
          expect(branched.cursor).toBe(cursor + 1);
          expect(view(branched).currentExecution).toEqual(
            replay([...choices.slice(0, cursor), id]).finalState,
          );
        }
        for (const id of ['A', 'B'] as const) {
          if (!projection.runnableThreadIds.includes(id))
            expect(() =>
              reduce(session, { type: 'SCHEDULE_THREAD', threadId: id }),
            ).toThrow();
        }
        expect(reduce(session, { type: 'RESET_RUN' })).toEqual(initial());
        expect(session).toEqual(before);
        const previous = session;
        session = reduce(session, { type: 'BACK' });
        expect(session.schedulerChoices).toBe(previous.schedulerChoices);
        expect(session.cursor).toBe(Math.max(0, cursor - 1));
      }
    },
  );
  it('discovers blocked and non-blocked complete executions without assuming their counts', () => {
    expect(schedules.length).toBeGreaterThan(0);
    const cases = schedules.map(
      (choices) =>
        view({ schedulerChoices: choices, cursor: choices.length })
          .hasBlockedLockAttempt,
    );
    expect(cases).toContain(true);
    expect(cases).toContain(false);
  });
  it.each([-1, 1, 0.5, NaN, Infinity])(
    'rejects malformed cursor %s',
    (cursor) => {
      expect(() => view({ schedulerChoices: [], cursor })).toThrow();
    },
  );
  it('rejects illegal retained future even when not applied, malformed ids and blocked scheduling without mutation', () => {
    for (const choices of [['A', 'B', 'B'], ['X']]) {
      const malformed = {
        schedulerChoices: choices,
        cursor: 0,
      } as SynchronizedSessionState;
      expect(() => view(malformed)).toThrow();
      expect(() => reduce(malformed, { type: 'BACK' })).toThrow();
    }
    const blocked = { schedulerChoices: ['A', 'B'], cursor: 2 } as const;
    expect(() =>
      reduce(blocked, { type: 'SCHEDULE_THREAD', threadId: 'B' }),
    ).toThrow();
    expect(blocked).toEqual({ schedulerChoices: ['A', 'B'], cursor: 2 });
  });
});
