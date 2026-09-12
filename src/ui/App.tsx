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
  describeLearningInteraction,
  type LearningSessionView,
} from '../application/learning-session/view';
import { formatAnnouncement, formatStep } from './factual-copy';
import styles from './App.module.css';

const predictionLabels: Record<PredictionChoice, string> = {
  NO: 'No',
  YES: 'Yes',
  UNSURE: "I'm not sure",
};

function focusLabHeading(node: HTMLHeadingElement | null) {
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
          <legend id="prediction-title">
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

export function App() {
  const [session, setSession] = useState(createLearningSession);
  const [announcement, setAnnouncement] = useState('');
  const view = deriveLearningSessionView(session);
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
                <section
                  className={styles.savedPrediction}
                  aria-labelledby="saved-prediction-title"
                >
                  <h3 id="saved-prediction-title">Your prediction</h3>
                  <p>{predictionLabels[session.prediction.choice]}</p>
                  {session.prediction.reasoning && (
                    <p>{session.prediction.reasoning}</p>
                  )}
                </section>
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
