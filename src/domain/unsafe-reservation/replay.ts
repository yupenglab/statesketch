import {
  evaluateReservationInvariant,
  type ReservationInvariantStatus,
} from './invariant';
import {
  createInitialUnsafeState,
  type ExecutionState,
  type SchedulingChoice,
} from './model';
import { advanceUnsafeExecution, type TransitionFacts } from './transition';

export interface ReplayStep {
  readonly schedulingChoice: SchedulingChoice;
  readonly state: ExecutionState;
  readonly facts: TransitionFacts;
  readonly invariant: ReservationInvariantStatus;
}

export interface ReplayResult {
  readonly finalState: ExecutionState;
  readonly steps: readonly ReplayStep[];
  readonly invariant: ReservationInvariantStatus;
}

export function replayUnsafeExecution(
  schedulingChoices: readonly SchedulingChoice[],
): ReplayResult {
  let state = createInitialUnsafeState();
  const steps: ReplayStep[] = [];

  for (const schedulingChoice of schedulingChoices) {
    const transition = advanceUnsafeExecution(state, schedulingChoice);
    state = transition.state;
    steps.push(
      Object.freeze({
        schedulingChoice,
        state,
        facts: transition.facts,
        invariant: evaluateReservationInvariant(state),
      }),
    );
  }

  return Object.freeze({
    finalState: state,
    steps: Object.freeze(steps),
    invariant: evaluateReservationInvariant(state),
  });
}
