import { deriveViolationAnalysis, type SavedUnsafeTrace } from './analysis';
import {
  deriveSynchronizedSessionView,
  type SynchronizedSessionState,
} from '../synchronized-session';
import type { SynchronizedTransitionFacts } from '../../domain/synchronized-reservation';

export function deriveComparisonView(
  savedUnsafeTrace: SavedUnsafeTrace | null,
  synchronizedSession: SynchronizedSessionState | null,
) {
  if (savedUnsafeTrace === null || synchronizedSession === null)
    throw new Error('Comparison requires both execution sources.');
  const unsafe = deriveViolationAnalysis(savedUnsafeTrace);
  const synchronized = deriveSynchronizedSessionView(synchronizedSession);
  if (!synchronized.executionComplete || !synchronized.hasBlockedLockAttempt)
    throw new Error(
      'Comparison requires a completed synchronized run with a real blocked LOCK.',
    );
  const steps = synchronized.activeTransitionFacts.map((facts, index) =>
    Object.freeze({ stepNumber: index + 1, facts }),
  );
  const blocked = steps.find(
    ({ facts }) => facts.operation === 'LOCK' && facts.outcome === 'BLOCKED',
  );
  if (
    !blocked ||
    blocked.facts.operation !== 'LOCK' ||
    blocked.facts.outcome !== 'BLOCKED'
  )
    throw new Error('Missing blocked evidence.');
  const owner = blocked.facts.blockingOwner;
  const contender = blocked.facts.threadId;
  function milestone(
    predicate: (facts: SynchronizedTransitionFacts, step: number) => boolean,
  ) {
    const found = steps.find(({ facts, stepNumber }) =>
      predicate(facts, stepNumber),
    );
    if (!found) throw new Error('Incomplete synchronized causal evidence.');
    return found;
  }
  const acquisition = milestone(
    (f) =>
      f.operation === 'LOCK' &&
      f.outcome === 'ACQUIRED' &&
      f.threadId === owner,
  );
  const ownerCheck = milestone(
    (f) => f.operation === 'CHECK' && f.checkPassed && f.threadId === owner,
  );
  const commit = milestone(
    (f) => f.operation === 'COMMIT' && f.threadId === owner,
  );
  const release = milestone(
    (f) =>
      f.operation === 'UNLOCK' &&
      f.releasedBy === owner &&
      f.madeRunnableThreadId === contender,
  );
  const reacquisition = milestone(
    (f, step) =>
      step > release.stepNumber &&
      f.operation === 'LOCK' &&
      f.outcome === 'ACQUIRED' &&
      f.threadId === contender,
  );
  const failedCheck = milestone(
    (f) =>
      f.operation === 'CHECK' && !f.checkPassed && f.threadId === contender,
  );
  const contenderRelease = milestone(
    (f) => f.operation === 'UNLOCK' && f.threadId === contender,
  );
  return Object.freeze({
    unsafe,
    synchronized,
    roles: Object.freeze({
      unsafeFirstCommitter: unsafe.firstCommit.threadId,
      unsafeViolatingCommitter: unsafe.violatingCommit.threadId,
      synchronizedWinner: commit.facts.threadId,
      blockingOwner: owner,
      blockedContender: contender,
      laterFailedChecker: failedCheck.facts.threadId,
    }),
    milestones: Object.freeze({
      acquisition,
      blocked,
      ownerCheck,
      commit,
      release,
      reacquisition,
      failedCheck,
      contenderRelease,
    }),
    synchronizedSteps: Object.freeze(steps),
  });
}
export type ComparisonView = ReturnType<typeof deriveComparisonView>;
