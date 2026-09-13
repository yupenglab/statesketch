import {
  createInitialUnsafeSession,
  reduceUnsafeSession,
  type UnsafeSessionAction,
  type UnsafeSessionState,
} from '../unsafe-session';
import { deriveUnsafeSessionView } from '../unsafe-session';
import { deriveViolationAnalysis, type SavedUnsafeTrace } from './analysis';
import { CHECKPOINT_ANSWERS, type CheckpointAnswer } from './checkpoint';
import {
  createInitialSynchronizedSession,
  reduceSynchronizedSession,
  type SynchronizedSessionState,
} from '../synchronized-session';
import { deriveComparisonView } from './comparison';

export type PredictionChoice = 'NO' | 'YES' | 'UNSURE';

export interface Prediction {
  readonly choice: PredictionChoice;
  readonly reasoning?: string;
}

export type LearningSessionPhase =
  | 'PREDICTION'
  | 'UNSAFE_EXPLORATION'
  | 'VIOLATION_ANALYSIS'
  | 'SYNCHRONIZED_EXPLORATION'
  | 'FINAL_COMPARISON'
  | 'FINAL_INSIGHT';

export interface LearningSessionState {
  readonly phase: LearningSessionPhase;
  readonly prediction: Prediction | null;
  readonly unsafeSession: UnsafeSessionState;
  readonly savedUnsafeTrace: SavedUnsafeTrace | null;
  readonly checkpointAnswer: CheckpointAnswer | null;
  readonly synchronizedSession: SynchronizedSessionState | null;
}

export type LearningSessionAction =
  | { readonly type: 'ENTER_SYNCHRONIZED_EXPLORATION' }
  | {
      readonly type: 'SCHEDULE_SYNCHRONIZED_THREAD';
      readonly threadId: 'A' | 'B';
    }
  | { readonly type: 'BACK_SYNCHRONIZED' }
  | { readonly type: 'RESET_SYNCHRONIZED_RUN' }
  | { readonly type: 'ENTER_FINAL_COMPARISON' }
  | { readonly type: 'ENTER_FINAL_INSIGHT' }
  | { readonly type: 'START_OVER' }
  | { readonly type: 'SUBMIT_PREDICTION'; readonly prediction: Prediction }
  | { readonly type: 'ENTER_VIOLATION_ANALYSIS' }
  | {
      readonly type: 'SUBMIT_CHECKPOINT';
      readonly answer: CheckpointAnswer;
    }
  | UnsafeSessionAction;

export function createLearningSession(): LearningSessionState {
  return Object.freeze({
    phase: 'PREDICTION',
    prediction: null,
    unsafeSession: createInitialUnsafeSession(),
    savedUnsafeTrace: null,
    checkpointAnswer: null,
    synchronizedSession: null,
  });
}

