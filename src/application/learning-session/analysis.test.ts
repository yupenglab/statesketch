import { describe, expect, it } from 'vitest';
import {
  replayUnsafeExecution,
  type SchedulingChoice,
} from '../../domain/unsafe-reservation';
import { deriveViolationAnalysis, ViolationAnalysisError } from './analysis';
import {
  CHECKPOINT_ANSWERS,
  deriveCheckpointFeedback,
  type CheckpointAnswer,
} from './checkpoint';
import {
  createLearningSession,
  reduceLearningSession,
  type LearningSessionState,
} from './session';

function start(): LearningSessionState {
  return reduceLearningSession(createLearningSession(), {
    type: 'SUBMIT_PREDICTION',
    prediction: { choice: 'YES', reasoning: 'Both checks may pass.' },
  });
}

function schedule(
  session: LearningSessionState,
  choices: readonly SchedulingChoice[],
): LearningSessionState {
  return choices.reduce(
    (current, threadId) =>
      reduceLearningSession(current, { type: 'SCHEDULE_THREAD', threadId }),
    session,
  );
}

describe('saved unsafe trace', () => {
  it('does not capture a safe execution', () => {
    const state = schedule(start(), ['A', 'A', 'B']);
    expect(state.savedUnsafeTrace).toBeNull();
    expect(state.prediction).toEqual({
      choice: 'YES',
      reasoning: 'Both checks may pass.',
    });
  });

  it('captures the exact first holds-to-violated active prefix immutably', () => {
    let state = start();
    const snapshots: string[] = [];
    for (const threadId of ['A', 'B', 'A', 'B'] as const) {
      snapshots.push(JSON.stringify(state));
      const previous = state;
      state = reduceLearningSession(state, {
        type: 'SCHEDULE_THREAD',
        threadId,
      });
      expect(JSON.stringify(previous)).toBe(snapshots.at(-1));
    }
    expect(state.savedUnsafeTrace).toEqual(['A', 'B', 'A', 'B']);
    expect(Array.isArray(state.savedUnsafeTrace)).toBe(true);
    expect(Object.isFrozen(state.savedUnsafeTrace)).toBe(true);
    expect(replayUnsafeExecution(state.savedUnsafeTrace ?? []).invariant).toBe(
      'VIOLATED',
    );
  });

  it('keeps the first trace through Back, alternate branch, Reset, a safe run and a later violation', () => {
    let state = schedule(start(), ['A', 'B', 'A', 'B']);
    const firstTrace = state.savedUnsafeTrace;
    const prediction = state.prediction;

    state = reduceLearningSession(state, { type: 'BACK' });
    expect(state.savedUnsafeTrace).toBe(firstTrace);
    state = reduceLearningSession(state, { type: 'BACK' });
    state = reduceLearningSession(state, { type: 'BACK' });
    state = reduceLearningSession(state, {
      type: 'SCHEDULE_THREAD',
      threadId: 'A',
    });
    state = reduceLearningSession(state, {
      type: 'SCHEDULE_THREAD',
      threadId: 'B',
    });
    expect(state.unsafeSession.schedulerChoices).toEqual(['A', 'A', 'B']);
    expect(state.savedUnsafeTrace).toBe(firstTrace);

    state = reduceLearningSession(state, { type: 'RESET_RUN' });
    expect(state.savedUnsafeTrace).toBe(firstTrace);
    state = schedule(state, ['A', 'A', 'B']);
    expect(state.savedUnsafeTrace).toBe(firstTrace);
    state = reduceLearningSession(state, { type: 'RESET_RUN' });
    state = schedule(state, ['B', 'A', 'B', 'A']);
    expect(state.savedUnsafeTrace).toBe(firstTrace);
    expect(state.prediction).toBe(prediction);
  });
});

