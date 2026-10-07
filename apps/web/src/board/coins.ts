/**
 * Coin-burst particles (ENG-01) on a Pixi `ParticleContainer`: one shared coin texture drawn once on a 2D canvas,
 * and plain physics. Positions come from a seeded spread, so a burst looks the same each time (and in tests).
 */
import { Particle, Texture } from 'pixi.js';

export interface Coin {
  p: Particle;
  vx: number;
  vy: number;
  life: number;
}

/** Seconds a coin lives, and the pull that brings it back down (px/s²). */
export const COIN_LIFE = 1.1;
const GRAVITY = 900;

let texture: Texture | null = null;
export function coinTexture(): Texture {
  if (texture) return texture;
  const size = 32;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  if (g) {
    g.fillStyle = '#1f1b2e';
    g.beginPath();
    g.arc(16, 16, 15, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ffc23d';
    g.beginPath();
    g.arc(16, 16, 12, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#1f1b2e';
    g.font = 'bold 16px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('$', 16, 17);
  }
  texture = Texture.from(c);
  return texture;
}

/** Launch velocities for `n` coins: a fan upwards, spread evenly with a little wobble. */
export function launch(n: number): { vx: number; vy: number }[] {
  return Array.from({ length: n }, (_, i) => {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const angle = -Math.PI / 2 + (t - 0.5) * 1.6;
    const speed = 260 + ((i * 37) % 90);
    return { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed };
  });
}

export function spawn(n: number, x: number, y: number, scale: number): Coin[] {
  const tex = coinTexture();
  return launch(n).map(({ vx, vy }) => ({
    p: new Particle({
      texture: tex,
      x,
      y,
      anchorX: 0.5,
      anchorY: 0.5,
      scaleX: scale,
      scaleY: scale,
    }),
    vx: vx * scale * 1.6,
    vy: vy * scale * 1.6,
    life: COIN_LIFE,
  }));
}

/** Moves every coin on by `dt` seconds; returns the ones still alive. */
export function step(coins: Coin[], dt: number): { alive: Coin[]; dead: Coin[] } {
  const alive: Coin[] = [];
  const dead: Coin[] = [];
  for (const c of coins) {
    c.life -= dt;
    if (c.life <= 0) {
      dead.push(c);
      continue;
    }
    c.vy += GRAVITY * dt;
    c.p.x += c.vx * dt;
    c.p.y += c.vy * dt;
    c.p.alpha = Math.min(1, c.life / 0.35);
    alive.push(c);
  }
  return { alive, dead };
}
