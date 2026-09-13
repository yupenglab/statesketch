import { describe, expect, it } from 'vitest';
import {
  createLearningSession,
  reduceLearningSession,
  type PredictionChoice,
} from './session';
import { deriveLearningSessionView, describeLearningInteraction } from './view';
import { reduceUnsafeSession } from '../unsafe-session';

function start() {
  return reduceLearningSession(createLearningSession(), {
    type: 'SUBMIT_PREDICTION',
    prediction: { choice: 'UNSURE', reasoning: 'Both might read one.' },
  });
}

describe('learning session', () => {
  it('commits semantic prediction on submission without touching the timeline', () => {
    const initial = createLearningSession();
    expect(initial.prediction).toBeNull();
    const next = reduceLearningSession(initial, {
      type: 'SUBMIT_PREDICTION',
      prediction: { choice: 'YES', reasoning: '  Maybe.  ' },
    });
    expect(next.prediction).toEqual({ choice: 'YES', reasoning: 'Maybe.' });
    expect(next.unsafeSession).toBe(initial.unsafeSession);
    expect(initial.prediction).toBeNull();
    expect(Object.isFrozen(next.prediction)).toBe(true);
    expect(Object.keys(next)).toEqual([
      'phase',
      'prediction',
      'unsafeSession',
      'savedUnsafeTrace',
      'checkpointAnswer',
      'synchronizedSession',
    ]);
    expect(next).toMatchObject({
      phase: 'UNSAFE_EXPLORATION',
      savedUnsafeTrace: null,
      checkpointAnswer: null,
    });
  });

  it.each(['NO', 'YES', 'UNSURE'] as const)(
    'accepts %s without reasoning',
    (choice) => {
      expect(
        reduceLearningSession(createLearningSession(), {
          type: 'SUBMIT_PREDICTION',
          prediction: { choice },
        }).prediction,
      ).toEqual({ choice });
    },
  );

  it('rejects invalid choices, premature scheduling, recommitting and long reasoning', () => {
    expect(() =>
      reduceLearningSession(createLearningSession(), {
        type: 'SCHEDULE_THREAD',
        threadId: 'A',
      }),
    ).toThrow('Commit a prediction');
    expect(() =>
      reduceLearningSession(createLearningSession(), {
        type: 'SUBMIT_PREDICTION',
        prediction: { choice: '' as PredictionChoice },
      }),
    ).toThrow('Choose a prediction');
    expect(() =>
      reduceLearningSession(start(), {
        type: 'SUBMIT_PREDICTION',
        prediction: { choice: 'NO' },
      }),
    ).toThrow('already been committed');
    expect(() =>
      reduceLearningSession(createLearningSession(), {
        type: 'SUBMIT_PREDICTION',
        prediction: { choice: 'NO', reasoning: 'x'.repeat(241) },
      }),
    ).toThrow('240');
  });

  it('delegates unsafe actions and preserves prediction and prior snapshots', () => {
    let state = start();
    const prediction = state.prediction;
    const actions = [
      { type: 'SCHEDULE_THREAD', threadId: 'A' },
      { type: 'SCHEDULE_THREAD', threadId: 'B' },
      { type: 'BACK' },
      { type: 'SCHEDULE_THREAD', threadId: 'B' },
      { type: 'BACK' },
      { type: 'SCHEDULE_THREAD', threadId: 'A' },
      { type: 'RESET_RUN' },
    ] as const;
    for (const action of actions) {
      const previous = state;
      const snapshot = JSON.stringify(previous);
      state = reduceLearningSession(previous, action);
      expect(state.unsafeSession).toEqual(
        reduceUnsafeSession(previous.unsafeSession, action),
      );
      expect(state.prediction).toBe(prediction);
      expect(JSON.stringify(previous)).toBe(snapshot);
    }
    expect(state.unsafeSession).toEqual({ schedulerChoices: [], cursor: 0 });
  });

  it('describes only alternate continuation as future replacement', () => {
    let previous = start();
    for (const threadId of ['A', 'B', 'A', 'B'] as const)
      previous = reduceLearningSession(previous, {
        type: 'SCHEDULE_THREAD',
        threadId,
      });
    previous = reduceLearningSession(previous, { type: 'BACK' });
    previous = reduceLearningSession(previous, { type: 'BACK' });
    const same = { type: 'SCHEDULE_THREAD', threadId: 'A' } as const;
    const reused = reduceLearningSession(previous, same);
    expect(reused.unsafeSession.schedulerChoices).toBe(
      previous.unsafeSession.schedulerChoices,
    );
    expect(
      describeLearningInteraction(previous, same, reused).branchPoint,
    ).toBeNull();
    const alternate = { type: 'SCHEDULE_THREAD', threadId: 'B' } as const;
    const branched = reduceLearningSession(previous, alternate);
    expect(
      describeLearningInteraction(previous, alternate, branched).branchPoint,
    ).toBe(2);
    expect(branched.unsafeSession.schedulerChoices).toEqual(['A', 'B', 'B']);
    expect(
      deriveLearningSessionView(branched).retainedFutureTransitionFacts,
    ).toEqual([]);
  });

  it('derives stale observation, next operation and real invariant outcome', () => {
    let state = start();
    for (const threadId of ['A', 'B', 'A'] as const)
      state = reduceLearningSession(state, {
        type: 'SCHEDULE_THREAD',
        threadId,
      });
    const view = deriveLearningSessionView(state);
    expect(view.currentExecution.seatsRemaining).toBe(0);
    expect(view.threads[1]).toMatchObject({
      id: 'B',
      observation: 1,
      nextOperation: 'COMMIT',
      runnable: true,
    });
    expect(view.invariant).toBe('HOLDS');
    state = reduceLearningSession(state, {
      type: 'SCHEDULE_THREAD',
      threadId: 'B',
    });
    expect(deriveLearningSessionView(state)).toMatchObject({
      successfulReservations: 2,
      invariant: 'VIOLATED',
      executionComplete: true,
    });
  });
});
