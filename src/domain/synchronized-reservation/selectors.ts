import {
  THREAD_IDS,
  type SynchronizedExecutionState,
  type ThreadId,
  type ThreadProgress,
  type PedagogicalOperation,
} from './model';

export type ThreadStatus = 'RUNNABLE' | 'BLOCKED' | 'FINISHED';

export function isProtectedProgress(progress: ThreadProgress): boolean {
  return (
    progress === 'INSIDE_BEFORE_CHECK' ||
    progress === 'INSIDE_AFTER_SUCCESSFUL_CHECK' ||
    progress === 'INSIDE_AFTER_FAILED_CHECK' ||
    progress === 'INSIDE_AFTER_COMMIT'
  );
}

export function getThreadStatus(
  state: SynchronizedExecutionState,
  id: ThreadId,
): ThreadStatus {
  const progress = state.threads[id].progress;
  return progress === 'WAITING_FOR_MUTEX'
    ? 'BLOCKED'
    : progress === 'FINISHED'
      ? 'FINISHED'
      : 'RUNNABLE';
}

export function getNextOperation(
  state: SynchronizedExecutionState,
  id: ThreadId,
): PedagogicalOperation | null {
  switch (state.threads[id].progress) {
    case 'BEFORE_LOCK':
    case 'WAITING_FOR_MUTEX':
      return 'LOCK';
    case 'INSIDE_BEFORE_CHECK':
      return 'CHECK';
    case 'INSIDE_AFTER_SUCCESSFUL_CHECK':
      return 'COMMIT';
    case 'INSIDE_AFTER_FAILED_CHECK':
    case 'INSIDE_AFTER_COMMIT':
      return 'UNLOCK';
    case 'FINISHED':
      return null;
  }
}

export function isThreadRunnable(
  state: SynchronizedExecutionState,
  id: ThreadId,
): boolean {
  return getThreadStatus(state, id) === 'RUNNABLE';
}

export function getRunnableThreadIds(
  state: SynchronizedExecutionState,
): readonly ThreadId[] {
  return Object.freeze(THREAD_IDS.filter((id) => isThreadRunnable(state, id)));
}

export function didCheckPass(
  state: SynchronizedExecutionState,
  id: ThreadId,
): boolean {
  const observation = state.threads[id].observedSeatsRemaining;
  return observation !== null && observation > 0;
}

export function countSuccessfulReservations(
  state: SynchronizedExecutionState,
): number {
  return THREAD_IDS.filter((id) => state.threads[id].hasSeat).length;
}

export function isExecutionComplete(
  state: SynchronizedExecutionState,
): boolean {
  return (
    state.mutexOwner === null &&
    THREAD_IDS.every((id) => state.threads[id].progress === 'FINISHED')
  );
}
