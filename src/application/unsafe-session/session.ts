import {
  advanceUnsafeExecution,
  replayUnsafeExecution,
  THREAD_IDS,
  UnsafeTransitionError,
  type ThreadId,
} from '../../domain/unsafe-reservation';
import {
  createInitialUnsafeSession,
  createSessionStateSnapshot,
  SessionTimelineError,
  type UnsafeSessionAction,
  type UnsafeSessionState,
} from './model';

function invalidSession(message: string, cause?: unknown): never {
  throw new SessionTimelineError('INVALID_SESSION', message, { cause });
}

export function assertValidUnsafeSession(session: UnsafeSessionState): void {
  if (session === null || typeof session !== 'object') {
    invalidSession('Session state must be an object.');
  }

  if (!Array.isArray(session.schedulerChoices)) {
    invalidSession('schedulerChoices must be an array.');
  }

  if (
    session.schedulerChoices.some(
      (choice) => !THREAD_IDS.includes(choice as ThreadId),
    )
  ) {
    invalidSession('schedulerChoices may contain only threads A and B.');
  }

  if (
    !Number.isInteger(session.cursor) ||
    session.cursor < 0 ||
    session.cursor > session.schedulerChoices.length
  ) {
    invalidSession('cursor must be an integer within the retained timeline.');
  }

  try {
    replayUnsafeExecution(session.schedulerChoices);
  } catch (error) {
    if (error instanceof UnsafeTransitionError) {
      invalidSession('The retained scheduling timeline is not legal.', error);
    }
    throw error;
  }
}

function scheduleThread(
  session: UnsafeSessionState,
  threadId: ThreadId,
): UnsafeSessionState {
  const activeChoices = session.schedulerChoices.slice(0, session.cursor);
  const currentExecution = replayUnsafeExecution(activeChoices).finalState;

  try {
    advanceUnsafeExecution(currentExecution, threadId);
  } catch (error) {
    if (error instanceof UnsafeTransitionError) {
      throw new SessionTimelineError(
        'INVALID_SCHEDULE',
        `Thread ${threadId} cannot be scheduled at the current cursor.`,
        { cause: error },
      );
    }
    throw error;
  }

  const retainedNextChoice = session.schedulerChoices[session.cursor];
  if (retainedNextChoice === threadId) {
    const nextSession = createSessionStateSnapshot(
      session.schedulerChoices,
      session.cursor + 1,
    );
    assertValidUnsafeSession(nextSession);
    return nextSession;
  }

  const nextSession = createSessionStateSnapshot(
    [...activeChoices, threadId],
    session.cursor + 1,
  );
  assertValidUnsafeSession(nextSession);
  return nextSession;
}

export function reduceUnsafeSession(
  session: UnsafeSessionState,
  action: UnsafeSessionAction,
): UnsafeSessionState {
  assertValidUnsafeSession(session);

  switch (action.type) {
    case 'SCHEDULE_THREAD':
      return scheduleThread(session, action.threadId);
    case 'BACK':
      return session.cursor === 0
        ? session
        : createSessionStateSnapshot(
            session.schedulerChoices,
            session.cursor - 1,
          );
    case 'RESET_RUN':
      return session.cursor === 0 && session.schedulerChoices.length === 0
        ? session
        : createInitialUnsafeSession();
    default: {
      const unsupportedAction: never = action;
      throw new SessionTimelineError(
        'INVALID_ACTION',
        `Unsupported session action: ${String(unsupportedAction)}`,
      );
    }
  }
}
