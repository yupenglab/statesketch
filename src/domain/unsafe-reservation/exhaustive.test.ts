import { describe, expect, it } from 'vitest';

import {
  advanceUnsafeExecution,
  createInitialUnsafeState,
  getRunnableThreadIds,
  getThreadStatus,
  isExecutionComplete,
  replayUnsafeExecution,
  type ExecutionState,
  type SchedulingChoice,
} from './index';

function enumerateCompleteLegalSchedules(
  state: ExecutionState = createInitialUnsafeState(),
  prefix: readonly SchedulingChoice[] = [],
): readonly (readonly SchedulingChoice[])[] {
  if (isExecutionComplete(state)) {
    return [prefix];
  }

  return getRunnableThreadIds(state).flatMap((threadId) => {
    const nextState = advanceUnsafeExecution(state, threadId).state;
    return enumerateCompleteLegalSchedules(nextState, [...prefix, threadId]);
  });
}

describe('all complete legal unsafe scheduling sequences', () => {
  it('terminates, covers safe and violating outcomes, and replays deterministically', () => {
    const schedules = enumerateCompleteLegalSchedules();
    const serializedSchedules = schedules.map((schedule) => schedule.join(''));
    const outcomes = schedules.map((schedule) =>
      replayUnsafeExecution(schedule),
    );
    const safeCount = outcomes.filter(
      (replay) => replay.invariant === 'HOLDS',
    ).length;
    const violatingCount = outcomes.filter(
      (replay) => replay.invariant === 'VIOLATED',
    ).length;

    console.info(
      `Complete legal unsafe schedules: total=${schedules.length}, safe=${safeCount}, invariant-violating=${violatingCount}`,
    );

    expect(schedules.length).toBeGreaterThan(0);
    expect(new Set(serializedSchedules).size).toBe(schedules.length);
    expect(safeCount).toBeGreaterThan(0);
    expect(violatingCount).toBeGreaterThan(0);
    expect(safeCount + violatingCount).toBe(schedules.length);

    for (const schedule of schedules) {
      expect(schedule.length).toBeLessThanOrEqual(4);

      let state = createInitialUnsafeState();
      for (const choice of schedule) {
        expect(getRunnableThreadIds(state)).toContain(choice);
        state = advanceUnsafeExecution(state, choice).state;
      }

      expect(isExecutionComplete(state)).toBe(true);
      expect(getThreadStatus(state, 'A')).toBe('FINISHED');
      expect(getThreadStatus(state, 'B')).toBe('FINISHED');

      const firstReplay = replayUnsafeExecution(schedule);
      const secondReplay = replayUnsafeExecution(schedule);
      expect(secondReplay).toEqual(firstReplay);
    }
  });
});
