import type { SynchronizedSessionView } from '../application/synchronized-session';
import type { LearningSessionAction } from '../application/learning-session/session';
import { formatSynchronizedStep } from './factual-copy';
import styles from './App.module.css';

function focusHeading(node: HTMLHeadingElement | null) {
  node?.focus();
}

export function SynchronizedLab({
  view,
  canCompare,
  onAction,
}: {
  view: SynchronizedSessionView;
  canCompare: boolean;
  onAction: (action: LearningSessionAction) => void;
}) {
  const last = view.activeTransitionFacts.at(-1);
  const history = [
    ...view.activeTransitionFacts,
    ...view.retainedFutureTransitionFacts,
  ];
  return (
    <section className={styles.synchronized} aria-labelledby="sync-title">
      <header className={styles.labHeader}>
        <h2 id="sync-title" tabIndex={-1} ref={focusHeading}>
          Synchronized exploration
        </h2>
        <span className={styles.stepCounter}>
          Step {view.currentStep}
          {view.executionComplete ? ' · Run complete' : ''}
        </span>
      </header>
      <p>
        The scenario and reservation goal are unchanged. Both reservation
        attempts use the same mutex around CHECK → dependent COMMIT. Choose one
        thread to run one operation.
      </p>
      <div className={styles.lab}>
        <section className={styles.state} aria-labelledby="sync-state-title">
          <p className={styles.eyebrow}>State</p>
          <h3 id="sync-state-title">Current shared state</h3>
          <p className={styles.seats}>
            <strong>{view.currentExecution.seatsRemaining}</strong>
            <span>seats remaining</span>
          </p>
          <div className={styles.invariant}>
            <h4>
              Invariant {view.invariant === 'HOLDS' ? 'holds' : 'violated'}
            </h4>
            <p>{view.successfulReservations} successful reservations</p>
            <p>1 original seat</p>
          </div>
          <p className={styles.mutex}>
            Mutex:{' '}
            <strong>
              {view.mutexOwner === null
                ? 'free'
                : `owned by Thread ${view.mutexOwner}`}
            </strong>
          </p>
        </section>
        <section
          className={styles.control}
          aria-labelledby="sync-control-title"
        >
          <p className={styles.eyebrow}>Control</p>
          <h3 id="sync-control-title">Choose the next thread</h3>
          <p className={styles.hint}>
            LOCK, CHECK, COMMIT and UNLOCK are separate operations. A contended
            LOCK is a real step.
          </p>
          <div className={styles.threads}>
            {view.threads.map((thread) => (
              <section
                className={styles.thread}
                key={thread.id}
                aria-labelledby={`sync-thread-${thread.id}`}
              >
                <div className={styles.threadHeading}>
                  <h3 id={`sync-thread-${thread.id}`}>Thread {thread.id}</h3>
                  <span className={styles.badge}>{thread.status}</span>
                </div>
                <p className={styles.next}>
                  Next:{' '}
                  <strong>
                    {thread.status === 'BLOCKED'
                      ? `${thread.nextOperation} when runnable`
                      : (thread.nextOperation ?? 'None — finished')}
                  </strong>
                </p>
                {thread.status === 'BLOCKED' && (
                  <p id={`blocked-${thread.id}`}>
                    Waiting for the mutex held by Thread {thread.blockingOwner}.
                    Thread {thread.id} has not performed CHECK.
                  </p>
                )}
                <div className={styles.observation}>
                  <span className={styles.smallLabel}>Earlier check</span>
                  {thread.observation === null ? (
                    <p>No check yet · no observation</p>
                  ) : (
                    <>
                      <p>Observed: {thread.observation} seats</p>
                      <p>
                        Check result: {thread.checkPassed ? 'passed' : 'failed'}
                      </p>
                    </>
                  )}
                </div>
                <p>
                  Reservation:{' '}
                  <strong>{thread.hasSeat ? 'successful' : 'none'}</strong>
                </p>
                <button
                  type="button"
                  className={styles.run}
                  aria-disabled={!thread.runnable}
                  tabIndex={thread.runnable ? 0 : -1}
                  aria-describedby={
                    thread.status === 'BLOCKED'
                      ? `blocked-${thread.id}`
                      : undefined
                  }
                  aria-label={
                    thread.runnable
                      ? `Run Thread ${thread.id} next: ${thread.nextOperation}`
                      : `Thread ${thread.id} ${thread.status === 'BLOCKED' ? 'blocked' : 'finished'}`
                  }
                  onClick={() => {
                    if (thread.runnable)
                      onAction({
                        type: 'SCHEDULE_SYNCHRONIZED_THREAD',
                        threadId: thread.id,
                      });
                  }}
                >
                  {thread.runnable
                    ? `Run ${thread.id} next · ${thread.nextOperation}`
                    : `Thread ${thread.id} ${thread.status === 'BLOCKED' ? 'blocked' : 'finished'}`}
                </button>
              </section>
            ))}
          </div>
          <div className={styles.tools}>
            <button
              type="button"
              disabled={!view.canBack}
              onClick={() => onAction({ type: 'BACK_SYNCHRONIZED' })}
            >
              Back one synchronized step
            </button>
            <button
              type="button"
              onClick={() => onAction({ type: 'RESET_SYNCHRONIZED_RUN' })}
            >
              Reset synchronized run
            </button>
          </div>
          {view.executionComplete && !view.hasBlockedLockAttempt && (
            <div className={styles.causalSummary}>
              <h3>Safe execution, no contention observed</h3>
              <p>
                This run is valid and the invariant holds. To compare the causal
                difference, use Back or Reset synchronized run, then try the
                other thread while the mutex is held. A real blocked LOCK must
                appear in your active execution.
              </p>
            </div>
          )}
          <div className={styles.startRow}>
            {canCompare && (
              <button
                type="button"
                className={styles.primary}
                onClick={() => onAction({ type: 'ENTER_FINAL_COMPARISON' })}
              >
                Compare executions
              </button>
            )}
            <p>
              Requires a completed run with a real blocked LOCK and your saved
              unsafe evidence.
            </p>
          </div>
        </section>
        <section className={styles.reasoning} aria-labelledby="sync-last-title">
          <p className={styles.eyebrow}>Reasoning</p>
          <h3 id="sync-last-title">Last step</h3>
          <p className={styles.lastStep}>
            {last
              ? formatSynchronizedStep(last)
              : 'No execution steps yet. The mutex is free; both threads begin at LOCK.'}
          </p>
          <section
            className={styles.history}
            aria-labelledby="sync-history-title"
          >
            <div className={styles.sectionHeading}>
              <h3 id="sync-history-title">Synchronized execution history</h3>
              <span>Step {view.currentStep}</span>
            </div>
            <p className={styles.historyHint}>
              Back retains the future. Repeating its next choice reuses it;
              choosing another legal thread replaces it.
            </p>
            {view.currentStep === 0 && (
              <p className={styles.initial}>Initial state · Current</p>
            )}
            <ol>
              {history.map((fact, index) => (
                <li
                  key={index}
                  className={
                    index >= view.currentStep ? styles.future : undefined
                  }
                  aria-current={
                    index + 1 === view.currentStep ? 'step' : undefined
                  }
                >
                  <span className={styles.stepNumber}>{index + 1}</span>
                  <span>{formatSynchronizedStep(fact)}</span>
                  <span className={styles.historyLabel}>
                    {index >= view.currentStep
                      ? 'Previous future'
                      : index + 1 === view.currentStep
                        ? 'Applied · Current'
                        : 'Applied'}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </section>
      </div>
    </section>
  );
}
