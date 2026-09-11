import { describe, expect, it } from 'vitest';

import {
  advanceUnsafeExecution,
  countSuccessfulReservations,
  createInitialUnsafeState,
  didCheckPass,
  evaluateReservationInvariant,
  getNextOperation,
  getRunnableThreadIds,
  getThreadStatus,
  isExecutionComplete,
  isThreadRunnable,
  UnsafeTransitionError,
  type ExecutionState,
} from './index';

describe('unsafe reservation transitions', () => {
  it('creates the fixed immutable initial state', () => {
    const state = createInitialUnsafeState();

    expect(state).toEqual({
      seatsRemaining: 1,
      threads: {
        A: {
          progress: 'BEFORE_CHECK',
          observedSeatsRemaining: null,
          hasSeat: false,
        },
        B: {
          progress: 'BEFORE_CHECK',
          observedSeatsRemaining: null,
          hasSeat: false,
        },
      },
    });
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.threads)).toBe(true);
    expect(Object.isFrozen(state.threads.A)).toBe(true);
  });

  it('performs a positive CHECK without changing shared state or prior state', () => {
    const previous = createInitialUnsafeState();
    const previousSnapshot = structuredClone(previous);

    const result = advanceUnsafeExecution(previous, 'A');

    expect(previous).toEqual(previousSnapshot);
    expect(result.state).not.toBe(previous);
    expect(result.state.seatsRemaining).toBe(1);
    expect(result.state.threads.A).toEqual({
      progress: 'AFTER_SUCCESSFUL_CHECK',
      observedSeatsRemaining: 1,
      hasSeat: false,
    });
    expect(result.facts).toEqual({
      threadId: 'A',
      operation: 'CHECK',
      observedSeatsRemaining: 1,
      checkPassed: true,
      sharedStateChanged: false,
      seatsRemainingBefore: 1,
      seatsRemainingAfter: 1,
      invariantBefore: 'HOLDS',
      invariantAfter: 'HOLDS',
    });
  });

  it('performs COMMIT exactly once after a successful CHECK', () => {
    const afterCheck = advanceUnsafeExecution(
      createInitialUnsafeState(),
      'A',
    ).state;
    const previousSnapshot = structuredClone(afterCheck);

    const result = advanceUnsafeExecution(afterCheck, 'A');

    expect(afterCheck).toEqual(previousSnapshot);
    expect(result.state.seatsRemaining).toBe(0);
    expect(result.state.threads.A).toEqual({
      progress: 'FINISHED',
      observedSeatsRemaining: 1,
      hasSeat: true,
    });
    expect(result.facts).toEqual({
      threadId: 'A',
      operation: 'COMMIT',
      checkedSeatsRemaining: 1,
      obtainedSeat: true,
      sharedStateChanged: true,
      seatsRemainingBefore: 1,
      seatsRemainingAfter: 0,
      invariantBefore: 'HOLDS',
      invariantAfter: 'HOLDS',
    });
  });

  it('finishes a thread after a zero-seat CHECK and retains the observation', () => {
    const afterBCommit = advanceUnsafeExecution(
      advanceUnsafeExecution(createInitialUnsafeState(), 'B').state,
      'B',
    ).state;

    const result = advanceUnsafeExecution(afterBCommit, 'A');

    expect(result.state.seatsRemaining).toBe(0);
    expect(result.state.threads.A).toEqual({
      progress: 'FINISHED',
      observedSeatsRemaining: 0,
      hasSeat: false,
    });
    expect(result.facts.operation).toBe('CHECK');
    expect(result.facts).toMatchObject({
      observedSeatsRemaining: 0,
      checkPassed: false,
      sharedStateChanged: false,
    });
    expect(didCheckPass(result.state, 'A')).toBe(false);
    expect(getThreadStatus(result.state, 'A')).toBe('FINISHED');
    expect(getNextOperation(result.state, 'A')).toBeNull();
    expect(isThreadRunnable(result.state, 'A')).toBe(false);
  });

  it('derives check, reservation, invariant, status, operation, and runnable truth', () => {
    const afterCheck = advanceUnsafeExecution(
      createInitialUnsafeState(),
      'A',
    ).state;

    expect(didCheckPass(afterCheck, 'A')).toBe(true);
    expect(didCheckPass(afterCheck, 'B')).toBe(false);
    expect(countSuccessfulReservations(afterCheck)).toBe(0);
    expect(evaluateReservationInvariant(afterCheck)).toBe('HOLDS');
    expect(getThreadStatus(afterCheck, 'A')).toBe('RUNNABLE');
    expect(getNextOperation(afterCheck, 'A')).toBe('COMMIT');
    expect(isThreadRunnable(afterCheck, 'A')).toBe(true);
    expect(getRunnableThreadIds(afterCheck)).toEqual(['A', 'B']);
    expect(isExecutionComplete(afterCheck)).toBe(false);
  });

  it('rejects scheduling a finished thread', () => {
    const afterACommit = advanceUnsafeExecution(
      advanceUnsafeExecution(createInitialUnsafeState(), 'A').state,
      'A',
    ).state;

    expect(() => advanceUnsafeExecution(afterACommit, 'A')).toThrowError(
      expect.objectContaining<Partial<UnsafeTransitionError>>({
        code: 'THREAD_NOT_RUNNABLE',
      }),
    );
  });

  it('rejects a COMMIT-ready state without a successful CHECK observation', () => {
    const invalidState: ExecutionState = {
      seatsRemaining: 1,
      threads: {
        A: {
          progress: 'AFTER_SUCCESSFUL_CHECK',
          observedSeatsRemaining: null,
          hasSeat: false,
        },
        B: createInitialUnsafeState().threads.B,
      },
    };

    expect(() => advanceUnsafeExecution(invalidState, 'A')).toThrowError(
      expect.objectContaining<Partial<UnsafeTransitionError>>({
        code: 'INVALID_EXECUTION_STATE',
      }),
    );
  });

  it('rejects malformed canonical state instead of normalizing it', () => {
    const invalidState: ExecutionState = {
      seatsRemaining: 0,
      threads: createInitialUnsafeState().threads,
    };

    expect(() => advanceUnsafeExecution(invalidState, 'A')).toThrowError(
      expect.objectContaining<Partial<UnsafeTransitionError>>({
        code: 'INVALID_EXECUTION_STATE',
      }),
    );
  });

  it('rejects arbitrary extra thread state at runtime', () => {
    const initial = createInitialUnsafeState();
    const invalidState = {
      ...initial,
      threads: {
        ...initial.threads,
        C: initial.threads.A,
      },
    } as ExecutionState;

    expect(() => advanceUnsafeExecution(invalidState, 'A')).toThrowError(
      expect.objectContaining<Partial<UnsafeTransitionError>>({
        code: 'INVALID_EXECUTION_STATE',
      }),
    );
  });
});
