import type {
  CaseMessage,
  RawChannel,
  RawContext,
  UserPrincipal,
} from '../domain/types.js';

/**
 * The boundary between the office archive and everything above it.
 *
 * Nothing above this interface knows where a case comes from. Today it is a
 * JSON fixture; tomorrow it is a database. The gateway never talks to the
 * source directly, so swapping the implementation does not put the declassifier
 * or the firewall back under review — which is the whole point of having the
 * seam here rather than inside `VirtualOffice`.
 *
 * Every accessor returns `null` on a failed authorization check instead of
 * throwing, and callers treat `null` as deny. Returning raw rows to be filtered
 * later would move the decision to the wrong side of the boundary.
 */
export interface OfficeStore {
  /** Authorized document set, or null when access is denied. */
  getAuthorizedSummary(user: UserPrincipal, caseId: string): RawContext | null;

  /** Authorized channel, or null when access is denied. */
  getAuthorizedChannel(user: UserPrincipal, caseId: string): RawChannel | null;

  /**
   * Ingress path: text written by an outside model. Returns false when the
   * caller may not write to the case.
   */
  appendMessage(
    user: UserPrincipal,
    caseId: string,
    message: CaseMessage,
  ): boolean;
}
