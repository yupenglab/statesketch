import {
  createStateSnapshot,
  THREAD_IDS,
  type SynchronizedExecutionState,
  type SchedulingChoice,
  type ThreadId,
} from './model';
import { getNextOperation, isThreadRunnable } from './selectors';
import {
  evaluateReservationInvariant,
  type ReservationInvariantStatus,
} from './invariant';
import {
  assertValidSynchronizedState,
  SynchronizedTransitionError,
} from './validation';

interface FactsBase {
  readonly threadId: ThreadId;
  readonly seatsRemainingBefore: number;
  readonly seatsRemainingAfter: number;
  readonly mutexOwnerBefore: ThreadId | null;
  readonly mutexOwnerAfter: ThreadId | null;
  readonly invariantBefore: ReservationInvariantStatus;
  readonly invariantAfter: ReservationInvariantStatus;
}

type OperationFacts =
  | {
      readonly operation: 'LOCK';
      readonly outcome: 'ACQUIRED';
      readonly sharedStateChanged: false;
    }
  | {
      readonly operation: 'LOCK';
      readonly outcome: 'BLOCKED';
      readonly blockingOwner: ThreadId;
      readonly sharedStateChanged: false;
    }
  | {
      readonly operation: 'CHECK';
      readonly observedSeatsRemaining: number;
      readonly checkPassed: boolean;
      readonly sharedStateChanged: false;
    }
  | {
      readonly operation: 'COMMIT';
      readonly checkedSeatsRemaining: number;
      readonly obtainedSeat: true;
      readonly sharedStateChanged: true;
    }
  | {
      readonly operation: 'UNLOCK';
      readonly releasedBy: ThreadId;
      readonly madeRunnableThreadId: ThreadId | null;
      readonly sharedStateChanged: false;
    };

export type SynchronizedTransitionFacts = FactsBase & OperationFacts;
export interface SynchronizedTransitionResult {
  readonly state: SynchronizedExecutionState;
  readonly facts: SynchronizedTransitionFacts;
}

export function advanceSynchronizedExecution(
  state: SynchronizedExecutionState,
  choice: SchedulingChoice,
): SynchronizedTransitionResult {
  assertValidSynchronizedState(state);
  if (!THREAD_IDS.includes(choice))
    throw new SynchronizedTransitionError(
      'INVALID_SCHEDULING_CHOICE',
      'Schedule only A or B.',
    );
  if (!isThreadRunnable(state, choice))
    throw new SynchronizedTransitionError(
      'THREAD_NOT_RUNNABLE',
      'Waiting and finished threads cannot be scheduled.',
    );
  const thread = state.threads[choice];
  const other = choice === 'A' ? 'B' : 'A';
  let next: SynchronizedExecutionState;
  let operationFacts: OperationFacts;
  switch (getNextOperation(state, choice)) {
    case 'LOCK': {
      const acquired = state.mutexOwner === null;
      next = {
        ...state,
        mutexOwner: acquired ? choice : state.mutexOwner,
        threads: {
          ...state.threads,
          [choice]: {
            ...thread,
            progress: acquired ? 'INSIDE_BEFORE_CHECK' : 'WAITING_FOR_MUTEX',
          },
        },
      };
      operationFacts =
        state.mutexOwner === null
          ? {
              operation: 'LOCK',
              outcome: 'ACQUIRED',
              sharedStateChanged: false,
            }
          : {
              operation: 'LOCK',
              outcome: 'BLOCKED',
              blockingOwner: state.mutexOwner,
              sharedStateChanged: false,
            };
      break;
    }
    case 'CHECK': {
      const observedSeatsRemaining = state.seatsRemaining;
      const checkPassed = observedSeatsRemaining > 0;
      next = {
        ...state,
        threads: {
          ...state.threads,
          [choice]: {
            ...thread,
            observedSeatsRemaining,
            progress: checkPassed
              ? 'INSIDE_AFTER_SUCCESSFUL_CHECK'
              : 'INSIDE_AFTER_FAILED_CHECK',
          },
        },
      };
      operationFacts = {
        operation: 'CHECK',
        observedSeatsRemaining,
        checkPassed,
        sharedStateChanged: false,
      };
      break;
    }
    case 'COMMIT':
      next = {
        ...state,
        seatsRemaining: state.seatsRemaining - 1,
        threads: {
          ...state.threads,
          [choice]: {
            ...thread,
            hasSeat: true,
            progress: 'INSIDE_AFTER_COMMIT',
          },
        },
      };
      // Input validation establishes the successful observation before dispatch.
      operationFacts = {
        operation: 'COMMIT',
        checkedSeatsRemaining: thread.observedSeatsRemaining as number,
        obtainedSeat: true,
        sharedStateChanged: true,
      };
      break;
    case 'UNLOCK': {
      const wake = state.threads[other].progress === 'WAITING_FOR_MUTEX';
      next = {
        ...state,
        mutexOwner: null,
        threads: {
          ...state.threads,
          [choice]: { ...thread, progress: 'FINISHED' },
          [other]: wake
            ? { ...state.threads[other], progress: 'BEFORE_LOCK' }
            : state.threads[other],
        },
      };
      operationFacts = {
        operation: 'UNLOCK',
        releasedBy: choice,
        madeRunnableThreadId: wake ? other : null,
        sharedStateChanged: false,
      };
      break;
    }
    case null:
      throw new SynchronizedTransitionError(
        'THREAD_NOT_RUNNABLE',
        'No next operation.',
      );
  }
  assertValidSynchronizedState(next);
  return Object.freeze({
    state: createStateSnapshot(next),
    facts: Object.freeze({
      ...operationFacts,
      threadId: choice,
      seatsRemainingBefore: state.seatsRemaining,
      seatsRemainingAfter: next.seatsRemaining,
      mutexOwnerBefore: state.mutexOwner,
      mutexOwnerAfter: next.mutexOwner,
      invariantBefore: evaluateReservationInvariant(state),
      invariantAfter: evaluateReservationInvariant(next),
    }),
  });
}
