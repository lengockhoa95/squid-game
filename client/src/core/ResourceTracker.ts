interface Disposable {
  dispose(): void;
}

/**
 * Collects GPU resources a scene owns (geometries, materials, textures, render targets)
 * so they can all be released when the scene is switched out.
 * Shared resources (MaterialLibrary, model geometry caches) are NOT tracked here.
 */
export class ResourceTracker {
  private readonly items = new Set<Disposable>();

  track<T extends Disposable>(item: T): T {
    this.items.add(item);
    return item;
  }

  dispose(): void {
    for (const item of this.items) item.dispose();
    this.items.clear();
  }
}
