import { describe, expect, it } from 'vitest';
import {
  createLearningSession as initial,
  reduceLearningSession as reduce,
  type LearningSessionState,
  type LearningSessionAction,
} from './session';
import { CHECKPOINT_ANSWERS } from './checkpoint';
import { deriveLearningSessionView as view } from './view';
import { deriveComparisonView as compare } from './comparison';
import { deriveSynchronizedSessionView } from '../synchronized-session';
import type { ThreadId } from '../../domain/synchronized-reservation';

function analysis(first: ThreadId = 'A') {
  const other: ThreadId = first === 'A' ? 'B' : 'A';
  let state = reduce(initial(), {
    type: 'SUBMIT_PREDICTION',
    prediction: { choice: 'UNSURE', reasoning: 'Two checks might overlap.' },
  });
  for (const threadId of [first, other, first, other])
    state = reduce(state, { type: 'SCHEDULE_THREAD', threadId });
  return reduce(state, { type: 'ENTER_VIOLATION_ANALYSIS' });
}
function ready(first: ThreadId = 'A') {
  return reduce(
    reduce(analysis(first), {
      type: 'SUBMIT_CHECKPOINT',
      answer: 'COMMIT_ONLY',
    }),
    { type: 'ENTER_SYNCHRONIZED_EXPLORATION' },
  );
}
function schedule(state: LearningSessionState, choices: readonly ThreadId[]) {
  return choices.reduce(
    (s, threadId) =>
      reduce(s, { type: 'SCHEDULE_SYNCHRONIZED_THREAD', threadId }),
    state,
  );
}
const blockedChoices = ['A', 'B', 'A', 'A', 'A', 'B', 'B', 'B'] as const;
describe('learning session synchronized lifecycle and compare', () => {
  it('requires explicit valid entry with every earlier artifact and any submitted checkpoint', () => {
    expect(() =>
      reduce(initial(), { type: 'ENTER_SYNCHRONIZED_EXPLORATION' }),
    ).toThrow();
    const before = analysis();
    expect(() =>
      reduce(before, { type: 'ENTER_SYNCHRONIZED_EXPLORATION' }),
    ).toThrow();
    for (const answer of CHECKPOINT_ANSWERS) {
      const answered = reduce(before, { type: 'SUBMIT_CHECKPOINT', answer });
      for (const key of ['prediction', 'savedUnsafeTrace'] as const)
        expect(() =>
          reduce(
            { ...answered, [key]: null },
            { type: 'ENTER_SYNCHRONIZED_EXPLORATION' },
          ),
        ).toThrow();
      const next = reduce(answered, { type: 'ENTER_SYNCHRONIZED_EXPLORATION' });
      expect(next.synchronizedSession).toEqual({
        schedulerChoices: [],
        cursor: 0,
      });
      for (const key of [
        'prediction',
        'unsafeSession',
        'savedUnsafeTrace',
        'checkpointAnswer',
      ] as const)
        expect(next[key]).toBe(answered[key]);
      expect(answered.synchronizedSession).toBeNull();
    }
  });
  it('delegates one operation at a time and preserves all learning artifacts across Back, branch and Reset', () => {
    const start = ready();
    const complete = schedule(start, blockedChoices);
    const prior = structuredClone(complete);
    const back = reduce(complete, { type: 'BACK_SYNCHRONIZED' });
    expect(back.synchronizedSession?.schedulerChoices).toBe(
      complete.synchronizedSession?.schedulerChoices,
    );
    expect(back.synchronizedSession?.cursor).toBe(7);
    const reset = reduce(back, { type: 'RESET_SYNCHRONIZED_RUN' });
    expect(reset.synchronizedSession).toEqual(start.synchronizedSession);
    for (const key of [
      'prediction',
      'unsafeSession',
      'savedUnsafeTrace',
      'checkpointAnswer',
    ] as const)
      expect(reset[key]).toBe(start[key]);
    expect(complete).toEqual(prior);
    expect(() =>
      reduce(complete, { type: 'SCHEDULE_THREAD', threadId: 'A' }),
    ).toThrow();
    expect(() => reduce(analysis(), { type: 'BACK_SYNCHRONIZED' })).toThrow();
  });
  it('enforces Compare gate including active-prefix blocked evidence, never retained future', () => {
    const start = ready();
    const completed = schedule(start, blockedChoices);
    const noBlock = schedule(start, ['A', 'A', 'A', 'A', 'B', 'B', 'B']);
    expect(view(noBlock).synchronized?.executionComplete).toBe(true);
    expect(view(noBlock).synchronized?.invariant).toBe('HOLDS');
    for (const state of [
      start,
      noBlock,
      { ...completed, savedUnsafeTrace: null },
      { ...completed, synchronizedSession: null },
    ]) {
      expect(view(state).canEnterFinalComparison).toBe(false);
      expect(() => reduce(state, { type: 'ENTER_FINAL_COMPARISON' })).toThrow();
    }
    let rewind = completed;
    while ((rewind.synchronizedSession?.cursor ?? 0) > 1)
      rewind = reduce(rewind, { type: 'BACK_SYNCHRONIZED' });
    expect(view(rewind).synchronized?.hasBlockedLockAttempt).toBe(false);
    expect(view(rewind).canEnterFinalComparison).toBe(false);
    const branch = schedule(rewind, ['A', 'A', 'A', 'B', 'B', 'B']);
    expect(view(branch).synchronized?.executionComplete).toBe(true);
    expect(view(branch).synchronized?.hasBlockedLockAttempt).toBe(false);
    expect(view(branch).canEnterFinalComparison).toBe(false);
    expect(view(completed).canEnterFinalComparison).toBe(true);
  });
  it('derives unsafe Compare from saved evidence despite Back, alternate branch and Reset of active unsafe run', () => {
    const saved = analysis();
    let changed = reduce(reduce(saved, { type: 'BACK' }), { type: 'BACK' });
    changed = reduce(changed, { type: 'SCHEDULE_THREAD', threadId: 'B' });
    changed = reduce(changed, { type: 'SCHEDULE_THREAD', threadId: 'A' });
    changed = reduce(changed, { type: 'RESET_RUN' });
    const sync = reduce(
      reduce(changed, { type: 'SUBMIT_CHECKPOINT', answer: 'UNSURE' }),
      { type: 'ENTER_SYNCHRONIZED_EXPLORATION' },
    );
    const done = schedule(sync, blockedChoices);
    const result = compare(done.savedUnsafeTrace, done.synchronizedSession);
    expect(result.unsafe.savedTrace).toBe(saved.savedUnsafeTrace);
    expect(result.roles.unsafeFirstCommitter).toBe('A');
    expect(done.unsafeSession.cursor).toBe(0);
    expect(result.unsafe.steps).toHaveLength(4);
  });
  it.each(['A', 'B'] as const)(
    'derives mixed role identities for unsafe first committer %s and all contention positions',
    (unsafeFirst) => {
      for (const owner of ['A', 'B'] as const)
        for (const blockedAt of [1, 2, 3]) {
          const other = owner === 'A' ? 'B' : 'A';
          const choices: ThreadId[] = [owner, owner, owner, owner];
          choices.splice(blockedAt, 0, other);
          choices.push(other, other, other);
          const done = schedule(ready(unsafeFirst), choices);
          const result = compare(
            done.savedUnsafeTrace,
            done.synchronizedSession,
          );
          expect(result.roles).toEqual({
            unsafeFirstCommitter: unsafeFirst,
            unsafeViolatingCommitter: unsafeFirst === 'A' ? 'B' : 'A',
            synchronizedWinner: owner,
            blockingOwner: owner,
            blockedContender: other,
            laterFailedChecker: other,
          });
          expect(result.unsafe.successfulChecks).toHaveLength(2);
          expect(
            result.unsafe.successfulChecks.every(
              (c) => c.stepNumber < result.unsafe.firstCommit.stepNumber,
            ),
          ).toBe(true);
          expect(result.unsafe.finalSeatsRemaining).toBe(-1);
          const m = result.milestones;
          expect(m.blocked.stepNumber).toBe(blockedAt + 1);
          expect(m.blocked.facts).toMatchObject({
            operation: 'LOCK',
            outcome: 'BLOCKED',
            blockingOwner: owner,
          });
          const blockedView = deriveSynchronizedSessionView({
            schedulerChoices: choices,
            cursor: blockedAt + 1,
          });
          expect(
            blockedView.threads.find((t) => t.id === other)?.observation,
          ).toBeNull();
          expect(m.reacquisition.stepNumber).toBeGreaterThan(
            m.release.stepNumber,
          );
          expect(m.failedCheck.stepNumber).toBeGreaterThan(
            m.reacquisition.stepNumber,
          );
          expect(m.failedCheck.facts).toMatchObject({
            operation: 'CHECK',
            checkPassed: false,
            observedSeatsRemaining: 0,
          });
          expect(result.synchronized.invariant).toBe('HOLDS');
          expect(Object.keys(m)).toHaveLength(8);
        }
    },
  );
  it('fails malformed compare sources explicitly instead of inventing milestones', () => {
    const done = schedule(ready(), blockedChoices);
    expect(() => compare(['A', 'A', 'B'], done.synchronizedSession)).toThrow();
    expect(() =>
      compare(done.savedUnsafeTrace, {
        schedulerChoices: ['A', 'B', 'B'],
        cursor: 0,
      }),
    ).toThrow();
    expect(() =>
      compare(done.savedUnsafeTrace, {
        schedulerChoices: blockedChoices,
        cursor: 3,
      }),
    ).toThrow();
    expect(() =>
      compare(done.savedUnsafeTrace, {
        schedulerChoices: ['A', 'A', 'A', 'A', 'B', 'B', 'B'],
        cursor: 7,
      }),
    ).toThrow();
  });
  it('freezes both Compare sources by phase, requires Compare before Insight and clears everything only at final Start over', () => {
    const done = schedule(ready(), blockedChoices);
    expect(() => reduce(done, { type: 'ENTER_FINAL_INSIGHT' })).toThrow();
    expect(() => reduce(done, { type: 'START_OVER' })).toThrow();
    const compared = reduce(done, { type: 'ENTER_FINAL_COMPARISON' });
    const insight = reduce(compared, { type: 'ENTER_FINAL_INSIGHT' });
    const forbidden: LearningSessionAction[] = [
      { type: 'BACK' },
      { type: 'RESET_RUN' },
      { type: 'BACK_SYNCHRONIZED' },
      { type: 'RESET_SYNCHRONIZED_RUN' },
      { type: 'SCHEDULE_THREAD', threadId: 'A' },
      { type: 'SCHEDULE_SYNCHRONIZED_THREAD', threadId: 'A' },
      { type: 'SUBMIT_CHECKPOINT', answer: 'UNSURE' },
      { type: 'ENTER_SYNCHRONIZED_EXPLORATION' },
    ];
    for (const state of [compared, insight]) {
      for (const action of forbidden)
        expect(() => reduce(state, action)).toThrow();
      expect(state.synchronizedSession).toBe(done.synchronizedSession);
      expect(state.savedUnsafeTrace).toBe(done.savedUnsafeTrace);
    }
    const fresh = reduce(insight, { type: 'START_OVER' });
    expect(fresh).toEqual(initial());
    expect(fresh.synchronizedSession).toBeNull();
    const restart = reduce(fresh, {
      type: 'SUBMIT_PREDICTION',
      prediction: { choice: 'YES' },
    });
    expect(
      reduce(restart, { type: 'SCHEDULE_THREAD', threadId: 'B' }).unsafeSession
        .cursor,
    ).toBe(1);
  });
});
