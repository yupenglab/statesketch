import { describe, expect, it } from 'vitest';
import {
  advanceSynchronizedExecution as advance,
  assertValidSynchronizedState as validate,
  createInitialSynchronizedState as initial,
  replaySynchronizedExecution as replay,
  getNextOperation,
  getRunnableThreadIds,
  getThreadStatus,
  didCheckPass,
  isExecutionComplete,
  evaluateReservationInvariant,
  type SynchronizedExecutionState as State,
  type ThreadId,
} from './index';

describe('synchronized state machine', () => {
  it('starts with exactly canonical fields and two runnable LOCK operations', () => {
    const state = initial();
    expect(state).toEqual({
      seatsRemaining: 1,
      mutexOwner: null,
      threads: {
        A: {
          progress: 'BEFORE_LOCK',
          observedSeatsRemaining: null,
          hasSeat: false,
        },
        B: {
          progress: 'BEFORE_LOCK',
          observedSeatsRemaining: null,
          hasSeat: false,
        },
      },
    });
    expect(getRunnableThreadIds(state)).toEqual(['A', 'B']);
    for (const id of ['A', 'B'] as const) {
      expect(getNextOperation(state, id)).toBe('LOCK');
      expect(didCheckPass(state, id)).toBe(false);
      expect(Object.isFrozen(state.threads[id])).toBe(true);
    }
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.threads)).toBe(true);
    expect(isExecutionComplete(state)).toBe(false);
  });

  it.each(['A', 'B'] as const)(
    'executes the exact blocked trace with %s first, waking without acquisition',
    (owner) => {
      const waiter: ThreadId = owner === 'A' ? 'B' : 'A';
      const choices: ThreadId[] = [
        owner,
        waiter,
        owner,
        owner,
        owner,
        waiter,
        waiter,
        waiter,
      ];
      const result = replay(choices);
      expect(result.steps.map((step) => step.facts.operation)).toEqual([
        'LOCK',
        'LOCK',
        'CHECK',
        'COMMIT',
        'UNLOCK',
        'LOCK',
        'CHECK',
        'UNLOCK',
      ]);
      expect(result.steps).toHaveLength(choices.length);
      const [
        locked,
        blocked,
        checked,
        committed,
        unlocked,
        acquired,
        failed,
        finished,
      ] = result.steps;
      expect(locked.facts).toMatchObject({
        operation: 'LOCK',
        outcome: 'ACQUIRED',
        mutexOwnerBefore: null,
        mutexOwnerAfter: owner,
        sharedStateChanged: false,
      });
      expect(locked.state.threads[owner]).toEqual({
        progress: 'INSIDE_BEFORE_CHECK',
        observedSeatsRemaining: null,
        hasSeat: false,
      });
      expect(blocked.facts).toMatchObject({
        operation: 'LOCK',
        outcome: 'BLOCKED',
        blockingOwner: owner,
        mutexOwnerBefore: owner,
        mutexOwnerAfter: owner,
        seatsRemainingBefore: 1,
        seatsRemainingAfter: 1,
      });
      expect(blocked.facts).not.toHaveProperty('checkPassed');
      expect(blocked.state.threads[waiter]).toEqual({
        progress: 'WAITING_FOR_MUTEX',
        observedSeatsRemaining: null,
        hasSeat: false,
      });
      expect(getThreadStatus(blocked.state, waiter)).toBe('BLOCKED');
      expect(getNextOperation(blocked.state, waiter)).toBe('LOCK');
      expect(getRunnableThreadIds(blocked.state)).toEqual([owner]);
      expect(() => advance(blocked.state, waiter)).toThrow(
        expect.objectContaining({ code: 'THREAD_NOT_RUNNABLE' }),
      );
      expect(checked.facts).toMatchObject({
        operation: 'CHECK',
        observedSeatsRemaining: 1,
        checkPassed: true,
        seatsRemainingAfter: 1,
        mutexOwnerAfter: owner,
      });
      expect(getNextOperation(checked.state, owner)).toBe('COMMIT');
      expect(didCheckPass(checked.state, owner)).toBe(true);
      expect(committed.facts).toMatchObject({
        operation: 'COMMIT',
        checkedSeatsRemaining: 1,
        obtainedSeat: true,
        seatsRemainingBefore: 1,
        seatsRemainingAfter: 0,
        mutexOwnerAfter: owner,
      });
      expect(committed.state.threads[owner].progress).toBe(
        'INSIDE_AFTER_COMMIT',
      );
      expect(getNextOperation(committed.state, owner)).toBe('UNLOCK');
      expect(unlocked.facts).toMatchObject({
        operation: 'UNLOCK',
        releasedBy: owner,
        madeRunnableThreadId: waiter,
        mutexOwnerAfter: null,
        sharedStateChanged: false,
      });
      expect(unlocked.state.threads[waiter]).toEqual(initial().threads[waiter]);
      expect(getNextOperation(unlocked.state, waiter)).toBe('LOCK');
      expect(getRunnableThreadIds(unlocked.state)).toEqual([waiter]);
      expect(acquired.state.mutexOwner).toBe(waiter);
      expect(acquired.state.threads[waiter].observedSeatsRemaining).toBeNull();
      expect(failed.facts).toMatchObject({
        operation: 'CHECK',
        observedSeatsRemaining: 0,
        checkPassed: false,
        mutexOwnerAfter: waiter,
      });
      expect(failed.state.threads[waiter].progress).toBe(
        'INSIDE_AFTER_FAILED_CHECK',
      );
      expect(getNextOperation(failed.state, waiter)).toBe('UNLOCK');
      expect(finished.facts).toMatchObject({
        operation: 'UNLOCK',
        releasedBy: waiter,
        madeRunnableThreadId: null,
        mutexOwnerAfter: null,
      });
      expect(result.finalState.threads[owner].hasSeat).toBe(true);
      expect(result.finalState.threads[waiter].hasSeat).toBe(false);
      expect(result.finalState.seatsRemaining).toBe(0);
      expect(isExecutionComplete(result.finalState)).toBe(true);
      for (const id of [owner, waiter] as const) {
        expect(getThreadStatus(result.finalState, id)).toBe('FINISHED');
        expect(getNextOperation(result.finalState, id)).toBeNull();
        expect(() => advance(result.finalState, id)).toThrow(
          expect.objectContaining({ code: 'THREAD_NOT_RUNNABLE' }),
        );
      }
    },
  );

  it.each(['A', 'B'] as const)(
    'permits a complete uncontended %s-first execution',
    (first) => {
      const second = first === 'A' ? 'B' : 'A';
      const result = replay([
        first,
        first,
        first,
        first,
        second,
        second,
        second,
      ]);
      expect(result.steps.map((step) => step.facts.operation)).toEqual([
        'LOCK',
        'CHECK',
        'COMMIT',
        'UNLOCK',
        'LOCK',
        'CHECK',
        'UNLOCK',
      ]);
      expect(
        result.steps.some(
          (step) =>
            step.facts.operation === 'LOCK' && step.facts.outcome === 'BLOCKED',
        ),
      ).toBe(false);
      expect(result.invariant).toBe('HOLDS');
    },
  );

  it('replays the same transition results without mutating input, snapshots, threads or facts', () => {
    const choices = Object.freeze([
      'A',
      'B',
      'A',
      'A',
      'A',
      'B',
      'B',
      'B',
    ] as const);
    const result = replay(choices);
    const snapshot = structuredClone(result);
    let state = initial();
    for (const [index, choice] of choices.entries()) {
      const previous = structuredClone(state);
      const next = advance(state, choice);
      expect(state).toEqual(previous);
      expect(next).toEqual({
        state: result.steps[index].state,
        facts: result.steps[index].facts,
      });
      expect(Object.isFrozen(next.facts)).toBe(true);
      state = next.state;
    }
    expect(result).toEqual(snapshot);
    expect(replay(choices)).toEqual(result);
    expect(choices).toEqual(['A', 'B', 'A', 'A', 'A', 'B', 'B', 'B']);
  });

  it('rejects illegal replay sequences and arbitrary scheduling identities explicitly', () => {
    expect(() => replay(['A', 'B', 'B'])).toThrow(
      expect.objectContaining({ code: 'THREAD_NOT_RUNNABLE' }),
    );
    expect(() => replay(['A', 'A', 'A', 'A', 'A'])).toThrow(
      expect.objectContaining({ code: 'THREAD_NOT_RUNNABLE' }),
    );
    expect(() => advance(initial(), 'C' as ThreadId)).toThrow(
      expect.objectContaining({ code: 'INVALID_SCHEDULING_CHOICE' }),
    );
    expect(replay([]).finalState).toEqual(initial());
  });

  it('evaluates the business invariant independently of state validation', () => {
    const winner = replay(['A', 'A', 'A', 'A']).finalState.threads.A;
    const invalid: State = {
      seatsRemaining: -1,
      mutexOwner: null,
      threads: { A: winner, B: winner },
    };
    expect(evaluateReservationInvariant(invalid)).toBe('VIOLATED');
    expect(() => validate(invalid)).toThrow();
  });
});

