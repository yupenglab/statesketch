import {
  evaluateReservationInvariant,
  type ReservationInvariantStatus,
} from './invariant';
import {
  createExecutionStateSnapshot,
  THREAD_IDS,
  type ExecutionState,
  type SchedulingChoice,
  type ThreadId,
  type ThreadState,
} from './model';
import {
  countSuccessfulReservations,
  getNextOperation,
  isThreadRunnable,
} from './selectors';

export type UnsafeTransitionErrorCode =
  | 'INVALID_EXECUTION_STATE'
  | 'THREAD_NOT_RUNNABLE'
  | 'INVALID_CHECK'
  | 'INVALID_COMMIT';

export class UnsafeTransitionError extends Error {
  readonly code: UnsafeTransitionErrorCode;

  constructor(code: UnsafeTransitionErrorCode, message: string) {
    super(message);
    this.name = 'UnsafeTransitionError';
    this.code = code;
  }
}

interface TransitionFactsBase {
  readonly threadId: ThreadId;
  readonly seatsRemainingBefore: number;
  readonly seatsRemainingAfter: number;
  readonly invariantBefore: ReservationInvariantStatus;
  readonly invariantAfter: ReservationInvariantStatus;
}

export interface CheckTransitionFacts extends TransitionFactsBase {
  readonly operation: 'CHECK';
  readonly observedSeatsRemaining: number;
  readonly checkPassed: boolean;
  readonly sharedStateChanged: false;
}

export interface CommitTransitionFacts extends TransitionFactsBase {
  readonly operation: 'COMMIT';
  readonly checkedSeatsRemaining: number;
  readonly obtainedSeat: true;
  readonly sharedStateChanged: true;
}

export type TransitionFacts = CheckTransitionFacts | CommitTransitionFacts;

export interface TransitionResult {
  readonly state: ExecutionState;
  readonly facts: TransitionFacts;
}

function invalidState(message: string): never {
  throw new UnsafeTransitionError('INVALID_EXECUTION_STATE', message);
}

function assertThreadState(threadId: ThreadId, thread: ThreadState): void {
  if (typeof thread.hasSeat !== 'boolean') {
    invalidState(`Thread ${threadId} has an invalid hasSeat value.`);
  }

  const observation = thread.observedSeatsRemaining;
  if (observation !== null && observation !== 0 && observation !== 1) {
    invalidState(`Thread ${threadId} has an unreachable seat observation.`);
  }

  switch (thread.progress) {
    case 'BEFORE_CHECK':
      if (observation !== null || thread.hasSeat) {
        invalidState(`Thread ${threadId} is inconsistent before CHECK.`);
      }
      return;
    case 'AFTER_SUCCESSFUL_CHECK':
      if (observation !== 1 || thread.hasSeat) {
        invalidState(`Thread ${threadId} cannot be ready to COMMIT.`);
      }
      return;
    case 'FINISHED':
      if (thread.hasSeat ? observation !== 1 : observation !== 0) {
        invalidState(`Thread ${threadId} has an inconsistent finished state.`);
      }
      return;
    default:
      invalidState(`Thread ${threadId} has an unknown progress value.`);
  }
}

export function assertValidUnsafeState(state: ExecutionState): void {
  if (state === null || typeof state !== 'object') {
    invalidState('Execution state must be an object.');
  }

  if (!Number.isInteger(state.seatsRemaining)) {
    invalidState('seatsRemaining must be an integer.');
  }

  if (state.threads === null || typeof state.threads !== 'object') {
    invalidState('Execution state must contain thread state.');
  }

  const threadKeys = Object.keys(state.threads);
  if (
    threadKeys.length !== THREAD_IDS.length ||
    threadKeys.some((threadId) => !THREAD_IDS.includes(threadId as ThreadId))
  ) {
    invalidState('Unsafe execution state must contain only threads A and B.');
  }

  for (const threadId of THREAD_IDS) {
    const thread = state.threads[threadId];
    if (thread === undefined || thread === null || typeof thread !== 'object') {
      invalidState(`Thread ${threadId} is missing.`);
    }
    assertThreadState(threadId, thread);
  }

  const successfulReservations = countSuccessfulReservations(state);
  if (state.seatsRemaining !== 1 - successfulReservations) {
    invalidState('Shared seats do not match the committed reservations.');
  }

  if (
    successfulReservations === 0 &&
    THREAD_IDS.some(
      (threadId) => state.threads[threadId].observedSeatsRemaining === 0,
    )
  ) {
    invalidState('A zero-seat observation requires an earlier reservation.');
  }
}

