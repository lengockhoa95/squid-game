import type { GameScene, SceneContext } from './GameScene.ts';

export type SceneLoader = (ctx: SceneContext) => Promise<GameScene>;

/** Holds the active scene; switching always disposes the previous one first. */
export class SceneManager {
  private current: GameScene | null = null;
  private loadToken = 0;

  get active(): GameScene | null {
    return this.current;
  }

  /** Resolves to null if another switch (or dispose) happened while loading. */
  async switchTo(loader: SceneLoader, ctx: SceneContext): Promise<GameScene | null> {
    const token = ++this.loadToken;
    this.current?.dispose();
    this.current = null;
    const scene = await loader(ctx);
    if (token !== this.loadToken) {
      scene.dispose();
      return null;
    }
    this.current = scene;
    return scene;
  }

  dispose(): void {
    this.loadToken++;
    this.current?.dispose();
    this.current = null;
  }
}
