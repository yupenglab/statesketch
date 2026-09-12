import type { TransitionFacts } from '../domain/unsafe-reservation';
import type { LearningInteraction } from '../application/learning-session/view';

export function formatStep(facts: TransitionFacts): string {
  const actor = `Thread ${facts.threadId} performed ${facts.operation}.`;
  if (facts.operation === 'CHECK') {
    return `${actor} Observed ${facts.observedSeatsRemaining} ${facts.observedSeatsRemaining === 1 ? 'seat' : 'seats'}; check ${facts.checkPassed ? 'passed' : 'failed'}. Shared seats unchanged at ${facts.seatsRemainingAfter}.`;
  }
  return `${actor} Seats remaining: ${facts.seatsRemainingBefore} → ${facts.seatsRemainingAfter}. Thread ${facts.threadId} reserved a seat.`;
}

export function formatAnnouncement(result: LearningInteraction): string {
  switch (result.type) {
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
