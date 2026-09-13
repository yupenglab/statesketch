import type { TransitionFacts } from '../domain/unsafe-reservation';
import type { LearningInteraction } from '../application/learning-session/view';
import type { SynchronizedTransitionFacts } from '../domain/synchronized-reservation';

export function formatSynchronizedStep(
  facts: SynchronizedTransitionFacts,
): string {
  const actor = `Thread ${facts.threadId}`;
  switch (facts.operation) {
    case 'LOCK':
      return facts.outcome === 'ACQUIRED'
        ? `${actor} acquired the mutex. Next: CHECK.`
        : `${actor} tried LOCK and is blocked waiting for the mutex held by Thread ${facts.blockingOwner}. ${actor} has not performed CHECK. Shared seats unchanged at ${facts.seatsRemainingAfter}.`;
    case 'CHECK':
      return `${actor} performed CHECK. Observed ${facts.observedSeatsRemaining} seats; check ${facts.checkPassed ? 'passed. Next: COMMIT.' : 'failed. No reservation; next: UNLOCK.'}`;
    case 'COMMIT':
      return `${actor} committed the reservation. Seats remaining: ${facts.seatsRemainingBefore} → ${facts.seatsRemainingAfter}. ${actor} still owns the mutex. Next: UNLOCK.`;
    case 'UNLOCK':
      return `${actor} released the mutex. The mutex is free.${facts.madeRunnableThreadId === null ? '' : ` Thread ${facts.madeRunnableThreadId} is runnable again and must try LOCK again before CHECK. It has not acquired the mutex yet.`}`;
  }
}

export function formatStep(facts: TransitionFacts): string {
  const actor = `Thread ${facts.threadId} performed ${facts.operation}.`;
  if (facts.operation === 'CHECK') {
    return `${actor} Observed ${facts.observedSeatsRemaining} ${facts.observedSeatsRemaining === 1 ? 'seat' : 'seats'}; check ${facts.checkPassed ? 'passed' : 'failed'}. Shared seats unchanged at ${facts.seatsRemainingAfter}.`;
  }
  return `${actor} Seats remaining: ${facts.seatsRemainingBefore} → ${facts.seatsRemainingAfter}. Thread ${facts.threadId} reserved a seat.`;
}

export function formatAnnouncement(result: LearningInteraction): string {
  switch (result.type) {
    case 'START_OVER':
      return 'New session. Make a prediction to begin.';
    case 'ENTER_SYNCHRONIZED_EXPLORATION':
      return 'Synchronized exploration opened. No operations have run. Both attempts will use the same mutex.';
    case 'ENTER_FINAL_COMPARISON':
      return 'Compare executions opened. Review the causal difference between your two executions.';
    case 'ENTER_FINAL_INSIGHT':
      return 'Final insight opened. Reflect on your initial prediction and the two executions.';
    case 'BACK_SYNCHRONIZED':
      return `Returned to synchronized step ${result.synchronized?.currentStep}. Invariant preserved.`;
    case 'RESET_SYNCHRONIZED_RUN':
      return 'Synchronized run reset. Your prediction, unsafe evidence and checkpoint are unchanged.';
    case 'SCHEDULE_SYNCHRONIZED_THREAD': {
      const fact = result.synchronized?.activeTransitionFacts.at(-1);
      const branch =
        result.synchronizedBranchPoint === null
          ? ''
          : `A new execution continues from step ${result.synchronizedBranchPoint}. The previous later steps were replaced. `;
      return `${branch}${fact ? formatSynchronizedStep(fact) : ''} Invariant preserved.`;
    }
    case 'SUBMIT_PREDICTION':
      return 'Exploration started. Choose which thread runs next.';
    case 'BACK':
      return `Returned to step ${result.currentStep}. Invariant ${result.invariant === 'HOLDS' ? 'holds' : 'violated'}.`;
    case 'RESET_RUN':
      return 'Run reset. No execution steps have run. Your prediction is unchanged.';
    case 'ENTER_VIOLATION_ANALYSIS':
      return 'Violation analysis opened. The saved execution evidence is ready to review.';
    case 'SUBMIT_CHECKPOINT':
      return result.checkpointFeedback ?? '';
    case 'SCHEDULE_THREAD': {
      const branch =
        result.branchPoint === null
          ? ''
          : `A new execution continues from step ${result.branchPoint}. The previous later steps were replaced. `;
      const outcome =
        result.invariant === 'HOLDS'
          ? 'Invariant holds.'
          : `Invariant violated. ${result.successfulReservations} reservations succeeded; 1 original seat.`;
      return `${branch}${result.lastStep ? formatStep(result.lastStep) : ''} ${outcome}`;
    }
  }
}
