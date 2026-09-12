import {
  THREAD_IDS,
  type SynchronizedExecutionState,
  type ThreadId,
  type ThreadState,
} from './model';
import { countSuccessfulReservations, isProtectedProgress } from './selectors';

export class SynchronizedTransitionError extends Error {
  constructor(
    readonly code:
      | 'INVALID_EXECUTION_STATE'
      | 'INVALID_SCHEDULING_CHOICE'
      | 'THREAD_NOT_RUNNABLE',
    message: string,
  ) {
    super(message);
    this.name = 'SynchronizedTransitionError';
  }
}

function invalid(message: string): never {
  throw new SynchronizedTransitionError('INVALID_EXECUTION_STATE', message);
}

function assertThread(thread: ThreadState): void {
  if (
    thread === null ||
    typeof thread !== 'object' ||
    typeof thread.hasSeat !== 'boolean'
  )
    invalid('Invalid thread state.');
  const observation = thread.observedSeatsRemaining;
  switch (thread.progress) {
    case 'BEFORE_LOCK':
    case 'WAITING_FOR_MUTEX':
    case 'INSIDE_BEFORE_CHECK':
      if (observation !== null || thread.hasSeat)
        invalid(
          'A thread before CHECK cannot have an observation or reservation.',
        );
      break;
    case 'INSIDE_AFTER_SUCCESSFUL_CHECK':
      if (observation !== 1 || thread.hasSeat)
        invalid(
          'COMMIT requires a successful earlier CHECK and no reservation.',
        );
      break;
    case 'INSIDE_AFTER_FAILED_CHECK':
      if (observation !== 0 || thread.hasSeat)
        invalid('Failed CHECK requires a zero observation and no reservation.');
      break;
    case 'INSIDE_AFTER_COMMIT':
      if (observation !== 1 || !thread.hasSeat)
        invalid(
          'Committed thread requires a successful CHECK and reservation.',
        );
      break;
    case 'FINISHED':
      if (thread.hasSeat ? observation !== 1 : observation !== 0)
        invalid('Invalid finished thread.');
      break;
    default:
      invalid('Unknown thread progress.');
  }
}

export function assertValidSynchronizedState(
  state: SynchronizedExecutionState,
): void {
  if (state === null || typeof state !== 'object')
    invalid('Execution state must be an object.');
  if (state.mutexOwner !== null && !THREAD_IDS.includes(state.mutexOwner))
    invalid('Mutex owner must be A, B or null.');
  if (!Number.isInteger(state.seatsRemaining))
    invalid('Shared seats must be an integer.');
  if (state.threads === null || typeof state.threads !== 'object')
    invalid('Missing threads.');
  const keys = Object.keys(state.threads);
  if (
    keys.length !== 2 ||
    keys.some((key) => !THREAD_IDS.includes(key as ThreadId))
  )
    invalid('Exactly threads A and B are required.');
  for (const id of THREAD_IDS) {
    const thread = state.threads[id];
    assertThread(thread);
    if (isProtectedProgress(thread.progress) !== (state.mutexOwner === id))
      invalid('Only the mutex owner must occupy the protected region.');
    if (
      thread.progress === 'WAITING_FOR_MUTEX' &&
      (state.mutexOwner === null || state.mutexOwner === id)
    )
      invalid('A waiter requires another mutex owner.');
  }
  const reservations = countSuccessfulReservations(state);
  if (reservations > 1 || state.seatsRemaining !== 1 - reservations)
    invalid('Shared seats must match at most one reservation.');
  for (const id of THREAD_IDS) {
    const thread = state.threads[id];
    if (thread.observedSeatsRemaining === 0 && reservations !== 1)
      invalid('A zero observation requires a prior reservation.');
    if (thread.observedSeatsRemaining === 0) {
      const other = state.threads[id === 'A' ? 'B' : 'A'];
      if (!other.hasSeat || other.progress !== 'FINISHED')
        invalid(
          'The earlier reservation must have released the mutex before a zero-seat CHECK.',
        );
    }
    if (
      thread.progress === 'INSIDE_AFTER_SUCCESSFUL_CHECK' &&
      state.seatsRemaining !== 1
    )
      invalid('Protected successful CHECK cannot be stale before COMMIT.');
  }
}
