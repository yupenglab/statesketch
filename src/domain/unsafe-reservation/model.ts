export const THREAD_IDS = ['A', 'B'] as const;

export type ThreadId = (typeof THREAD_IDS)[number];
export type SchedulingChoice = ThreadId;
export type PedagogicalOperation = 'CHECK' | 'COMMIT';
export type ThreadProgress =
  'BEFORE_CHECK' | 'AFTER_SUCCESSFUL_CHECK' | 'FINISHED';

export interface ThreadState {
  readonly progress: ThreadProgress;
  readonly observedSeatsRemaining: number | null;
  readonly hasSeat: boolean;
}

export interface ExecutionState {
  readonly seatsRemaining: number;
  readonly threads: Readonly<Record<ThreadId, ThreadState>>;
}

function createInitialThreadState(): ThreadState {
  return {
    progress: 'BEFORE_CHECK',
    observedSeatsRemaining: null,
    hasSeat: false,
  };
}

export function createExecutionStateSnapshot(
  seatsRemaining: number,
  threads: Readonly<Record<ThreadId, ThreadState>>,
): ExecutionState {
  return Object.freeze({
    seatsRemaining,
    threads: Object.freeze({
      A: Object.freeze({ ...threads.A }),
      B: Object.freeze({ ...threads.B }),
    }),
  });
}

export function createInitialUnsafeState(): ExecutionState {
  return createExecutionStateSnapshot(1, {
    A: createInitialThreadState(),
    B: createInitialThreadState(),
  });
}
