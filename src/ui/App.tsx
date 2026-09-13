import { useState, type FormEvent } from 'react';
import {
  createLearningSession,
  reduceLearningSession,
  type LearningSessionAction,
  type Prediction,
  type PredictionChoice,
} from '../application/learning-session/session';
import {
  deriveLearningSessionView,
  deriveLearningViolationAnalysis,
  describeLearningInteraction,
  type LearningSessionView,
} from '../application/learning-session/view';
import type { ViolationAnalysis } from '../application/learning-session/analysis';
import type { CheckpointAnswer } from '../application/learning-session/checkpoint';
import { formatAnnouncement, formatStep } from './factual-copy';
import styles from './App.module.css';
import { SynchronizedLab } from './SynchronizedLab';
import { FinalComparison, FinalInsight } from './FinalReflection';
import { TeachingModelDisclosure } from './TeachingModelDisclosure';

const predictionLabels: Record<PredictionChoice, string> = {
  NO: 'No',
  YES: 'Yes',
  UNSURE: "I'm not sure",
};

function focusLabHeading(node: HTMLHeadingElement | null) {
  node?.focus();
}

function focusAnalysisHeading(node: HTMLHeadingElement | null) {
  node?.focus();
}

function PredictionForm({
  onSubmit,
}: {
  onSubmit: (prediction: Prediction) => void;
}) {
  const [choice, setChoice] = useState<PredictionChoice | null>(null);
  const [reasoning, setReasoning] = useState('');
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (choice !== null) onSubmit({ choice, reasoning });
  }
  return (
    <section className={styles.prediction} aria-labelledby="prediction-title">
      <p className={styles.eyebrow}>01 / Predict</p>
      <form onSubmit={submit}>
        <fieldset>
          <legend id="prediction-title" tabIndex={-1} ref={focusLabHeading}>
            One seat is left. Thread A and Thread B both try to reserve it.
            Could both reservations succeed?
          </legend>
          <div className={styles.options}>
            {(['NO', 'YES', 'UNSURE'] as const).map((value) => (
              <label key={value} className={styles.option}>
                <input
                  type="radio"
                  name="prediction"
                  value={value}
                  checked={choice === value}
                  onChange={() => setChoice(value)}
                  required
                />
                {predictionLabels[value]}
              </label>
            ))}
          </div>
        </fieldset>
        <label className={styles.reasonLabel} htmlFor="reasoning">
          Optional: What makes you think so?
        </label>
        <textarea
          id="reasoning"
          rows={2}
          maxLength={240}
          value={reasoning}
          onChange={(event) => setReasoning(event.target.value)}
        />
        <div className={styles.startRow}>
          <button
            className={styles.primary}
            type="submit"
            disabled={choice === null}
          >
            Start exploration <span aria-hidden="true">→</span>
          </button>
          <p>Select an option to begin. Reasoning is optional.</p>
        </div>
      </form>
    </section>
  );
}

function ThreadCard({
  thread,
  onRun,
}: {
  thread: LearningSessionView['threads'][number];
  onRun: () => void;
}) {
  return (
    <section className={styles.thread} aria-labelledby={`thread-${thread.id}`}>
      <div className={styles.threadHeading}>
        <h3 id={`thread-${thread.id}`}>Thread {thread.id}</h3>
        <span className={styles.badge}>
          {thread.status === 'RUNNABLE' ? 'Runnable' : 'Finished'}
        </span>
      </div>
      <p className={styles.next}>
        Next: <strong>{thread.nextOperation ?? 'None — finished'}</strong>
      </p>
      <div className={styles.observation}>
        <span className={styles.smallLabel}>Earlier check</span>
        {thread.observation === null ? (
          <p>No check yet</p>
        ) : (
          <>
            <p>Check result: {thread.checkPassed ? 'passed' : 'failed'}</p>
            <p>
              Observed:{' '}
              <strong>
                {thread.observation}{' '}
                {thread.observation === 1 ? 'seat' : 'seats'}
              </strong>
            </p>
          </>
        )}
      </div>
      <p>
        Reservation: <strong>{thread.hasSeat ? 'successful' : 'none'}</strong>
      </p>
      {/* Preserve focus on completion while removing the unavailable control from tab order. */}
      <button
        type="button"
        className={styles.run}
        aria-disabled={!thread.runnable}
        tabIndex={thread.runnable ? 0 : -1}
        aria-label={
          thread.runnable
            ? `Run Thread ${thread.id} next: ${thread.nextOperation}`
            : `Thread ${thread.id} finished`
        }
        onClick={() => {
          if (thread.runnable) onRun();
        }}
      >
        {thread.runnable
          ? `Run ${thread.id} next · ${thread.nextOperation}`
          : `Thread ${thread.id} finished`}
      </button>
    </section>
  );
}

