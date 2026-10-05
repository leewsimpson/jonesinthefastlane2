/** New game setup (FR-10, FR-06): players, Jones, difficulty or custom targets, week limit, seed. */
import { DIFFICULTIES, type Difficulty, GOAL_KEYS, type GoalKey } from '@fastlane/content/keys';
import { type GameSetup, MAX_HUMANS, type PlayerSetup } from '@fastlane/engine';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { content } from '../../game/engine.ts';
import { money } from '../../i18n/format.ts';
import { useApp } from '../../store/app.ts';
import { gameStore } from '../../store/game.ts';
import { HUMAN_COLOURS } from '../common/stats.ts';

const WEEK_LIMITS = [null, 26, 52] as const;

const randomSeed = () => Math.random().toString(36).slice(2, 10);

/** Slider range per goal, from the presets (wealth is in cents, so it steps by $500). */
function goalRange(goal: GoalKey) {
  const values = DIFFICULTIES.map((d) => content.balance.goals.presets[d][goal]);
  const max = Math.max(...values) * 2;
  const step = goal === 'wealth' ? 50_000 : 5;
  return { min: step, max, step };
}

export function Setup() {
  const { t } = useTranslation();
  const go = useApp((s) => s.go);
  const [names, setNames] = useState<string[]>([t('setup.defaultName', { n: 1 })]);
  const [jones, setJones] = useState(true);
  const [difficulty, setDifficulty] = useState<Difficulty | 'custom'>('standard');
  const [goals, setGoals] = useState<Record<GoalKey, number>>({
    ...content.balance.goals.presets.standard,
  });
  const [weekLimit, setWeekLimit] = useState<number | null>(null);
  const [seed, setSeed] = useState(randomSeed);

  const pickDifficulty = (d: Difficulty | 'custom') => {
    setDifficulty(d);
    if (d !== 'custom') setGoals({ ...content.balance.goals.presets[d] });
  };

  const start = (e: FormEvent) => {
    e.preventDefault();
    const players: PlayerSetup[] = names.map((name, i) => ({
      name: name.trim() || t('setup.defaultName', { n: i + 1 }),
      controller: 'human',
    }));
    if (jones) players.push({ name: t('player.jones'), controller: 'ai' });
    const setup: GameSetup = {
      seed: seed.trim() || randomSeed(),
      players,
      config: difficulty === 'custom' ? { goals, weekLimit } : { difficulty, weekLimit },
    };
    const id = `slot-${Date.now().toString(36)}`;
    gameStore().getState().start(id, setup);
    go({ name: 'game', slot: id });
  };

  return (
    <main className="mx-auto max-w-xl p-4 sm:p-6">
      <form onSubmit={start} className="flex flex-col gap-6">
        <h1 className="font-display font-extrabold text-4xl">{t('setup.title')}</h1>

        <fieldset className="card flex flex-col gap-3 p-4">
          <legend className="px-1 font-bold">{t('setup.players')}</legend>
          {names.map((name, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: seats are positional
            <div key={i} className="flex items-center gap-2">
              <span
                className="size-4 shrink-0 rounded-full border-2 border-ink"
                style={{ background: HUMAN_COLOURS[i] }}
                aria-hidden="true"
              />
              <label className="sr-only" htmlFor={`player-${i}`}>
                {t('setup.playerName', { n: i + 1 })}
              </label>
              <input
                id={`player-${i}`}
                className="input flex-1"
                value={name}
                maxLength={20}
                onChange={(e) => setNames(names.map((n, j) => (j === i ? e.target.value : n)))}
              />
              {names.length > 1 && (
                <button
                  type="button"
                  className="btn btn-sm"
                  aria-label={t('setup.removePlayer', { name })}
                  onClick={() => setNames(names.filter((_, j) => j !== i))}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          {names.length < MAX_HUMANS && (
            <button
              type="button"
              className="btn btn-sm self-start"
              onClick={() => setNames([...names, t('setup.defaultName', { n: names.length + 1 })])}
            >
              {t('setup.addPlayer')}
            </button>
          )}
          <label className="mt-2 flex items-start gap-2">
            <input
              type="checkbox"
              className="mt-1 size-4"
              checked={jones}
              onChange={(e) => setJones(e.target.checked)}
            />
            <span>
              <span className="font-bold">{t('setup.jones')}</span>
              <span className="block text-fg-muted text-sm">{t('setup.jonesHint')}</span>
            </span>
          </label>
        </fieldset>

        <fieldset className="card flex flex-col gap-3 p-4">
          <legend className="px-1 font-bold">{t('setup.difficulty')}</legend>
          <div className="flex flex-wrap gap-2" role="radiogroup">
            {[...DIFFICULTIES, 'custom' as const].map((d) => (
              <label key={d} className="chip-toggle">
                <input
                  type="radio"
                  name="difficulty"
                  className="sr-only"
                  checked={difficulty === d}
                  onChange={() => pickDifficulty(d)}
                />
                {d === 'custom' ? t('setup.custom') : t(`difficulty.${d}`)}
              </label>
            ))}
          </div>
          <div className="grid gap-2">
            {GOAL_KEYS.map((goal) => {
              const range = goalRange(goal);
              const value = goals[goal];
              return (
                <label key={goal} className="grid grid-cols-[7rem_1fr_5rem] items-center gap-2">
                  <span>{t(`goal.${goal}`)}</span>
                  <input
                    type="range"
                    aria-label={t('setup.goalTarget', { goal: t(`goal.${goal}`) })}
                    min={range.min}
                    max={range.max}
                    step={range.step}
                    value={value}
                    disabled={difficulty !== 'custom'}
                    onChange={(e) => setGoals({ ...goals, [goal]: Number(e.target.value) })}
                  />
                  <span className="tabular text-right">
                    {goal === 'wealth' ? money(value) : value}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="card flex flex-col gap-3 p-4">
          <legend className="px-1 font-bold">{t('setup.weekLimit')}</legend>
          <div className="flex flex-wrap gap-2" role="radiogroup">
            {WEEK_LIMITS.map((w) => (
              <label key={String(w)} className="chip-toggle">
                <input
                  type="radio"
                  name="weekLimit"
                  className="sr-only"
                  checked={weekLimit === w}
                  onChange={() => setWeekLimit(w)}
                />
                {w === null ? t('setup.noLimit') : t('setup.weeks', { count: w })}
              </label>
            ))}
          </div>
          <label className="flex items-center gap-2">
            <span>{t('setup.seed')}</span>
            <input
              className="input flex-1 font-mono"
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
            />
          </label>
        </fieldset>

        <div className="flex gap-3">
          <button type="button" className="btn" onClick={() => go({ name: 'title' })}>
            {t('setup.back')}
          </button>
          <button type="submit" className="btn btn-primary flex-1">
            {t('setup.start')}
          </button>
        </div>
      </form>
    </main>
  );
}
