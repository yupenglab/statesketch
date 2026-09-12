import { describe, expect, it } from 'vitest';
import {
  THREAD_IDS,
  advanceSynchronizedExecution as advance,
  assertValidSynchronizedState as validate,
  createInitialSynchronizedState as initial,
  replaySynchronizedExecution as replay,
  getRunnableThreadIds,
  getThreadStatus,
  isExecutionComplete,
  countSuccessfulReservations,
  evaluateReservationInvariant,
  type SynchronizedExecutionState as State,
  type SchedulingChoice,
  type SynchronizedTransitionFacts,
} from './index';

describe('all synchronized schedules and every reachable prefix', () => {
  it('traverses actual runnable choices and proves safety, termination and replay at every node', () => {
    let prefixes = 0;
    let complete = 0;
    let blockedSchedules = 0;
    let nonBlockedSchedules = 0;
    const uniqueStates = new Set<string>();
    const completeSchedules = new Set<string>();
    const lengths: Record<number, number> = {};

    function visit(
      state: State,
      prefix: readonly SchedulingChoice[],
      facts: readonly SynchronizedTransitionFacts[],
      ancestors: ReadonlySet<string>,
    ) {
      prefixes++;
      const serialized = JSON.stringify(state);
      uniqueStates.add(serialized);
      // A repeated state on one path would imply a cycle, not termination.
      expect(ancestors.has(serialized)).toBe(false);
      expect(() => validate(state)).not.toThrow();
      expect(evaluateReservationInvariant(state)).toBe('HOLDS');
      expect(countSuccessfulReservations(state)).toBeLessThanOrEqual(1);
      expect(state.seatsRemaining).toBe(1 - countSuccessfulReservations(state));
      const protectedIds = THREAD_IDS.filter((id) =>
        state.threads[id].progress.startsWith('INSIDE_'),
      );
      expect(protectedIds).toEqual(
        state.mutexOwner === null ? [] : [state.mutexOwner],
      );
      const runnable = getRunnableThreadIds(state);
      for (const id of THREAD_IDS) {
        if (state.threads[id].progress === 'WAITING_FOR_MUTEX') {
          expect(runnable).not.toContain(id);
          expect(state.threads[id].observedSeatsRemaining).toBeNull();
          expect(state.threads[id].hasSeat).toBe(false);
          expect(state.mutexOwner).toBe(id === 'A' ? 'B' : 'A');
          expect(() => advance(state, id)).toThrow();
        }
      }
      const reconstructed = replay(prefix);
      expect(reconstructed.finalState).toEqual(state);
      expect(reconstructed.steps.map((step) => step.facts)).toEqual(facts);
      expect(reconstructed.steps).toHaveLength(prefix.length);
      expect(replay(prefix)).toEqual(reconstructed);
      if (isExecutionComplete(state)) {
        complete++;
        completeSchedules.add(prefix.join(''));
        const blocked = facts.some(
          (fact) => fact.operation === 'LOCK' && fact.outcome === 'BLOCKED',
        );
        if (blocked) blockedSchedules++;
        else nonBlockedSchedules++;
        lengths[prefix.length] = (lengths[prefix.length] ?? 0) + 1;
        expect(runnable).toEqual([]);
        expect(state.mutexOwner).toBeNull();
        expect(THREAD_IDS.map((id) => getThreadStatus(state, id))).toEqual([
          'FINISHED',
          'FINISHED',
        ]);
        expect(countSuccessfulReservations(state)).toBe(1);
        expect(state.seatsRemaining).toBe(0);
        return;
      }
      expect(runnable.length).toBeGreaterThan(0);
      const nextAncestors = new Set([...ancestors, serialized]);
      for (const id of runnable) {
        const before = structuredClone(state);
        const priorFacts = structuredClone(facts);
        const result = advance(state, id);
        const fact = result.facts;
        expect(fact.threadId).toBe(id);
        expect(fact.seatsRemainingBefore).toBe(state.seatsRemaining);
        expect(fact.seatsRemainingAfter).toBe(result.state.seatsRemaining);
        expect(fact.mutexOwnerBefore).toBe(state.mutexOwner);
        expect(fact.mutexOwnerAfter).toBe(result.state.mutexOwner);
        expect(fact.invariantBefore).toBe('HOLDS');
        expect(fact.invariantAfter).toBe('HOLDS');
        if (fact.operation !== 'COMMIT') {
          expect(result.state.seatsRemaining).toBe(state.seatsRemaining);
          expect(countSuccessfulReservations(result.state)).toBe(
            countSuccessfulReservations(state),
          );
        }
        if (fact.operation !== 'UNLOCK') {
          const other = id === 'A' ? 'B' : 'A';
          expect(result.state.threads[other]).toEqual(state.threads[other]);
        }
        if (fact.operation !== 'LOCK') expect(state.mutexOwner).toBe(id);
        if (fact.operation === 'LOCK' && fact.outcome === 'BLOCKED') {
          expect(state.threads[id].progress).toBe('BEFORE_LOCK');
          expect(result.state.threads[id].progress).toBe('WAITING_FOR_MUTEX');
          expect(result.state.threads[id].observedSeatsRemaining).toBeNull();
        }
        if (fact.operation === 'UNLOCK') {
          expect(result.state.mutexOwner).toBeNull();
          if (fact.madeRunnableThreadId !== null) {
            expect(
              result.state.threads[fact.madeRunnableThreadId].progress,
            ).toBe('BEFORE_LOCK');
          }
        }
        visit(result.state, [...prefix, id], [...facts, fact], nextAncestors);
        expect(state).toEqual(before);
        expect(facts).toEqual(priorFacts);
      }
    }

    visit(initial(), [], [], new Set());
    expect(completeSchedules.size).toBe(complete);
    expect(blockedSchedules).toBeGreaterThan(0);
    expect(nonBlockedSchedules).toBeGreaterThan(0);
    expect(blockedSchedules + nonBlockedSchedules).toBe(complete);
    console.info(
      'Synchronized exhaustive results:',
      JSON.stringify({
        complete,
        blockedSchedules,
        nonBlockedSchedules,
        prefixes,
        uniqueStates: uniqueStates.size,
        traceLengthDistribution: lengths,
      }),
    );
  });
});