function History({ view }: { view: LearningSessionView }) {
  const facts = [
    ...view.activeTransitionFacts,
    ...view.retainedFutureTransitionFacts,
  ];
  return (
    <section className={styles.history} aria-labelledby="history-title">
      <div className={styles.sectionHeading}>
        <h3 id="history-title">Execution history</h3>
        <span>Step {view.currentStep}</span>
      </div>
      <p className={styles.historyHint}>
        Applied steps and retained future belong to this run.
      </p>
      {view.currentStep === 0 && (
        <p className={styles.initial}>Initial state · Current</p>
      )}
      <ol>
        {facts.map((fact, index) => (
          <li
            key={index}
            className={index >= view.currentStep ? styles.future : undefined}
            aria-current={index + 1 === view.currentStep ? 'step' : undefined}
          >
            <span className={styles.stepNumber}>{index + 1}</span>
            <span>
              Thread {fact.threadId} — {fact.operation}
            </span>
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
  );
}

const checkpointLabels: Readonly<Record<CheckpointAnswer, string>> = {
  CHECK_ONLY: 'CHECK only',
  COMMIT_ONLY: 'COMMIT only',
  CHECK_TO_COMMIT: 'CHECK → COMMIT',
  UNSURE: "I'm not sure",
};

function CausalCheckpoint({
  submittedAnswer,
  feedback,
  onSubmit,
}: {
  submittedAnswer: CheckpointAnswer | null;
  feedback: string | null;
  onSubmit: (answer: CheckpointAnswer) => void;
}) {
  const [choice, setChoice] = useState<CheckpointAnswer | null>(
    submittedAnswer,
  );

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (choice !== null) onSubmit(choice);
  }

  return (
    <section className={styles.checkpoint} aria-labelledby="checkpoint-title">
      <p className={styles.eyebrow}>Causal checkpoint</p>
      <form onSubmit={submit}>
        <fieldset>
          <legend id="checkpoint-title">
            Which part must another reservation attempt not interrupt?
          </legend>
          <div className={styles.checkpointOptions}>
            {(Object.keys(checkpointLabels) as CheckpointAnswer[]).map(
              (answer) => (
                <label key={answer} className={styles.checkpointOption}>
                  <input
                    type="radio"
                    name="checkpoint"
                    checked={choice === answer}
                    onChange={() => setChoice(answer)}
                  />
                  {checkpointLabels[answer]}
                </label>
              ),
            )}
          </div>
        </fieldset>
        <button
          type="submit"
          className={styles.primary}
          disabled={choice === null}
        >
          Check my reasoning
        </button>
      </form>
      {feedback !== null && (
        <div className={styles.feedback} aria-labelledby="feedback-title">
          <h3 id="feedback-title">Feedback on your latest answer</h3>
          <p>{feedback}</p>
          <p className={styles.feedbackHint}>
            You can change your choice and check it again.
          </p>
        </div>
      )}
    </section>
  );
}

function ViolationAnalysisView({
  analysis,
  view,
  prediction,
  checkpointAnswer,
  onAction,
}: {
  analysis: ViolationAnalysis;
  view: LearningSessionView;
  prediction: Prediction;
  checkpointAnswer: CheckpointAnswer | null;
  onAction: (action: LearningSessionAction) => void;
}) {
  const stale = analysis.staleObservation;
  return (
    <section className={styles.analysis} aria-labelledby="analysis-title">
      <header className={styles.analysisHeader}>
        <p className={styles.eyebrow}>02 / Explain</p>
        <h2 id="analysis-title" tabIndex={-1} ref={focusAnalysisHeading}>
          Violation analysis
        </h2>
        <p className={styles.analysisLead}>
          Two reservations succeeded for {analysis.originalSeats} original seat.
          The invariant was violated.
        </p>
      </header>

      <div className={styles.analysisGrid}>
        <section
          className={styles.tracePanel}
          aria-labelledby="saved-trace-title"
        >
          <div className={styles.sectionHeading}>
            <h3 id="saved-trace-title">What happened</h3>
            <span>Saved first violation</span>
          </div>
          <p className={styles.historyHint}>
            Ordered evidence replayed from your saved execution.
          </p>
          <ol
            className={styles.causalTrace}
            aria-label="Saved violating execution"
          >
            {analysis.steps.map((step) => (
              <li key={step.stepNumber}>
                <span className={styles.stepNumber}>{step.stepNumber}</span>
                <div>
                  <strong>
                    Thread {step.threadId} — {step.operation}
                  </strong>
                  {step.successfulCheck && (
                    <p>
                      Successful CHECK · observed {step.observedSeatsRemaining}{' '}
                      seat
                    </p>
                  )}
                  {step.sharedStateChanged && (
                    <p>
                      Shared seats: {step.seatsRemainingBefore} →{' '}
                      {step.seatsRemainingAfter}
                    </p>
                  )}
                  {step.earlierObservationRetained && (
                    <p>
                      Earlier observation retained:{' '}
                      {step.observedSeatsRemaining} seat
                    </p>
                  )}
                  {step.invariantViolatedHere && <p>Invariant violated here</p>}
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section
          className={styles.evidencePanel}
          aria-labelledby="evidence-title"
        >
          <p className={styles.eyebrow}>Critical evidence</p>
          <h3 id="evidence-title">
            An earlier result met a later shared state
          </h3>
          <dl className={styles.evidenceList}>
            <div>
              <dt>Both successful checks</dt>
              <dd>
                Steps{' '}
                {analysis.successfulChecks
                  .map((check) => check.stepNumber)
                  .join(' and ')}
                , before the first COMMIT
              </dd>
            </div>
            <div>
              <dt>First COMMIT</dt>
              <dd>
                Thread {analysis.firstCommit.threadId}, step{' '}
                {analysis.firstCommit.stepNumber}:{' '}
                {analysis.firstCommit.seatsRemainingBefore} →{' '}
                {analysis.firstCommit.seatsRemainingAfter}
              </dd>
            </div>
            <div>
              <dt>Violating COMMIT</dt>
              <dd>
                Thread {analysis.violatingCommit.threadId}, step{' '}
                {analysis.violatingCommit.stepNumber}:{' '}
                {analysis.violatingCommit.seatsRemainingBefore} →{' '}
                {analysis.violatingCommit.seatsRemainingAfter}
              </dd>
            </div>
          </dl>
          <div className={styles.staleEvidence}>
            <h3>Earlier observation versus shared state</h3>
            <p>
              Thread {stale.threadId}&apos;s earlier CHECK saw{' '}
              <strong>{stale.earlierObservedSeatsRemaining} seat</strong> and
              passed. After Thread {stale.firstCommitterId} committed, the
              shared value became{' '}
              <strong>{stale.sharedSeatsAfterFirstCommit}</strong>, but Thread{' '}
              {stale.threadId}&apos;s earlier observation remained the result
              its next COMMIT depended on.
            </p>
          </div>
          <div className={styles.causalSummary}>
            <h3>Causal summary</h3>
            <p>
              Both reservation attempts completed a successful CHECK before
              either conflicting reservation had finished. The later COMMIT
              therefore acted on an earlier successful observation.
            </p>
          </div>
        </section>
      </div>

      <section
        className={styles.predictionReflection}
        aria-labelledby="analysis-prediction-title"
      >
        <p className={styles.eyebrow}>Reflection</p>
        <h3 id="analysis-prediction-title">Your initial prediction</h3>
        <p>{predictionLabels[prediction.choice]}</p>
        {prediction.reasoning && <p>{prediction.reasoning}</p>}
      </section>

      <CausalCheckpoint
        submittedAnswer={checkpointAnswer}
        feedback={view.checkpointFeedback}
        onSubmit={(answer) => onAction({ type: 'SUBMIT_CHECKPOINT', answer })}
      />

      {view.canEnterSynchronized && (
        <div className={styles.startRow}>
          <button
            type="button"
            className={styles.primary}
            onClick={() => onAction({ type: 'ENTER_SYNCHRONIZED_EXPLORATION' })}
          >
            Try the synchronized version
          </button>
          <p>
            Your prediction, saved unsafe evidence and latest checkpoint answer
            stay with you.
          </p>
        </div>
      )}

      <section
        className={styles.activeRunTools}
        aria-labelledby="active-run-title"
      >
        <div>
          <h3 id="active-run-title">Current run controls</h3>
          <p>
            These controls affect the active timeline. The saved evidence above
            stays frozen.
          </p>
        </div>
        <div className={styles.tools}>
          <button
            type="button"
            disabled={!view.canBack}
            onClick={() => onAction({ type: 'BACK' })}
          >
            Back active run
          </button>
          <button type="button" onClick={() => onAction({ type: 'RESET_RUN' })}>
            Reset current run
          </button>
        </div>
      </section>
    </section>
  );
}

export function App() {
  const [session, setSession] = useState(createLearningSession);
  const [announcement, setAnnouncement] = useState('');
  const view = deriveLearningSessionView(session);
  const analysis =
    session.phase === 'VIOLATION_ANALYSIS'
      ? deriveLearningViolationAnalysis(session)
      : null;
  const lastStep = view.activeTransitionFacts.at(-1);
  function dispatch(action: LearningSessionAction) {
    const next = reduceLearningSession(session, action);
    setAnnouncement(
      formatAnnouncement(describeLearningInteraction(session, action, next)),
    );
    setSession(next);
  }
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <span className={styles.brand}>
          StateSketch<span aria-hidden="true">↗</span>
        </span>
        <span className={styles.edition}>CONCURRENCY LAB / PRE-ALPHA</span>
      </header>
      <main>
        <div className={styles.scenario}>
          <p className={styles.eyebrow}>Last seat reservation / 01</p>
          <h1>Last Seat Reservation</h1>
          <p>
            <strong>1 seat is left.</strong> Thread A and Thread B both try to
            reserve it.
          </p>
          <p>You will choose which thread runs next.</p>
        </div>
        {session.prediction === null ? (
          <PredictionForm
            onSubmit={(prediction) =>
              dispatch({ type: 'SUBMIT_PREDICTION', prediction })
            }
          />
        ) : session.phase === 'SYNCHRONIZED_EXPLORATION' &&
          view.synchronized !== null ? (
          <SynchronizedLab
            view={view.synchronized}
            canCompare={view.canEnterFinalComparison}
            onAction={dispatch}
          />
        ) : session.phase === 'FINAL_COMPARISON' && view.comparison !== null ? (
          <FinalComparison view={view.comparison} onAction={dispatch} />
        ) : session.phase === 'FINAL_INSIGHT' && view.comparison !== null ? (
          <FinalInsight
            prediction={session.prediction}
            comparison={view.comparison}
            onAction={dispatch}
          />
        ) : analysis !== null ? (
          <ViolationAnalysisView
            analysis={analysis}
            view={view}
            checkpointAnswer={session.checkpointAnswer}
            prediction={session.prediction}
            onAction={dispatch}
          />
        ) : (
          <>
            <div className={styles.labHeader}>
              <h2 tabIndex={-1} ref={focusLabHeading}>
                Unsafe exploration
              </h2>
              <span className={styles.stepCounter}>
                Step {view.currentStep}
                {view.executionComplete ? ' · Run complete' : ''}
              </span>
            </div>
            <div className={styles.lab}>
              <section className={styles.state} aria-labelledby="state-title">
                <p className={styles.eyebrow}>State</p>
                <h3 id="state-title">Current shared state</h3>
                <p className={styles.seats}>
                  <strong>{view.currentExecution.seatsRemaining}</strong>
                  <span>seats remaining</span>
                </p>
                <div
                  className={
                    view.invariant === 'HOLDS'
                      ? styles.invariant
                      : styles.violated
                  }
                >
                  <h4>
                    {view.invariant === 'HOLDS'
                      ? 'Invariant holds'
                      : 'Invariant violated'}
                  </h4>
                  <p>
                    {view.successfulReservations} successful{' '}
                    {view.successfulReservations === 1
                      ? 'reservation'
                      : 'reservations'}
                  </p>
                  <p>1 original seat</p>
                </div>
              </section>
              <section
                className={styles.control}
                aria-labelledby="control-title"
              >
                <p className={styles.eyebrow}>Control</p>
                <h3 id="control-title">Choose the next thread</h3>
                <p className={styles.hint}>One action runs one operation.</p>
                <TeachingModelDisclosure />
                <div className={styles.threads}>
                  {view.threads.map((thread) => (
                    <ThreadCard
                      key={thread.id}
                      thread={thread}
                      onRun={() =>
                        dispatch({
                          type: 'SCHEDULE_THREAD',
                          threadId: thread.id,
                        })
                      }
                    />
                  ))}
                </div>
                <div className={styles.tools}>
                  <button
                    type="button"
                    disabled={!view.canBack}
                    aria-label="Go back one execution step"
                    onClick={() => dispatch({ type: 'BACK' })}
                  >
                    ← Back one step
                  </button>
                  <button
                    type="button"
                    onClick={() => dispatch({ type: 'RESET_RUN' })}
                  >
                    Reset run
                  </button>
                </div>
                {view.canAnalyzeViolation && (
                  <div className={styles.analysisEntry}>
                    <p>
                      The first violating execution is saved for causal review.
                    </p>
                    <button
                      type="button"
                      className={styles.primary}
                      onClick={() =>
                        dispatch({ type: 'ENTER_VIOLATION_ANALYSIS' })
                      }
                    >
                      Analyze this result <span aria-hidden="true">→</span>
                    </button>
                  </div>
                )}
              </section>
              <section
                className={styles.reasoning}
                aria-labelledby="reasoning-title"
              >
                <p className={styles.eyebrow}>Reasoning</p>
                <h3 id="reasoning-title">Last step</h3>
                <p className={styles.lastStep}>
                  {lastStep
                    ? formatStep(lastStep)
                    : 'No execution steps yet. Choose a thread to begin.'}
                </p>
                <History view={view} />
              </section>
            </div>
          </>
        )}
        <p
          className={styles.announcement}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {announcement}
        </p>
      </main>
      <footer className={styles.footer}>
        A conceptual model. Each step is a pedagogical operation, not a CPU
        instruction.
      </footer>
    </div>
  );
}
