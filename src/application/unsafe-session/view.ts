import {
  getRunnableThreadIds,
  isExecutionComplete,
  replayUnsafeExecution,
  type ExecutionState,
  type ReservationInvariantStatus,
  type SchedulingChoice,
  type ThreadId,
  type TransitionFacts,
} from '../../domain/unsafe-reservation';
import type { UnsafeSessionState } from './model';
import { assertValidUnsafeSession } from './session';

export interface UnsafeSessionView {
  readonly currentExecution: ExecutionState;
  readonly currentStep: number;
  readonly canBack: boolean;
  readonly appliedSchedulingChoices: readonly SchedulingChoice[];
  readonly retainedFutureChoices: readonly SchedulingChoice[];
  readonly activeTransitionFacts: readonly TransitionFacts[];
  readonly retainedFutureTransitionFacts: readonly TransitionFacts[];
  readonly runnableThreadIds: readonly ThreadId[];
  readonly executionComplete: boolean;
  readonly invariant: ReservationInvariantStatus;
}

export function deriveUnsafeSessionView(
  session: UnsafeSessionState,
): UnsafeSessionView {
  assertValidUnsafeSession(session);

  const appliedSchedulingChoices = Object.freeze(
    session.schedulerChoices.slice(0, session.cursor),
  );
  const retainedFutureChoices = Object.freeze(
    session.schedulerChoices.slice(session.cursor),
  );
  const activeReplay = replayUnsafeExecution(appliedSchedulingChoices);
  const fullReplay = replayUnsafeExecution(session.schedulerChoices);
  const activeTransitionFacts = Object.freeze(
    activeReplay.steps.map((step) => step.facts),
  );
  const retainedFutureTransitionFacts = Object.freeze(
    fullReplay.steps.slice(session.cursor).map((step) => step.facts),
  );

  return Object.freeze({
    currentExecution: activeReplay.finalState,
    currentStep: session.cursor,
    canBack: session.cursor > 0,
    appliedSchedulingChoices,
    retainedFutureChoices,
    activeTransitionFacts,
    retainedFutureTransitionFacts,
    runnableThreadIds: getRunnableThreadIds(activeReplay.finalState),
    executionComplete: isExecutionComplete(activeReplay.finalState),
    invariant: activeReplay.invariant,
  });
}
