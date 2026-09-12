import type {
  SchedulingChoice,
  ThreadId,
} from '../../domain/unsafe-reservation';

export interface UnsafeSessionState {
  readonly schedulerChoices: readonly SchedulingChoice[];
  readonly cursor: number;
}

export type UnsafeSessionAction =
  | {
      readonly type: 'SCHEDULE_THREAD';
      readonly threadId: ThreadId;
    }
  | {
      readonly type: 'BACK';
    }
  | {
      readonly type: 'RESET_RUN';
    };

export type SessionTimelineErrorCode =
  'INVALID_SESSION' | 'INVALID_SCHEDULE' | 'INVALID_ACTION';

export class SessionTimelineError extends Error {
  readonly code: SessionTimelineErrorCode;

  constructor(
    code: SessionTimelineErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'SessionTimelineError';
    this.code = code;
  }
}

function immutableChoices(
  schedulerChoices: readonly SchedulingChoice[],
): readonly SchedulingChoice[] {
  return Object.isFrozen(schedulerChoices)
    ? schedulerChoices
    : Object.freeze([...schedulerChoices]);
}

export function createSessionStateSnapshot(
  schedulerChoices: readonly SchedulingChoice[],
  cursor: number,
): UnsafeSessionState {
  return Object.freeze({
    schedulerChoices: immutableChoices(schedulerChoices),
    cursor,
  });
}

export function createInitialUnsafeSession(): UnsafeSessionState {
  return createSessionStateSnapshot([], 0);
}
