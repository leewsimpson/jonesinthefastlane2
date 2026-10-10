// Bundles art/audio/sfx-src/*.mp3 into one Howler sprite: sfx.ogg + sfx.m4a + sfx.json ({name: [startMs, durationMs]}).
// Each clip is trimmed of leading/trailing silence and loudness-normalised; clips are separated by 250 ms of silence.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = 'apps/web/public/assets/audio';
const src = 'art/audio/sfx-src';
const tmp = mkdtempSync(join(tmpdir(), 'sfx-'));
const ff = (...a) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...a]);
const SR = 44100;
const GAP = 0.25;
const trim =
  'silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse';

const names = readdirSync(src)
  .filter((f) => f.endsWith('.mp3'))
  .map((f) => f.slice(0, -4))
  .sort();
const map = {};
const inputs = [];
let t = 0;
for (const n of names) {
  const wav = join(tmp, `${n}.wav`);
  ff(
    '-i',
    `${src}/${n}.mp3`,
    '-af',
    `${trim},loudnorm=I=-18:TP=-2,aresample=${SR},apad=pad_dur=${GAP}`,
    '-ac',
    '1',
    '-ar',
    String(SR),
    wav,
  );
  const dur = Number(
    execFileSync('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'csv=p=0',
      wav,
    ]).toString(),
  );
  map[n] = [Math.round(t * 1000), Math.round((dur - GAP) * 1000)];
  t += dur;
  inputs.push('-i', wav);
}
const filter = `${names.map((_, i) => `[${i}:a]`).join('')}concat=n=${names.length}:v=0:a=1[o]`;
const all = join(tmp, 'all.wav');
ff(...inputs, '-filter_complex', filter, '-map', '[o]', all);
ff('-i', all, '-c:a', 'libvorbis', '-q:a', '4', `${dir}/sfx.ogg`);
ff('-i', all, '-c:a', 'aac', '-b:a', '96k', `${dir}/sfx.m4a`);
writeFileSync(`${dir}/sfx.json`, `${JSON.stringify(map, null, 1)}\n`);
console.log(names.length, 'clips,', t.toFixed(1), 's');
