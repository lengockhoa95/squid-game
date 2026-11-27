import type { MinigameId } from '@sp/shared';
import type { MatchState } from '@sp/shared/schema';
import type { NpcStrategy } from '../../npc/NPCBot.ts';
import type { ServerMinigame } from './types.ts';
import { RedLightGreenLight } from '../RedLightGreenLight/Logic.ts';
import { RlglStrategy } from '../RedLightGreenLight/NPCStrategy.ts';
import { GlassBridge } from '../GlassBridge/Logic.ts';
import { BridgeStrategy } from '../GlassBridge/NPCStrategy.ts';
import { ObstacleRace } from '../ObstacleRace/Logic.ts';
import { RaceStrategy } from '../ObstacleRace/NPCStrategy.ts';
import { FloorCollapse } from '../FloorCollapse/Logic.ts';
import { CollapseStrategy } from '../FloorCollapse/NPCStrategy.ts';

export interface MinigameBundle {
  game: ServerMinigame;
  strategy: NpcStrategy;
}

export type MinigameFactory = (match: MatchState) => MinigameBundle;

/** Every playable minigame. Adding a game = one module folder + one line here. */
export const MINIGAME_FACTORIES: Partial<Record<MinigameId, MinigameFactory>> = {
  RLGL: (match) => {
    const game = new RedLightGreenLight();
    return { game, strategy: new RlglStrategy(game, match) };
  },
  GLASS_BRIDGE: (match) => {
    const game = new GlassBridge();
    return { game, strategy: new BridgeStrategy(game, match) };
  },
  OBSTACLE_RACE: () => ({ game: new ObstacleRace(), strategy: new RaceStrategy() }),
  FLOOR_COLLAPSE: () => {
    const game = new FloorCollapse();
    return { game, strategy: new CollapseStrategy(game) };
  },
};

export function availableMinigames(): MinigameId[] {
  return Object.keys(MINIGAME_FACTORIES) as MinigameId[];
}
