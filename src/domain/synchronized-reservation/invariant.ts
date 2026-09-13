import type { SynchronizedExecutionState } from './model';
import { countSuccessfulReservations } from './selectors';

export type ReservationInvariantStatus = 'HOLDS' | 'VIOLATED';
export function evaluateReservationInvariant(
  state: SynchronizedExecutionState,
): ReservationInvariantStatus {
  return countSuccessfulReservations(state) <= 1 ? 'HOLDS' : 'VIOLATED';
}
