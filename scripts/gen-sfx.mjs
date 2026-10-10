// Generates the SFX set with ElevenLabs Sound Effects. Usage: node scripts/gen-sfx.mjs [name ...]
// Reads ELEVENLABS_API_KEY from .env; writes mp3 to art/audio/sfx-src/.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const key = readFileSync('.env', 'utf8')
  .match(/^ELEVENLABS_API_KEY=(.+)$/m)?.[1]
  ?.trim();
if (!key) throw new Error('ELEVENLABS_API_KEY missing from .env');

const STYLE = 'clean, bright, cheerful mobile-game UI sound, soft and rounded, no music, no voice';
const SFX = {
  tap: ['soft UI button tap, short click', 0.5],
  coin: ['single bright coin clink', 0.8],
  'coin-burst': ['cascade of coins pouring, quick shower of coin clinks', 1.5],
  'cash-out': ['cash register ka-ching, short', 1.0],
  'pop-good': ['small happy rising two-note blip, positive stat increase', 0.6],
  'pop-bad': ['small descending two-note blip, mildly negative, comedic', 0.6],
  hired: ['short triumphant fanfare sting, trumpet and sparkle, celebratory', 2.0],
  promoted: ['bigger celebratory fanfare sting with sparkles and cheer', 2.5],
  credential: ['achievement chime, graduation sparkle, ascending bells', 1.5],
  quest: ['quest complete jingle, three ascending glockenspiel notes', 1.5],
  moved: ['moving house, cardboard box thump and a happy key jingle', 1.5],
  'laid-off': ['sad comedic trombone wah-wah sting, short', 2.0],
  evicted: ['heavy door slam with a cartoonish low thud and sad tuba note', 2.0],
  'card-flip': ['playing card flip and soft whoosh, board game', 0.6],
  'dice-roll': ['wooden dice rolling on a board game table, short', 1.2],
  'token-step': ['small wooden board game token placed on a board, short tick', 0.5],
  'rent-due': ['ominous but comedic notification alarm, descending doorbell, short', 1.5],
  'robot-beep': ['friendly delivery robot beeps and boops, short', 1.0],
};

const only = process.argv.slice(2);
const out = 'art/audio/sfx-src';
mkdirSync(out, { recursive: true });
for (const [name, [text, secs]] of Object.entries(SFX)) {
  if (only.length && !only.includes(name)) continue;
  const res = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: `${text}. ${STYLE}`,
      duration_seconds: secs,
      prompt_influence: 0.5,
    }),
  });
  if (!res.ok) {
    console.error(name, res.status, (await res.text()).slice(0, 200));
    continue;
  }
  writeFileSync(`${out}/${name}.mp3`, Buffer.from(await res.arrayBuffer()));
  console.log('ok', name);
}
