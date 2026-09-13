import {
  advanceSynchronizedExecution,
  replaySynchronizedExecution,
  THREAD_IDS,
  getRunnableThreadIds,
  getThreadStatus,
  getNextOperation,
  didCheckPass,
  countSuccessfulReservations,
  isExecutionComplete,
  type SchedulingChoice,
  type ThreadId,
} from '../../domain/synchronized-reservation';

export interface SynchronizedSessionState {
  readonly schedulerChoices: readonly SchedulingChoice[];
  readonly cursor: number;
}
export type SynchronizedSessionAction =
  | { readonly type: 'SCHEDULE_THREAD'; readonly threadId: ThreadId }
  | { readonly type: 'BACK' }
  | { readonly type: 'RESET_RUN' };

function snapshot(
  choices: readonly SchedulingChoice[],
  cursor: number,
): SynchronizedSessionState {
  return Object.freeze({
    schedulerChoices: Object.isFrozen(choices)
      ? choices
      : Object.freeze([...choices]),
    cursor,
  });
}
export function createInitialSynchronizedSession(): SynchronizedSessionState {
  return snapshot([], 0);
}
export function assertValidSynchronizedSession(
  session: SynchronizedSessionState,
): void {
  if (
    session === null ||
    typeof session !== 'object' ||
    !Array.isArray(session.schedulerChoices)
  )
    throw new Error('Invalid synchronized timeline.');
  if (
    !Number.isInteger(session.cursor) ||
    session.cursor < 0 ||
    session.cursor > session.schedulerChoices.length
  )
    throw new Error('Invalid synchronized cursor.');
  if (session.schedulerChoices.some((id) => !THREAD_IDS.includes(id)))
    throw new Error('Invalid synchronized scheduling choice.');
  replaySynchronizedExecution(session.schedulerChoices);
}
export function reduceSynchronizedSession(
  session: SynchronizedSessionState,
  action: SynchronizedSessionAction,
): SynchronizedSessionState {
  assertValidSynchronizedSession(session);
  switch (action.type) {
    case 'BACK':
      return session.cursor === 0
        ? session
        : snapshot(session.schedulerChoices, session.cursor - 1);
    case 'RESET_RUN':
      return createInitialSynchronizedSession();
    case 'SCHEDULE_THREAD': {
      const applied = session.schedulerChoices.slice(0, session.cursor);
      advanceSynchronizedExecution(
        replaySynchronizedExecution(applied).finalState,
        action.threadId,
      );
      return snapshot(
        session.schedulerChoices[session.cursor] === action.threadId
          ? session.schedulerChoices
          : [...applied, action.threadId],
        session.cursor + 1,
      );
    }
    default:
      throw new Error('Unsupported synchronized action.');
  }
}
export function deriveSynchronizedSessionView(
  session: SynchronizedSessionState,
) {
  assertValidSynchronizedSession(session);
  const active = replaySynchronizedExecution(
    session.schedulerChoices.slice(0, session.cursor),
  );
  const full = replaySynchronizedExecution(session.schedulerChoices);
  const execution = active.finalState;
  const runnableThreadIds = getRunnableThreadIds(execution);
  return Object.freeze({
    currentExecution: execution,
    currentStep: session.cursor,
    canBack: session.cursor > 0,
    appliedSchedulingChoices: Object.freeze(
      session.schedulerChoices.slice(0, session.cursor),
    ),
    retainedFutureChoices: Object.freeze(
      session.schedulerChoices.slice(session.cursor),
    ),
    activeTransitionFacts: Object.freeze(
      active.steps.map((step) => step.facts),
    ),
    retainedFutureTransitionFacts: Object.freeze(
      full.steps.slice(session.cursor).map((step) => step.facts),
    ),
    runnableThreadIds,
    executionComplete: isExecutionComplete(execution),
    invariant: active.invariant,
    mutexOwner: execution.mutexOwner,
    successfulReservations: countSuccessfulReservations(execution),
    hasBlockedLockAttempt: active.steps.some(
      ({ facts }) => facts.operation === 'LOCK' && facts.outcome === 'BLOCKED',
    ),
    threads: Object.freeze(
      THREAD_IDS.map((id) =>
        Object.freeze({
          id,
          status: getThreadStatus(execution, id),
          runnable: runnableThreadIds.includes(id),
          nextOperation: getNextOperation(execution, id),
          observation: execution.threads[id].observedSeatsRemaining,
          checkPassed: didCheckPass(execution, id),
          hasSeat: execution.threads[id].hasSeat,
          blockingOwner:
            getThreadStatus(execution, id) === 'BLOCKED'
              ? execution.mutexOwner
              : null,
        }),
      ),
    ),
  });
}
export type SynchronizedSessionView = ReturnType<
  typeof deriveSynchronizedSessionView
>;
