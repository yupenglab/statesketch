import {
  createInitialUnsafeSession,
  reduceUnsafeSession,
  type UnsafeSessionAction,
  type UnsafeSessionState,
} from '../unsafe-session';

export type PredictionChoice = 'NO' | 'YES' | 'UNSURE';

export interface Prediction {
  readonly choice: PredictionChoice;
  readonly reasoning?: string;
}

export interface LearningSessionState {
  readonly prediction: Prediction | null;
  readonly unsafeSession: UnsafeSessionState;
}

export type LearningSessionAction =
  | { readonly type: 'SUBMIT_PREDICTION'; readonly prediction: Prediction }
  | UnsafeSessionAction;

export function createLearningSession(): LearningSessionState {
  return Object.freeze({
    prediction: null,
    unsafeSession: createInitialUnsafeSession(),
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
      prediction: Object.freeze({
        choice: action.prediction.choice,
        ...(reasoning ? { reasoning } : {}),
      }),
      unsafeSession: session.unsafeSession,
    });
  }

  if (session.prediction === null) {
    throw new Error('Commit a prediction before scheduling.');
  }
  return Object.freeze({
    prediction: session.prediction,
    unsafeSession: reduceUnsafeSession(session.unsafeSession, action),
  });
}
