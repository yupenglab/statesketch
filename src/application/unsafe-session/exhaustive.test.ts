import { describe, expect, it } from 'vitest';

import {
  advanceUnsafeExecution,
  createInitialUnsafeState,
  getRunnableThreadIds,
  isExecutionComplete,
  replayUnsafeExecution,
  type ExecutionState,
  type SchedulingChoice,
} from '../../domain/unsafe-reservation';
import {
  createInitialUnsafeSession,
  deriveUnsafeSessionView,
  reduceUnsafeSession,
  type UnsafeSessionState,
} from './index';

function enumerateCompleteLegalSchedules(
  state: ExecutionState = createInitialUnsafeState(),
  prefix: readonly SchedulingChoice[] = [],
): readonly (readonly SchedulingChoice[])[] {
  if (isExecutionComplete(state)) {
    return [prefix];
  }

  return getRunnableThreadIds(state).flatMap((threadId) =>
    enumerateCompleteLegalSchedules(
      advanceUnsafeExecution(state, threadId).state,
      [...prefix, threadId],
    ),
  );
}

function createFullSession(
  schedule: readonly SchedulingChoice[],
): UnsafeSessionState {
  return schedule.reduce(
    (session, threadId) =>
      reduceUnsafeSession(session, { type: 'SCHEDULE_THREAD', threadId }),
    createInitialUnsafeSession(),
  );
}

describe('exhaustive unsafe session timeline integrity', () => {
  it('matches domain replay for every complete legal schedule and cursor', () => {
    const schedules = enumerateCompleteLegalSchedules();
    let timelineCursorPairs = 0;

    for (const schedulerChoices of schedules) {
      for (let cursor = 0; cursor <= schedulerChoices.length; cursor += 1) {
        timelineCursorPairs += 1;
        const view = deriveUnsafeSessionView({ schedulerChoices, cursor });
        const expectedReplay = replayUnsafeExecution(
          schedulerChoices.slice(0, cursor),
        );
        const fullReplay = replayUnsafeExecution(schedulerChoices);

        expect(view.currentExecution).toEqual(expectedReplay.finalState);
        expect(view.activeTransitionFacts).toEqual(
          expectedReplay.steps.map((step) => step.facts),
        );
        expect(view.invariant).toBe(expectedReplay.invariant);
        expect(view.currentStep).toBe(cursor);
        expect(view.canBack).toBe(cursor > 0);
        expect(view.runnableThreadIds).toEqual(
          getRunnableThreadIds(expectedReplay.finalState),
        );
        expect(view.executionComplete).toBe(
          isExecutionComplete(expectedReplay.finalState),
        );
        expect(view.appliedSchedulingChoices).toEqual(
          schedulerChoices.slice(0, cursor),
        );
        expect(view.retainedFutureChoices).toEqual(
          schedulerChoices.slice(cursor),
        );
        expect(view.retainedFutureTransitionFacts).toEqual(
          fullReplay.steps.slice(cursor).map((step) => step.facts),
        );
      }
    }

    console.info(
      `Session timeline coverage: schedules=${schedules.length}, timeline/cursor pairs=${timelineCursorPairs}`,
    );

    expect(schedules).toHaveLength(6);
    expect(timelineCursorPairs).toBe(28);
  });

  it('backs through and deterministically reconstructs every retained future', () => {
    const schedules = enumerateCompleteLegalSchedules();

    for (const schedule of schedules) {
      const fullSession = createFullSession(schedule);
      const retainedTimeline = fullSession.schedulerChoices;
      let session = fullSession;

      while (session.cursor > 0) {
        session = reduceUnsafeSession(session, { type: 'BACK' });
        expect(session.schedulerChoices).toBe(retainedTimeline);
        expect(deriveUnsafeSessionView(session).currentExecution).toEqual(
          replayUnsafeExecution(schedule.slice(0, session.cursor)).finalState,
        );
      }

      while (session.cursor < schedule.length) {
        const retainedChoice = schedule[session.cursor];
        if (retainedChoice === undefined) {
          throw new Error('Expected a retained scheduling choice.');
        }
        session = reduceUnsafeSession(session, {
          type: 'SCHEDULE_THREAD',
          threadId: retainedChoice,
        });
        expect(session.schedulerChoices).toBe(retainedTimeline);
      }

      expect(session).toEqual(fullSession);
      expect(deriveUnsafeSessionView(session)).toEqual(
        deriveUnsafeSessionView(fullSession),
      );
    }
  });

  it('truncates every tested alternate legal branch without retaining old facts', () => {
    const schedules = enumerateCompleteLegalSchedules();
    let branchCases = 0;

    for (const schedule of schedules) {
      for (let cursor = 0; cursor < schedule.length; cursor += 1) {
        const session: UnsafeSessionState = {
          schedulerChoices: schedule,
          cursor,
        };
        const view = deriveUnsafeSessionView(session);
        const retainedNextChoice = schedule[cursor];

        for (const alternative of view.runnableThreadIds) {
          if (alternative === retainedNextChoice) {
            continue;
          }

          branchCases += 1;
          const branched = reduceUnsafeSession(session, {
            type: 'SCHEDULE_THREAD',
            threadId: alternative,
          });
          const expectedChoices = [...schedule.slice(0, cursor), alternative];
          const expectedReplay = replayUnsafeExecution(expectedChoices);
          const branchedView = deriveUnsafeSessionView(branched);

          expect(branched.schedulerChoices).toEqual(expectedChoices);
          expect(branched.cursor).toBe(cursor + 1);
          expect(branchedView.currentExecution).toEqual(
            expectedReplay.finalState,
          );
          expect(branchedView.activeTransitionFacts).toEqual(
            expectedReplay.steps.map((step) => step.facts),
          );
          expect(branchedView.retainedFutureChoices).toEqual([]);
          expect(branchedView.retainedFutureTransitionFacts).toEqual([]);
        }
      }
    }

    console.info(`Session alternate branch cases: ${branchCases}`);
    expect(branchCases).toBeGreaterThan(0);
  });
});
