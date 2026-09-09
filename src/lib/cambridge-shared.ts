// Values the Cambridge section shares between the server and the browser.
//
// This exists for the same reason `discipline-shared.ts` does: `cambridge.ts`
// is `server-only` (it holds the service-role writer), and the request form is
// a client component. A constant that both sides must agree on cannot live in
// the server module without dragging the service-role client into the bundle.
//
// Pure module — imports nothing, so it is safe from either side.

/**
 * Longest message a student may attach to an access request.
 *
 * Enforced in BOTH places on purpose: the textarea caps what can be typed so
 * the counter tells the truth, and `submitRequest()` slices again because the
 * server never trusts the form.
 */
export const MAX_REQUEST_MESSAGE = 500;

export type RequestStatus = "pending" | "approved" | "rejected";