describe('violation analysis', () => {
  it('derives A-first causal facts from replayed saved evidence', () => {
    const analysis = deriveViolationAnalysis(['A', 'B', 'A', 'B']);
    expect(analysis.successfulChecks).toEqual([
      {
        stepNumber: 1,
        threadId: 'A',
        observedSeatsRemaining: 1,
        checkPassed: true,
      },
      {
        stepNumber: 2,
        threadId: 'B',
        observedSeatsRemaining: 1,
        checkPassed: true,
      },
    ]);
    expect(analysis.firstCommit).toEqual({
      stepNumber: 3,
      threadId: 'A',
      observedSeatsRemaining: 1,
      seatsRemainingBefore: 1,
      seatsRemainingAfter: 0,
    });
    expect(analysis.violatingCommit).toEqual({
      stepNumber: 4,
      threadId: 'B',
      observedSeatsRemaining: 1,
      seatsRemainingBefore: 0,
      seatsRemainingAfter: -1,
    });
    expect(analysis.staleObservation).toEqual({
      threadId: 'B',
      firstCommitterId: 'A',
      earlierObservedSeatsRemaining: 1,
      sharedSeatsAfterFirstCommit: 0,
      sharedSeatsBeforeViolatingCommit: 0,
      violatingCommitStep: 4,
    });
    expect(analysis).toMatchObject({
      bothChecksBeforeFirstCommit: true,
      successfulReservations: 2,
      originalSeats: 1,
      finalSeatsRemaining: -1,
    });
  });

  it('derives symmetric B-first identities instead of hard-coding A or B', () => {
    const analysis = deriveViolationAnalysis(['B', 'A', 'B', 'A']);
    expect(analysis.successfulChecks.map(({ threadId }) => threadId)).toEqual([
      'B',
      'A',
    ]);
    expect(analysis.firstCommit).toMatchObject({
      threadId: 'B',
      stepNumber: 3,
    });
    expect(analysis.violatingCommit).toMatchObject({
      threadId: 'A',
      stepNumber: 4,
    });
    expect(analysis.staleObservation).toMatchObject({
      threadId: 'A',
      firstCommitterId: 'B',
    });
    expect(analysis.steps[3]).toMatchObject({
      earlierObservationRetained: true,
      invariantViolatedHere: true,
    });
  });

  it('fails explicitly for safe, illegal and incomplete saved traces', () => {
    expect(() => deriveViolationAnalysis(['A', 'A', 'B'])).toThrow(
      new ViolationAnalysisError(
        'Saved unsafe trace must reproduce an invariant violation.',
      ),
    );
    expect(() => deriveViolationAnalysis(['A', 'A', 'A'])).toThrow(
      'not a legal scheduling sequence',
    );
    expect(() => deriveViolationAnalysis(['A', 'B'])).toThrow(
      'must reproduce an invariant violation',
    );
  });
});

describe('causal checkpoint and analysis progress', () => {
  it.each([
    ['CHECK_ONLY', 'dependent COMMIT separated'],
    [
      'COMMIT_ONLY',
      'Both threads could already have completed successful CHECKs',
    ],
    ['CHECK_TO_COMMIT', 'one uninterrupted logical region'],
    ['UNSURE', 'must not intervene between those two steps'],
  ] as const)('maps %s to concise causal feedback', (answer, evidence) => {
    const feedback = deriveCheckpointFeedback(answer);
    expect(feedback).toContain(evidence);
    expect(feedback).not.toMatch(/wrong|score|point|mutex|lock|block/i);
  });

  it('requires analysis and stores only the latest submitted answer', () => {
    const violating = schedule(start(), ['A', 'B', 'A', 'B']);
    expect(() =>
      reduceLearningSession(violating, {
        type: 'SUBMIT_CHECKPOINT',
        answer: 'CHECK_ONLY',
      }),
    ).toThrow('require violation analysis');
    let state = reduceLearningSession(violating, {
      type: 'ENTER_VIOLATION_ANALYSIS',
    });
    expect(state.phase).toBe('VIOLATION_ANALYSIS');
    for (const answer of CHECKPOINT_ANSWERS) {
      const previous = state;
      const snapshot = JSON.stringify(previous);
      state = reduceLearningSession(state, {
        type: 'SUBMIT_CHECKPOINT',
        answer,
      });
      expect(JSON.stringify(previous)).toBe(snapshot);
      expect(state.checkpointAnswer).toBe(answer);
    }
    expect(Object.keys(state)).toEqual([
      'phase',
      'prediction',
      'unsafeSession',
      'savedUnsafeTrace',
      'checkpointAnswer',
    ]);
    expect(() =>
      reduceLearningSession(state, {
        type: 'SUBMIT_CHECKPOINT',
        answer: '' as CheckpointAnswer,
      }),
    ).toThrow('valid checkpoint answer');
  });

  it('preserves prediction, first trace, checkpoint and analysis after Reset', () => {
    let state = schedule(start(), ['B', 'A', 'B', 'A']);
    state = reduceLearningSession(state, {
      type: 'ENTER_VIOLATION_ANALYSIS',
    });
    state = reduceLearningSession(state, {
      type: 'SUBMIT_CHECKPOINT',
      answer: 'CHECK_TO_COMMIT',
    });
    const previous = state;
    const beforeAnalysis = deriveViolationAnalysis(
      state.savedUnsafeTrace ?? [],
    );
    state = reduceLearningSession(state, { type: 'RESET_RUN' });
    expect(state).toMatchObject({
      phase: 'VIOLATION_ANALYSIS',
      prediction: previous.prediction,
      savedUnsafeTrace: previous.savedUnsafeTrace,
      checkpointAnswer: 'CHECK_TO_COMMIT',
      unsafeSession: { schedulerChoices: [], cursor: 0 },
    });
    expect(state.savedUnsafeTrace).toBe(previous.savedUnsafeTrace);
    expect(deriveViolationAnalysis(state.savedUnsafeTrace ?? [])).toEqual(
      beforeAnalysis,
    );
    expect(JSON.stringify(previous)).not.toBe(JSON.stringify(state));
  });

  it('rejects entering analysis without a valid saved violation', () => {
    expect(() =>
      reduceLearningSession(start(), { type: 'ENTER_VIOLATION_ANALYSIS' }),
    ).toThrow('saved violating trace');
  });
});