export function reduceLearningSession(
  session: LearningSessionState,
  action: LearningSessionAction,
): LearningSessionState {
  if (action.type === 'START_OVER') {
    if (session.phase !== 'FINAL_INSIGHT')
      throw new Error('Start over is available only at Final Insight.');
    return createLearningSession();
  }
  if (action.type === 'ENTER_SYNCHRONIZED_EXPLORATION') {
    if (
      session.phase !== 'VIOLATION_ANALYSIS' ||
      session.prediction === null ||
      session.savedUnsafeTrace === null ||
      session.checkpointAnswer === null ||
      !CHECKPOINT_ANSWERS.includes(session.checkpointAnswer)
    )
      throw new Error(
        'Synchronized exploration requires analysis and a submitted checkpoint.',
      );
    deriveViolationAnalysis(session.savedUnsafeTrace);
    return Object.freeze({
      ...session,
      phase: 'SYNCHRONIZED_EXPLORATION',
      synchronizedSession: createInitialSynchronizedSession(),
    });
  }
  if (
    action.type === 'ENTER_FINAL_COMPARISON' ||
    action.type === 'ENTER_FINAL_INSIGHT'
  ) {
    const requiredPhase =
      action.type === 'ENTER_FINAL_COMPARISON'
        ? 'SYNCHRONIZED_EXPLORATION'
        : 'FINAL_COMPARISON';
    if (session.phase !== requiredPhase)
      throw new Error('Invalid phase for comparison or insight entry.');
    deriveComparisonView(session.savedUnsafeTrace, session.synchronizedSession);
    return Object.freeze({
      ...session,
      phase:
        action.type === 'ENTER_FINAL_COMPARISON'
          ? 'FINAL_COMPARISON'
          : 'FINAL_INSIGHT',
    });
  }
  if (
    action.type === 'SCHEDULE_SYNCHRONIZED_THREAD' ||
    action.type === 'BACK_SYNCHRONIZED' ||
    action.type === 'RESET_SYNCHRONIZED_RUN'
  ) {
    if (
      session.phase !== 'SYNCHRONIZED_EXPLORATION' ||
      session.synchronizedSession === null
    )
      throw new Error(
        'Synchronized timeline controls require synchronized exploration.',
      );
    const localAction =
      action.type === 'SCHEDULE_SYNCHRONIZED_THREAD'
        ? { type: 'SCHEDULE_THREAD' as const, threadId: action.threadId }
        : action.type === 'BACK_SYNCHRONIZED'
          ? { type: 'BACK' as const }
          : { type: 'RESET_RUN' as const };
    return Object.freeze({
      ...session,
      synchronizedSession: reduceSynchronizedSession(
        session.synchronizedSession,
        localAction,
      ),
    });
  }
  if (
    session.phase === 'SYNCHRONIZED_EXPLORATION' ||
    session.phase === 'FINAL_COMPARISON' ||
    session.phase === 'FINAL_INSIGHT'
  )
    throw new Error('Unsafe learning controls are unavailable in this phase.');
  if (action.type === 'SUBMIT_PREDICTION') {
    if (session.prediction !== null) {
      throw new Error('Prediction has already been committed.');
    }
    if (!['NO', 'YES', 'UNSURE'].includes(action.prediction.choice)) {
      throw new Error('Choose a prediction before starting exploration.');
    }
    const reasoning = action.prediction.reasoning?.trim();
    if (reasoning && reasoning.length > 240) {
      throw new Error('Prediction reasoning must be at most 240 characters.');
    }
    return Object.freeze({
      phase: 'UNSAFE_EXPLORATION',
      prediction: Object.freeze({
        choice: action.prediction.choice,
        ...(reasoning ? { reasoning } : {}),
      }),
      unsafeSession: session.unsafeSession,
      savedUnsafeTrace: null,
      checkpointAnswer: null,
      synchronizedSession: null,
    });
  }

  if (session.prediction === null) {
    throw new Error('Commit a prediction before scheduling.');
  }

  if (action.type === 'ENTER_VIOLATION_ANALYSIS') {
    if (session.savedUnsafeTrace === null) {
      throw new Error('A saved violating trace is required for analysis.');
    }
    deriveViolationAnalysis(session.savedUnsafeTrace);
    return Object.freeze({ ...session, phase: 'VIOLATION_ANALYSIS' });
  }

  if (action.type === 'SUBMIT_CHECKPOINT') {
    if (session.phase !== 'VIOLATION_ANALYSIS') {
      throw new Error('Checkpoint answers require violation analysis.');
    }
    if (!CHECKPOINT_ANSWERS.includes(action.answer)) {
      throw new Error('Choose a valid checkpoint answer.');
    }
    return Object.freeze({ ...session, checkpointAnswer: action.answer });
  }

  const previousInvariant = deriveUnsafeSessionView(
    session.unsafeSession,
  ).invariant;
  const unsafeSession = reduceUnsafeSession(session.unsafeSession, action);
  const nextInvariant = deriveUnsafeSessionView(unsafeSession).invariant;
  const savedUnsafeTrace =
    session.savedUnsafeTrace === null &&
    action.type === 'SCHEDULE_THREAD' &&
    previousInvariant === 'HOLDS' &&
    nextInvariant === 'VIOLATED'
      ? Object.freeze(
          unsafeSession.schedulerChoices.slice(0, unsafeSession.cursor),
        )
      : session.savedUnsafeTrace;

  return Object.freeze({
    phase: session.phase,
    prediction: session.prediction,
    unsafeSession,
    savedUnsafeTrace,
    checkpointAnswer: session.checkpointAnswer,
    synchronizedSession: session.synchronizedSession,
  });
}
