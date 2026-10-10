/**
 * Music and sound effects (NFR-05). Howler loads on first use, so it stays out of the initial bundle (NFR-10), and
 * every failure (no audio device, blocked autoplay, offline) is swallowed: sound is decoration. Volumes come from the
 * settings; 0 means nothing is even fetched. Browsers keep audio locked until a tap, which Howler waits for.
 */
import type { Howl } from 'howler';
import { useSettings } from '../settings/settings.ts';
import type { SfxName } from './cues.ts';

const DIR = '/assets/audio/';
type Sprite = Record<string, [number, number]>;

let sfx: Promise<Howl | null> | null = null;
let music: Promise<Howl | null> | null = null;
let watching = false;

async function loadSfx(): Promise<Howl | null> {
  try {
    const [{ Howl }, sprite] = await Promise.all([
      import('howler'),
      fetch(`${DIR}sfx.json`).then((r) => r.json() as Promise<Sprite>),
    ]);
    return new Howl({ src: [`${DIR}sfx.ogg`, `${DIR}sfx.m4a`], sprite });
  } catch {
    sfx = null; // try again next time
    return null;
  }
}

/** Plays one effect at the current effects volume. */
export function playSfx(name: SfxName): void {
  const volume = useSettings.getState().sfxVolume / 100;
  if (volume === 0) return;
  sfx ??= loadSfx();
  void sfx.then((h) => {
    if (!h) return;
    const id = h.play(name);
    h.volume(volume, id);
  });
}

/** Starts the looping soundtrack if it isn't running; a no-op at volume 0. Follows the volume and tab visibility. */
export function startMusic(): void {
  watch();
  if (useSettings.getState().musicVolume === 0) return;
  music ??= (async () => {
    try {
      const { Howl } = await import('howler');
      return new Howl({
        src: [`${DIR}boardgame-groove-loop.ogg`, `${DIR}boardgame-groove-loop.m4a`],
        loop: true,
        volume: useSettings.getState().musicVolume / 100,
      });
    } catch {
      music = null;
      return null;
    }
  })();
  void music.then((h) => {
    if (h && !h.playing()) h.play();
  });
}

function watch(): void {
  if (watching) return;
  watching = true;
  let last = useSettings.getState().musicVolume;
  useSettings.subscribe((s) => {
    if (s.musicVolume === last) return;
    last = s.musicVolume;
    if (music) void music.then((h) => h?.volume(s.musicVolume / 100));
    if (s.musicVolume > 0) startMusic();
  });
  document.addEventListener('visibilitychange', () => {
    if (!music) return;
    void music.then((h) => {
      if (!h) return;
      if (document.hidden) h.pause();
      else if (useSettings.getState().musicVolume > 0) h.play();
    });
  });
}
