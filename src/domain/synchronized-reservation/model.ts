export const THREAD_IDS = ['A', 'B'] as const;
export type ThreadId = (typeof THREAD_IDS)[number];
export type SchedulingChoice = ThreadId;
export type PedagogicalOperation = 'LOCK' | 'CHECK' | 'COMMIT' | 'UNLOCK';
export type ThreadProgress =
  | 'BEFORE_LOCK'
  | 'WAITING_FOR_MUTEX'
  | 'INSIDE_BEFORE_CHECK'
  | 'INSIDE_AFTER_SUCCESSFUL_CHECK'
  | 'INSIDE_AFTER_FAILED_CHECK'
  | 'INSIDE_AFTER_COMMIT'
  | 'FINISHED';

export interface ThreadState {
  readonly progress: ThreadProgress;
  readonly observedSeatsRemaining: number | null;
  readonly hasSeat: boolean;
}

export interface SynchronizedExecutionState {
  readonly seatsRemaining: number;
  readonly mutexOwner: ThreadId | null;
  readonly threads: Readonly<Record<ThreadId, ThreadState>>;
}

export function createStateSnapshot(
  state: SynchronizedExecutionState,
): SynchronizedExecutionState {
  return Object.freeze({
    seatsRemaining: state.seatsRemaining,
    mutexOwner: state.mutexOwner,
    threads: Object.freeze({
      A: Object.freeze({ ...state.threads.A }),
      B: Object.freeze({ ...state.threads.B }),
    }),
  });
}

export function createInitialSynchronizedState(): SynchronizedExecutionState {
  const thread: ThreadState = {
    progress: 'BEFORE_LOCK',
    observedSeatsRemaining: null,
    hasSeat: false,
  };
  return createStateSnapshot({
    seatsRemaining: 1,
    mutexOwner: null,
    threads: { A: thread, B: thread },
  });
}
