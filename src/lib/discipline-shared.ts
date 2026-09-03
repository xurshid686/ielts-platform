// The pieces of the Discipline feature a CLIENT component may import.
//
// lib/discipline.ts is `server-only` (it holds the service-role writer), so the
// admin UI cannot import the constant from there without dragging the server
// module into the browser bundle.

/** Strikes allowed before the owner resets a student to Day 1. */
export const STRIKE_LIMIT = 3;
