export const CHECKPOINT_ANSWERS = [
  'CHECK_ONLY',
  'COMMIT_ONLY',
  'CHECK_TO_COMMIT',
  'UNSURE',
] as const;

export type CheckpointAnswer = (typeof CHECKPOINT_ANSWERS)[number];

const feedbackByAnswer: Readonly<Record<CheckpointAnswer, string>> =
  Object.freeze({
    CHECK_ONLY:
      'Protecting only CHECK still leaves the dependent COMMIT separated from the condition it relied on. Another reservation attempt could change the shared state in between.',
    COMMIT_ONLY:
      'Protecting only COMMIT is too late. Both threads could already have completed successful CHECKs before either COMMIT begins.',
    CHECK_TO_COMMIT:
      'Yes. The successful CHECK and the COMMIT that depends on it must remain one uninterrupted logical region with respect to another reservation attempt.',
    UNSURE:
      'Focus on the dependency: COMMIT is valid only because an earlier CHECK succeeded. Another reservation attempt must not intervene between those two steps.',
  });

export function deriveCheckpointFeedback(answer: CheckpointAnswer): string {
  return feedbackByAnswer[answer];
}
