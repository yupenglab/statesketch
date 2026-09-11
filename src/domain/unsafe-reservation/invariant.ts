import type { ExecutionState } from './model';
import { countSuccessfulReservations } from './selectors';

export type ReservationInvariantStatus = 'HOLDS' | 'VIOLATED';

export function evaluateReservationInvariant(
  state: ExecutionState,
): ReservationInvariantStatus {
  return countSuccessfulReservations(state) <= 1 ? 'HOLDS' : 'VIOLATED';
}
