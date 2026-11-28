import * as THREE from 'three';

/**
 * Procedural ground textures for the castle map (no downloads): a soft, varied grass and a dirt
 * road with pebbles whose edges fade into the grass.
 */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function canvasTexture(draw: (g: CanvasRenderingContext2D, size: number) => void, size = 512): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** Grass: muted base, darker/lighter patches, blades and a few tiny flowers. Tiles seamlessly enough. */
export function grassTexture(): THREE.CanvasTexture {
  return canvasTexture((g, n) => {
    const r = rng(7);
    g.fillStyle = '#6a9f4c';
    g.fillRect(0, 0, n, n);
    // Soft patches (drawn wrapped so the tile edges match).
    for (let i = 0; i < 70; i++) {
      const x = r() * n;
      const y = r() * n;
      const rad = 20 + r() * 60;
      const light = r() < 0.5;
      for (const dx of [-n, 0, n]) {
        for (const dy of [-n, 0, n]) {
          const grd = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, rad);
          grd.addColorStop(0, light ? 'rgba(150,196,96,0.35)' : 'rgba(64,112,52,0.35)');
          grd.addColorStop(1, 'rgba(0,0,0,0)');
          g.fillStyle = grd;
          g.fillRect(x + dx - rad, y + dy - rad, rad * 2, rad * 2);
        }
      }
    }
    // Blades.
    for (let i = 0; i < 2600; i++) {
      const x = r() * n;
      const y = r() * n;
      const shade = 70 + r() * 70;
      g.strokeStyle = `rgba(${shade * 0.55 | 0},${shade + 40 | 0},${shade * 0.4 | 0},0.55)`;
      g.lineWidth = 1 + r();
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (r() - 0.5) * 4, y - 3 - r() * 5);
      g.stroke();
    }
    // Tiny flowers.
    const petals = ['#fff6d8', '#ffd84a', '#f7a8c8', '#c9b6ff'];
    for (let i = 0; i < 40; i++) {
      g.fillStyle = petals[Math.floor(r() * petals.length)]!;
      g.beginPath();
      g.arc(r() * n, r() * n, 1.5 + r() * 1.5, 0, Math.PI * 2);
      g.fill();
    }
  });
}

/** Dirt road: brown with ruts and pebbles; alpha fades out at both sides (u = across the road). */
export function roadTexture(): THREE.CanvasTexture {
  return canvasTexture((g, n) => {
    const r = rng(11);
    const across = g.createLinearGradient(0, 0, n, 0);
    across.addColorStop(0, 'rgba(150,112,72,0)');
    across.addColorStop(0.18, 'rgba(150,112,72,0.9)');
    across.addColorStop(0.5, 'rgba(164,126,84,1)');
    across.addColorStop(0.82, 'rgba(150,112,72,0.9)');
    across.addColorStop(1, 'rgba(150,112,72,0)');
    g.fillStyle = across;
    g.fillRect(0, 0, n, n);
    // Ruts.
    for (const x of [0.36, 0.64]) {
      g.fillStyle = 'rgba(110,80,50,0.35)';
      g.fillRect(x * n - 6, 0, 12, n);
    }
    // Pebbles and specks (only inside the road).
    for (let i = 0; i < 700; i++) {
      const x = (0.15 + r() * 0.7) * n;
      const y = r() * n;
      const v = 90 + r() * 80;
      g.fillStyle = `rgba(${v | 0},${v * 0.82 | 0},${v * 0.6 | 0},${0.4 + r() * 0.5})`;
      g.beginPath();
      g.ellipse(x, y, 1 + r() * 3, 1 + r() * 2, r() * 3, 0, Math.PI * 2);
      g.fill();
    }
  });
}
