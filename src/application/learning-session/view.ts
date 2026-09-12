import {
  countSuccessfulReservations,
  didCheckPass,
  getNextOperation,
  getThreadStatus,
  THREAD_IDS,
} from '../../domain/unsafe-reservation';
import { deriveUnsafeSessionView } from '../unsafe-session';
import type { LearningSessionAction, LearningSessionState } from './session';
import { deriveCheckpointFeedback } from './checkpoint';
import { deriveViolationAnalysis, type ViolationAnalysis } from './analysis';

export function deriveLearningSessionView(session: LearningSessionState) {
  const timeline = deriveUnsafeSessionView(session.unsafeSession);
  const execution = timeline.currentExecution;
  return {
    ...timeline,
    phase: session.phase,
    canAnalyzeViolation:
      session.phase === 'UNSAFE_EXPLORATION' &&
      session.savedUnsafeTrace !== null,
    checkpointFeedback:
      session.checkpointAnswer === null
        ? null
        : deriveCheckpointFeedback(session.checkpointAnswer),
    successfulReservations: countSuccessfulReservations(execution),
    threads: THREAD_IDS.map((id) => ({
      id,
      status: getThreadStatus(execution, id),
      runnable: timeline.runnableThreadIds.includes(id),
      nextOperation: getNextOperation(execution, id),
      observation: execution.threads[id].observedSeatsRemaining,
      checkPassed: didCheckPass(execution, id),
      hasSeat: execution.threads[id].hasSeat,
    })),
  };
}

export type LearningSessionView = ReturnType<typeof deriveLearningSessionView>;

export function deriveLearningViolationAnalysis(
  session: LearningSessionState,
): ViolationAnalysis {
  if (
    session.phase !== 'VIOLATION_ANALYSIS' ||
    session.savedUnsafeTrace === null
  ) {
    throw new Error('Violation analysis is not available for this session.');
  }
  return deriveViolationAnalysis(session.savedUnsafeTrace);
}

// An interaction result for presentation only; it never changes the timeline.
export function describeLearningInteraction(
  previous: LearningSessionState,
  action: LearningSessionAction,
  next: LearningSessionState,
) {
  const view = deriveLearningSessionView(next);
  const replacedFuture =
    action.type === 'SCHEDULE_THREAD' &&
    previous.unsafeSession.cursor <
      previous.unsafeSession.schedulerChoices.length &&
    previous.unsafeSession.schedulerChoices[previous.unsafeSession.cursor] !==
      action.threadId;

  return {
    type: action.type,
    currentStep: view.currentStep,
    branchPoint: replacedFuture ? previous.unsafeSession.cursor : null,
    lastStep: view.activeTransitionFacts.at(-1),
    invariant: view.invariant,
    successfulReservations: view.successfulReservations,
    checkpointFeedback:
      action.type === 'SUBMIT_CHECKPOINT' ? view.checkpointFeedback : null,
  };
}

export type LearningInteraction = ReturnType<
  typeof describeLearningInteraction
>;