function replaceThread(
  state: ExecutionState,
  threadId: ThreadId,
  nextThread: ThreadState,
  seatsRemaining = state.seatsRemaining,
): ExecutionState {
  return createExecutionStateSnapshot(seatsRemaining, {
    ...state.threads,
    [threadId]: nextThread,
  });
}

function executeCheck(
  state: ExecutionState,
  threadId: ThreadId,
): TransitionResult {
  const thread = state.threads[threadId];
  if (
    thread.progress !== 'BEFORE_CHECK' ||
    thread.observedSeatsRemaining !== null ||
    thread.hasSeat
  ) {
    throw new UnsafeTransitionError(
      'INVALID_CHECK',
      `Thread ${threadId} cannot perform CHECK from its current state.`,
    );
  }

  const observedSeatsRemaining = state.seatsRemaining;
  const checkPassed = observedSeatsRemaining > 0;
  const nextState = replaceThread(state, threadId, {
    progress: checkPassed ? 'AFTER_SUCCESSFUL_CHECK' : 'FINISHED',
    observedSeatsRemaining,
    hasSeat: false,
  });

  assertValidUnsafeState(nextState);

  return Object.freeze({
    state: nextState,
    facts: Object.freeze({
      threadId,
      operation: 'CHECK',
      observedSeatsRemaining,
      checkPassed,
      sharedStateChanged: false,
      seatsRemainingBefore: state.seatsRemaining,
      seatsRemainingAfter: nextState.seatsRemaining,
      invariantBefore: evaluateReservationInvariant(state),
      invariantAfter: evaluateReservationInvariant(nextState),
    }),
  });
}

function executeCommit(
  state: ExecutionState,
  threadId: ThreadId,
): TransitionResult {
  const thread = state.threads[threadId];
  if (
    thread.progress !== 'AFTER_SUCCESSFUL_CHECK' ||
    thread.observedSeatsRemaining === null ||
    thread.observedSeatsRemaining <= 0 ||
    thread.hasSeat
  ) {
    throw new UnsafeTransitionError(
      'INVALID_COMMIT',
      `Thread ${threadId} cannot COMMIT without a successful earlier CHECK.`,
    );
  }

  const nextState = replaceThread(
    state,
    threadId,
    {
      ...thread,
      progress: 'FINISHED',
      hasSeat: true,
    },
    state.seatsRemaining - 1,
  );

  assertValidUnsafeState(nextState);

  return Object.freeze({
    state: nextState,
    facts: Object.freeze({
      threadId,
      operation: 'COMMIT',
      checkedSeatsRemaining: thread.observedSeatsRemaining,
      obtainedSeat: true,
      sharedStateChanged: true,
      seatsRemainingBefore: state.seatsRemaining,
      seatsRemainingAfter: nextState.seatsRemaining,
      invariantBefore: evaluateReservationInvariant(state),
      invariantAfter: evaluateReservationInvariant(nextState),
    }),
  });
}

export function advanceUnsafeExecution(
  state: ExecutionState,
  schedulingChoice: SchedulingChoice,
): TransitionResult {
  assertValidUnsafeState(state);

  if (!isThreadRunnable(state, schedulingChoice)) {
    throw new UnsafeTransitionError(
      'THREAD_NOT_RUNNABLE',
      `Thread ${schedulingChoice} is already finished.`,
    );
  }

  const operation = getNextOperation(state, schedulingChoice);
  switch (operation) {
    case 'CHECK':
      return executeCheck(state, schedulingChoice);
    case 'COMMIT':
      return executeCommit(state, schedulingChoice);
    case null:
      throw new UnsafeTransitionError(
        'THREAD_NOT_RUNNABLE',
        `Thread ${schedulingChoice} has no next operation.`,
      );
  }
}
