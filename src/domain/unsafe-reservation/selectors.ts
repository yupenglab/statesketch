import {
  THREAD_IDS,
  type ExecutionState,
  type PedagogicalOperation,
  type ThreadId,
} from './model';

export type ThreadStatus = 'RUNNABLE' | 'FINISHED';

export function didCheckPass(
  state: ExecutionState,
  threadId: ThreadId,
): boolean {
  const observation = state.threads[threadId].observedSeatsRemaining;

  return observation !== null && observation > 0;
}

export function countSuccessfulReservations(state: ExecutionState): number {
  return THREAD_IDS.filter((threadId) => state.threads[threadId].hasSeat)
    .length;
}

export function getThreadStatus(
  state: ExecutionState,
  threadId: ThreadId,
): ThreadStatus {
  return state.threads[threadId].progress === 'FINISHED'
    ? 'FINISHED'
    : 'RUNNABLE';
}

export function getNextOperation(
  state: ExecutionState,
  threadId: ThreadId,
): PedagogicalOperation | null {
  switch (state.threads[threadId].progress) {
    case 'BEFORE_CHECK':
      return 'CHECK';
    case 'AFTER_SUCCESSFUL_CHECK':
      return 'COMMIT';
    case 'FINISHED':
      return null;
  }
}

export function isThreadRunnable(
  state: ExecutionState,
  threadId: ThreadId,
): boolean {
  return getThreadStatus(state, threadId) === 'RUNNABLE';
}

export function getRunnableThreadIds(
  state: ExecutionState,
): readonly ThreadId[] {
  return Object.freeze(
    THREAD_IDS.filter((threadId) => isThreadRunnable(state, threadId)),
  );
}

export function isExecutionComplete(state: ExecutionState): boolean {
  return getRunnableThreadIds(state).length === 0;
}
