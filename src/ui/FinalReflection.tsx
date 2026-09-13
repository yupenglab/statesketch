import type { ComparisonView } from '../application/learning-session/comparison';
import type {
  LearningSessionAction,
  Prediction,
} from '../application/learning-session/session';
import { formatSynchronizedStep } from './factual-copy';
import styles from './App.module.css';

function focusHeading(node: HTMLHeadingElement | null) {
  node?.focus();
}
type Dispatch = (action: LearningSessionAction) => void;
const milestoneLabels: Record<keyof ComparisonView['milestones'], string> = {
  acquisition: 'Owner acquires the mutex',
  blocked: 'Contender is blocked before CHECK',
  ownerCheck: 'Owner checks inside the region',
  commit: 'Owner commits inside the region',
  release: 'Owner releases; waiter becomes runnable',
  reacquisition: 'Contender explicitly acquires the mutex',
  failedCheck: 'Contender checks updated shared state',
  contenderRelease: 'Contender releases without reserving',
};

export function FinalComparison({
  view,
  onAction,
}: {
  view: ComparisonView;
  onAction: Dispatch;
}) {
  return (
    <section className={styles.analysis} aria-labelledby="compare-title">
      <header className={styles.analysisHeader}>
        <p className={styles.eyebrow}>04 / Compare</p>
        <h2 id="compare-title" tabIndex={-1} ref={focusHeading}>
          Compare executions
        </h2>
        <p className={styles.analysisLead}>
          Same reservation rule. Different reachable interleavings.
        </p>
      </header>
      <p>
        Both executions use Last Seat Reservation, one original seat, two
        reservation attempts, and the same CHECK / dependent COMMIT logic. The
        synchronized execution adds coordination through the same mutex around
        that logical region.
      </p>
      <p>
        Read by causal role, not matching step numbers. Thread identities may
        differ between runs. Step numbers refer only to their own source
        execution.
      </p>
      <div className={styles.comparisonGrid}>
        <section
          className={styles.tracePanel}
          aria-labelledby="compare-unsafe-title"
        >
          <p className={styles.eyebrow}>Saved first violation</p>
          <h3 id="compare-unsafe-title">Unsafe execution</h3>
          <ol className={styles.causalTrace}>
            {view.unsafe.steps.map((step) => (
              <li key={step.stepNumber}>
                <span className={styles.stepNumber}>{step.stepNumber}</span>
                <div>
                  <strong>
                    Thread {step.threadId} — {step.operation}
                  </strong>
                  <p>
                    {step.successfulCheck
                      ? `Successful CHECK observed ${step.observedSeatsRemaining} seat before either COMMIT.`
                      : `Shared seats: ${step.seatsRemainingBefore} → ${step.seatsRemainingAfter}. COMMIT depends on the earlier successful CHECK.`}
                  </p>
                  {step.invariantViolatedHere && (
                    <p>
                      Violating COMMIT · earlier observation retained ·
                      invariant violated.
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
          <p>
            First committer: Thread {view.roles.unsafeFirstCommitter}. Violating
            committer: Thread {view.roles.unsafeViolatingCommitter}.
          </p>
          <div className={styles.staleEvidence}>
            <h3>Earlier observation, changed shared state</h3>
            <p>
              Thread {view.unsafe.staleObservation.threadId} observed{' '}
              {view.unsafe.staleObservation.earlierObservedSeatsRemaining} seat.
              After Thread {view.unsafe.staleObservation.firstCommitterId}{' '}
              committed, shared seats became{' '}
              {view.unsafe.staleObservation.sharedSeatsAfterFirstCommit}. Its
              later COMMIT still depended on the earlier successful CHECK.
            </p>
          </div>
          <p>
            {view.unsafe.successfulReservations} successful reservations /{' '}
            {view.unsafe.originalSeats} original seat. Invariant violated.
          </p>
        </section>
        <section
          className={styles.evidencePanel}
          aria-labelledby="compare-sync-title"
        >
          <p className={styles.eyebrow}>
            Current completed execution · read only
          </p>
          <h3 id="compare-sync-title">Synchronized execution</h3>
          <dl className={styles.milestones}>
            {(
              Object.keys(milestoneLabels) as (keyof typeof milestoneLabels)[]
            ).map((key) => (
              <div key={key}>
                <dt>{milestoneLabels[key]}</dt>
                <dd>
                  Source step {view.milestones[key].stepNumber}:{' '}
                  {formatSynchronizedStep(view.milestones[key].facts)}
                </dd>
              </div>
            ))}
          </dl>
          <p>
            {view.synchronized.successfulReservations} successful reservation /{' '}
            {view.unsafe.originalSeats} original seat. Invariant preserved.
          </p>
          <details>
            <summary>Show full synchronized trace in execution order</summary>
            <ol>
              {view.synchronizedSteps.map((step) => (
                <li key={step.stepNumber}>
                  {formatSynchronizedStep(step.facts)}
                </li>
              ))}
            </ol>
          </details>
        </section>
      </div>
      <section
        className={styles.causalSummary}
        aria-labelledby="difference-title"
      >
        <h3 id="difference-title">Key causal difference</h3>
        <p>
          Unsafe: both attempts reached a successful CHECK before the first
          COMMIT. Synchronized: Thread {view.roles.blockedContender} tried LOCK
          while Thread {view.roles.blockingOwner} owned the mutex and was
          blocked before CHECK. Only after release and its own LOCK could Thread{' '}
          {view.roles.laterFailedChecker} CHECK the updated value, zero, and
          fail without COMMIT.
        </p>
      </section>
      <div className={styles.startRow}>
        <button
          type="button"
          className={styles.primary}
          onClick={() => onAction({ type: 'ENTER_FINAL_INSIGHT' })}
        >
          Continue to final insight
        </button>
      </div>
    </section>
  );
}

export function FinalInsight({
  prediction,
  comparison,
  onAction,
}: {
  prediction: Prediction;
  comparison: ComparisonView;
  onAction: Dispatch;
}) {
  const labels = { NO: 'No', YES: 'Yes', UNSURE: "I'm not sure" };
  return (
    <section className={styles.analysis} aria-labelledby="insight-title">
      <header className={styles.analysisHeader}>
        <p className={styles.eyebrow}>05 / Reflect</p>
        <h2 id="insight-title" tabIndex={-1} ref={focusHeading}>
          Final insight
        </h2>
        <p className={styles.analysisLead}>
          Synchronization changes which interleavings are reachable.
        </p>
      </header>
      <div className={styles.comparisonGrid}>
        <section
          className={styles.tracePanel}
          aria-labelledby="reflection-title"
        >
          <h3 id="reflection-title">Your initial prediction</h3>
          <p>Could both reservations succeed?</p>
          <p className={styles.reflection}>{labels[prediction.choice]}</p>
          {prediction.reasoning && (
            <blockquote className={styles.reflection}>
              {prediction.reasoning}
            </blockquote>
          )}
          <p>
            What would you explain differently now, after seeing both
            executions?
          </p>
        </section>
        <section
          className={styles.evidencePanel}
          aria-labelledby="region-title"
        >
          <h3 id="region-title">Protect CHECK → dependent COMMIT</h3>
          <p>
            In your unsafe execution, Threads{' '}
            {comparison.unsafe.successfulChecks
              .map((check) => check.threadId)
              .join(' and ')}{' '}
            both completed successful CHECKs before the first COMMIT. Thread{' '}
            {comparison.roles.unsafeViolatingCommitter}&apos;s later COMMIT
            depended on that earlier observation. In your synchronized
            execution, Thread {comparison.roles.blockedContender} was blocked
            before CHECK by Thread {comparison.roles.blockingOwner}.
          </p>
          <p>
            The mutex did not change the meaning of CHECK or COMMIT. It changed
            the reachable interleavings.
          </p>
          <p>
            Both reservation attempts coordinate using the same mutex around the
            CHECK and the dependent COMMIT. While one owns it, a competing
            attempt is blocked before CHECK. After release, the contender must
            acquire the mutex itself, then CHECK the updated shared state.
          </p>
          <p>
            In this model, the logical region is CHECK → dependent COMMIT, not
            either operation alone. A failed CHECK makes no reservation and
            proceeds to UNLOCK.
          </p>
        </section>
      </div>
      <section className={styles.causalSummary} aria-labelledby="limits-title">
        <h3 id="limits-title">What this model does—and does not—show</h3>
        <ul>
          <li>
            Each step is a conceptual pedagogical operation, not a CPU
            instruction.
          </li>
          <li>
            Learner-controlled scheduling is not a full operating-system
            scheduler; concurrency is not identical to parallel execution.
          </li>
          <li>
            Sequential consistency is a teaching simplification, not a claim
            about all real systems.
          </li>
          <li>
            A mutex does not magically own or protect a variable. The
            participating attempts must coordinate using the same mutex around
            the relevant logical region.
          </li>
          <li>
            This race-condition lesson does not model C or C++ data-race or
            memory-model semantics.
          </li>
        </ul>
      </section>
      <div className={styles.startRow}>
        <button type="button" onClick={() => onAction({ type: 'START_OVER' })}>
          Start over
        </button>
        <p>
          Clear your prediction, both executions, saved evidence and checkpoint.
          Begin a fresh learning session.
        </p>
      </div>
    </section>
  );
}
