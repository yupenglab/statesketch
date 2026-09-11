import { describe, expect, it } from 'vitest';

import {
  advanceUnsafeExecution,
  countSuccessfulReservations,
  createInitialUnsafeState,
  getNextOperation,
  replayUnsafeExecution,
} from './index';

describe('unsafe reservation replay', () => {
  it('replays the canonical violating A-first trace', () => {
    const replay = replayUnsafeExecution(['A', 'B', 'A', 'B']);

    expect(replay.steps.map((step) => step.facts.operation)).toEqual([
      'CHECK',
      'CHECK',
      'COMMIT',
      'COMMIT',
    ]);
    expect(replay.finalState).toEqual({
      seatsRemaining: -1,
      threads: {
        A: {
          progress: 'FINISHED',
          observedSeatsRemaining: 1,
          hasSeat: true,
        },
        B: {
          progress: 'FINISHED',
          observedSeatsRemaining: 1,
          hasSeat: true,
        },
      },
    });
    expect(countSuccessfulReservations(replay.finalState)).toBe(2);
    expect(replay.invariant).toBe('VIOLATED');
    expect(replay.steps.at(-1)?.facts).toMatchObject({
      operation: 'COMMIT',
      invariantBefore: 'HOLDS',
      invariantAfter: 'VIOLATED',
    });
  });

  it('replays the canonical safe A-first ordering', () => {
    const replay = replayUnsafeExecution(['A', 'A', 'B']);

    expect(replay.steps.map((step) => step.facts.operation)).toEqual([
      'CHECK',
      'COMMIT',
      'CHECK',
    ]);
    expect(replay.finalState).toEqual({
      seatsRemaining: 0,
      threads: {
        A: {
          progress: 'FINISHED',
          observedSeatsRemaining: 1,
          hasSeat: true,
        },
        B: {
          progress: 'FINISHED',
          observedSeatsRemaining: 0,
          hasSeat: false,
        },
      },
    });
    expect(countSuccessfulReservations(replay.finalState)).toBe(1);
    expect(replay.invariant).toBe('HOLDS');
  });

  it.each([
    {
      schedule: ['B', 'A', 'B', 'A'] as const,
      operations: ['CHECK', 'CHECK', 'COMMIT', 'COMMIT'],
      invariant: 'VIOLATED',
    },
    {
      schedule: ['B', 'B', 'A'] as const,
      operations: ['CHECK', 'COMMIT', 'CHECK'],
      invariant: 'HOLDS',
    },
  ])(
    'supports symmetric B-first schedule $schedule',
    ({ schedule, operations, invariant }) => {
      const replay = replayUnsafeExecution(schedule);

      expect(replay.steps.map((step) => step.facts.operation)).toEqual(
        operations,
      );
      expect(replay.invariant).toBe(invariant);
      expect(replay.finalState.threads.B.hasSeat).toBe(true);
    },
  );

  it('preserves B stale observation after A commits', () => {
    let state = createInitialUnsafeState();
    state = advanceUnsafeExecution(state, 'A').state;
    state = advanceUnsafeExecution(state, 'B').state;
    state = advanceUnsafeExecution(state, 'A').state;

    expect(state.seatsRemaining).toBe(0);
    expect(state.threads.B.observedSeatsRemaining).toBe(1);
    expect(getNextOperation(state, 'B')).toBe('COMMIT');
  });

  it('replays identical schedules with equivalent state, operations, facts, and invariant', () => {
    const schedule = ['A', 'B', 'B', 'A'] as const;

    const first = replayUnsafeExecution(schedule);
    const second = replayUnsafeExecution(schedule);

    expect(second.finalState).toEqual(first.finalState);
    expect(second.steps.map((step) => step.facts.operation)).toEqual(
      first.steps.map((step) => step.facts.operation),
    );
    expect(second.steps.map((step) => step.facts)).toEqual(
      first.steps.map((step) => step.facts),
    );
    expect(second.invariant).toBe(first.invariant);
  });
});
