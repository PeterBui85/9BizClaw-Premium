// --self makes openzca/zca-js deliver events produced by the logged-in account
// (zca-js defaults selfListen:false). Required for owner-takeover: the CEO's
// /tamdung is a self-message, so without --self it never reaches the listener.
// monitor-normalize.ts drops every OTHER self/echo event to prevent reply loops.
export const OPENZCA_LISTEN_ARGS = ["listen", "--self", "--raw", "--supervised"] as const;