describe('canonical state validation', () => {
  it('rejects a failed observation made before the winner released the mutex', () => {
    const state = replay(['A', 'A', 'A']).finalState;
    const invalid: State = {
      ...state,
      threads: {
        ...state.threads,
        B: { progress: 'FINISHED', observedSeatsRemaining: 0, hasSeat: false },
      },
    };
    expect(() => validate(invalid)).toThrow('released the mutex');
  });

  it('rejects a waiter with an observation even when another thread owns the mutex', () => {
    const state = replay(['A', 'B']).finalState;
    const invalid: State = {
      ...state,
      threads: {
        ...state.threads,
        B: { ...state.threads.B, observedSeatsRemaining: 1 },
      },
    };
    expect(() => validate(invalid)).toThrow('before CHECK');
  });

  const corruptions: [string, (state: State) => unknown][] = [
    ['null state', () => null],
    ['missing threads', (state) => ({ ...state, threads: null })],
    [
      'missing thread',
      (state) => ({ ...state, threads: { A: state.threads.A } }),
    ],
    [
      'extra thread',
      (state) => ({
        ...state,
        threads: { ...state.threads, C: state.threads.A },
      }),
    ],
    [
      'null thread',
      (state) => ({ ...state, threads: { ...state.threads, A: null } }),
    ],
    ['unknown owner', (state) => ({ ...state, mutexOwner: 'C' })],
    ['multiple owners', (state) => ({ ...state, mutexOwner: ['A', 'B'] })],
    [
      'owner outside protected region',
      (state) => ({ ...state, mutexOwner: 'A' }),
    ],
    ['fractional seats', (state) => ({ ...state, seatsRemaining: 0.5 })],
    ['inconsistent shared seats', (state) => ({ ...state, seatsRemaining: 0 })],
  ];
  it.each(corruptions)('rejects %s without repair', (_label, corrupt) => {
    const state = corrupt(initial()) as State;
    const before = structuredClone(state);
    expect(() => validate(state)).toThrow(
      expect.objectContaining({ code: 'INVALID_EXECUTION_STATE' }),
    );
    expect(() => advance(state, 'A')).toThrow(
      expect.objectContaining({ code: 'INVALID_EXECUTION_STATE' }),
    );
    expect(state).toEqual(before);
  });

  it.each([
    ['BEFORE_LOCK', 1, false, null],
    ['BEFORE_LOCK', null, true, null],
    ['WAITING_FOR_MUTEX', null, false, null],
    ['WAITING_FOR_MUTEX', null, false, 'A'],
    ['INSIDE_BEFORE_CHECK', null, false, null],
    ['INSIDE_BEFORE_CHECK', 1, false, 'A'],
    ['INSIDE_AFTER_SUCCESSFUL_CHECK', null, false, 'A'],
    ['INSIDE_AFTER_SUCCESSFUL_CHECK', 0, false, 'A'],
    ['INSIDE_AFTER_SUCCESSFUL_CHECK', 1, true, 'A'],
    ['INSIDE_AFTER_SUCCESSFUL_CHECK', 1, false, null],
    ['INSIDE_AFTER_FAILED_CHECK', 1, false, 'A'],
    ['INSIDE_AFTER_FAILED_CHECK', 0, false, null],
    ['INSIDE_AFTER_COMMIT', 1, false, 'A'],
    ['INSIDE_AFTER_COMMIT', 0, true, 'A'],
    ['INSIDE_AFTER_COMMIT', 1, true, null],
    ['FINISHED', null, false, null],
    ['FINISHED', 1, false, null],
    ['FINISHED', 0, true, null],
    ['UNKNOWN', null, false, null],
  ])(
    'rejects invalid progress %s, observation %s, hasSeat %s, owner %s',
    (progress, observedSeatsRemaining, hasSeat, mutexOwner) => {
      const state = {
        ...initial(),
        mutexOwner,
        threads: {
          ...initial().threads,
          A: { progress, observedSeatsRemaining, hasSeat },
        },
      } as State;
      expect(() => advance(state, 'A')).toThrow(
        expect.objectContaining({ code: 'INVALID_EXECUTION_STATE' }),
      );
    },
  );

  it('rejects a non-owner in the protected region even when the real owner is valid', () => {
    const state = replay(['A']).finalState;
    const corrupt: State = {
      ...state,
      threads: { A: state.threads.A, B: state.threads.A },
    };
    expect(() => validate(corrupt)).toThrow('Only the mutex owner');
  });

  it('rejects a protected successful observation inconsistent with a prior reservation', () => {
    const state = replay(['B', 'B', 'B', 'B', 'A']).finalState;
    const corrupt: State = {
      ...state,
      threads: {
        ...state.threads,
        A: {
          progress: 'INSIDE_AFTER_SUCCESSFUL_CHECK',
          observedSeatsRemaining: 1,
          hasSeat: false,
        },
      },
    };
    expect(() => advance(corrupt, 'A')).toThrow('cannot be stale');
  });

  it('rejects a zero observation without a prior reservation', () => {
    const state: State = {
      ...initial(),
      threads: {
        ...initial().threads,
        A: { progress: 'FINISHED', observedSeatsRemaining: 0, hasSeat: false },
      },
    };
    expect(() => validate(state)).toThrow('prior reservation');
  });
});
