import {
  countSuccessfulReservations,
  replayUnsafeExecution,
  type CommitTransitionFacts,
  type SchedulingChoice,
  type ThreadId,
  type TransitionFacts,
} from '../../domain/unsafe-reservation';

export type SavedUnsafeTrace = readonly SchedulingChoice[];

export class ViolationAnalysisError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ViolationAnalysisError';
  }
}

export interface SuccessfulCheckEvidence {
  readonly stepNumber: number;
  readonly threadId: ThreadId;
  readonly observedSeatsRemaining: number;
  readonly checkPassed: true;
}

export interface CommitEvidence {
  readonly stepNumber: number;
  readonly threadId: ThreadId;
  readonly observedSeatsRemaining: number;
  readonly seatsRemainingBefore: number;
  readonly seatsRemainingAfter: number;
}

export interface SavedTraceStep {
  readonly stepNumber: number;
  readonly threadId: ThreadId;
  readonly operation: TransitionFacts['operation'];
  readonly successfulCheck: boolean;
  readonly sharedStateChanged: boolean;
  readonly earlierObservationRetained: boolean;
  readonly invariantViolatedHere: boolean;
  readonly observedSeatsRemaining: number;
  readonly seatsRemainingBefore: number;
  readonly seatsRemainingAfter: number;
}

export interface StaleObservationEvidence {
  readonly threadId: ThreadId;
  readonly firstCommitterId: ThreadId;
  readonly earlierObservedSeatsRemaining: number;
  readonly sharedSeatsAfterFirstCommit: number;
  readonly sharedSeatsBeforeViolatingCommit: number;
  readonly violatingCommitStep: number;
}

export interface ViolationAnalysis {
  readonly savedTrace: SavedUnsafeTrace;
  readonly steps: readonly SavedTraceStep[];
  readonly successfulChecks: readonly SuccessfulCheckEvidence[];
  readonly bothChecksBeforeFirstCommit: true;
  readonly firstCommit: CommitEvidence;
  readonly violatingCommit: CommitEvidence;
  readonly staleObservation: StaleObservationEvidence;
  readonly successfulReservations: number;
  readonly originalSeats: number;
  readonly finalSeatsRemaining: number;
}

function commitEvidence(
  stepNumber: number,
  facts: CommitTransitionFacts,
): CommitEvidence {
  return Object.freeze({
    stepNumber,
    threadId: facts.threadId,
    observedSeatsRemaining: facts.checkedSeatsRemaining,
    seatsRemainingBefore: facts.seatsRemainingBefore,
    seatsRemainingAfter: facts.seatsRemainingAfter,
  });
}

export function deriveViolationAnalysis(
  savedTrace: SavedUnsafeTrace,
): ViolationAnalysis {
  let replay;
  try {
    replay = replayUnsafeExecution(savedTrace);
  } catch (error) {
    throw new ViolationAnalysisError(
      'Saved unsafe trace is not a legal scheduling sequence.',
      { cause: error },
    );
  }

  if (replay.invariant !== 'VIOLATED') {
    throw new ViolationAnalysisError(
      'Saved unsafe trace must reproduce an invariant violation.',
    );
  }

  const successfulChecks = replay.steps.flatMap((step, index) =>
    step.facts.operation === 'CHECK' && step.facts.checkPassed
      ? [
          Object.freeze({
            stepNumber: index + 1,
            threadId: step.facts.threadId,
            observedSeatsRemaining: step.facts.observedSeatsRemaining,
            checkPassed: true as const,
          }),
        ]
      : [],
  );
  const commitSteps = replay.steps.flatMap((step, index) =>
    step.facts.operation === 'COMMIT'
      ? [{ stepNumber: index + 1, facts: step.facts }]
      : [],
  );
  const violationStep = commitSteps.find(
    ({ facts }) =>
      facts.invariantBefore === 'HOLDS' && facts.invariantAfter === 'VIOLATED',
  );
  const firstCommitStep = commitSteps[0];

  if (
    successfulChecks.length !== 2 ||
    firstCommitStep === undefined ||
    violationStep === undefined ||
    successfulChecks.some(
      (check) => check.stepNumber >= firstCommitStep.stepNumber,
    )
  ) {
    throw new ViolationAnalysisError(
      'Saved unsafe trace does not contain the expected causal evidence.',
    );
  }

  const firstCommit = commitEvidence(
    firstCommitStep.stepNumber,
    firstCommitStep.facts,
  );
  const violatingCommit = commitEvidence(
    violationStep.stepNumber,
    violationStep.facts,
  );
  const steps = Object.freeze(
    replay.steps.map((step, index) => {
      const facts = step.facts;
      const invariantViolatedHere =
        facts.invariantBefore === 'HOLDS' &&
        facts.invariantAfter === 'VIOLATED';
      return Object.freeze({
        stepNumber: index + 1,
        threadId: facts.threadId,
        operation: facts.operation,
        successfulCheck: facts.operation === 'CHECK' && facts.checkPassed,
        sharedStateChanged: facts.sharedStateChanged,
        earlierObservationRetained:
          invariantViolatedHere && facts.operation === 'COMMIT',
        invariantViolatedHere,
        observedSeatsRemaining:
          facts.operation === 'CHECK'
            ? facts.observedSeatsRemaining
            : facts.checkedSeatsRemaining,
        seatsRemainingBefore: facts.seatsRemainingBefore,
        seatsRemainingAfter: facts.seatsRemainingAfter,
      });
    }),
  );
  const originalSeats = replayUnsafeExecution([]).finalState.seatsRemaining;

  return Object.freeze({
    savedTrace,
    steps,
    successfulChecks: Object.freeze(successfulChecks),
    bothChecksBeforeFirstCommit: true,
    firstCommit,
    violatingCommit,
    staleObservation: Object.freeze({
      threadId: violatingCommit.threadId,
      firstCommitterId: firstCommit.threadId,
      earlierObservedSeatsRemaining: violatingCommit.observedSeatsRemaining,
      sharedSeatsAfterFirstCommit: firstCommit.seatsRemainingAfter,
      sharedSeatsBeforeViolatingCommit: violatingCommit.seatsRemainingBefore,
      violatingCommitStep: violatingCommit.stepNumber,
    }),
    successfulReservations: countSuccessfulReservations(replay.finalState),
    originalSeats,
    finalSeatsRemaining: replay.finalState.seatsRemaining,
  });
}
