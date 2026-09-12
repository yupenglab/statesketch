import {
  createInitialSynchronizedState,
  type SchedulingChoice,
  type SynchronizedExecutionState,
} from './model';
import {
  advanceSynchronizedExecution,
  type SynchronizedTransitionFacts,
} from './transition';
import {
  evaluateReservationInvariant,
  type ReservationInvariantStatus,
} from './invariant';

export interface SynchronizedReplayStep {
  readonly schedulingChoice: SchedulingChoice;
  readonly state: SynchronizedExecutionState;
  readonly facts: SynchronizedTransitionFacts;
  readonly invariant: ReservationInvariantStatus;
}
export interface SynchronizedReplayResult {
  readonly finalState: SynchronizedExecutionState;
  readonly steps: readonly SynchronizedReplayStep[];
  readonly invariant: ReservationInvariantStatus;
}

export function replaySynchronizedExecution(
  choices: readonly SchedulingChoice[],
): SynchronizedReplayResult {
  let state = createInitialSynchronizedState();
  const steps: SynchronizedReplayStep[] = [];
  for (const schedulingChoice of choices) {
    const result = advanceSynchronizedExecution(state, schedulingChoice);
    state = result.state;
    steps.push(
      Object.freeze({
        schedulingChoice,
        state,
        facts: result.facts,
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
