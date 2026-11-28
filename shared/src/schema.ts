// Schema classes live in a separate entry so code that only needs plain types/config
// does not pull in @colyseus/schema.
export {
  PlayerState, MatchState, RoundResultEntry, RlglState, BridgeState, CollapseState, MazeState, DoorsState, PaintState, SeaState, SharkFin, CastleState, Monster, WeaponPickup, ElementEffect,
} from './schema/MatchState.ts';
