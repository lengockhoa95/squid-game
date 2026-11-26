// Schema classes live in a separate entry so code that only needs plain types/config
// (e.g. the menu bundle) does not pull in @colyseus/schema.
export { PlayerState, MatchState } from './schema/MatchState.ts';
