import {
  createInitialUnsafeSession,
  reduceUnsafeSession,
  type UnsafeSessionAction,
  type UnsafeSessionState,
} from '../unsafe-session';
import { deriveUnsafeSessionView } from '../unsafe-session';
import { deriveViolationAnalysis, type SavedUnsafeTrace } from './analysis';
import { CHECKPOINT_ANSWERS, type CheckpointAnswer } from './checkpoint';

export type PredictionChoice = 'NO' | 'YES' | 'UNSURE';

export interface Prediction {
  readonly choice: PredictionChoice;
  readonly reasoning?: string;
}

export type LearningSessionPhase =
  'PREDICTION' | 'UNSAFE_EXPLORATION' | 'VIOLATION_ANALYSIS';

export interface LearningSessionState {
  readonly phase: LearningSessionPhase;
  readonly prediction: Prediction | null;
  readonly unsafeSession: UnsafeSessionState;
  readonly savedUnsafeTrace: SavedUnsafeTrace | null;
  readonly checkpointAnswer: CheckpointAnswer | null;
}

export type LearningSessionAction =
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
  });
}

export function reduceLearningSession(
  session: LearningSessionState,
  action: LearningSessionAction,
): LearningSessionState {
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
  });
}
