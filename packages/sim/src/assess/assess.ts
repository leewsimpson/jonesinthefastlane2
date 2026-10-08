/**
 * Choice assessment (simulator §6, SIM-07). For sampled weekend decisions, clone the game, force each option and play
 * short rollouts with the same persona. Rollout *r* uses the same bot seed for every option (common random numbers),
 * so differences come from the choice, not the dice. Each situation gets an expected value per option and a regret
 * for the bot's own pick; `classify` turns many situations into a verdict per choice point.
 */
import type { Engine, GameState } from '@fastlane/engine';
import { createRng, scores } from '@fastlane/engine';
import type { Bot } from '../game.ts';
import { botFor, type Matchup, setupFor } from '../runner/record.ts';
import { applyScenario } from '../scenario.ts';

export interface AssessOptions {
  /** Share of weekend decisions to assess, in basis points. */
  rateBp: number;
  rollouts: number;
  /** Weeks each rollout plays before its value is taken. */
  horizonWeeks: number;
}

/** One assessed decision: what each option was worth to this player here, and what the bot picked. */
export interface Situation {
  event: string;
  persona: string;
  matchup: string;
  seed: string;
  week: number;
  /** Mean rollout value per option, in score basis points (a win adds `WIN_BONUS_BP` per week to spare). */
  values: Record<string, number>;
  chosen: string;
  best: string;
  regret: number;
}

/** A win before the horizon is worth more than any score: 100% plus this much per week it saved. */
export const WIN_BONUS_BP = 250;

/** The player's value when a rollout stops. */
export function rolloutValue(
  engine: Engine,
  state: GameState,
  player: string,
  stopWeek: number,
): number {
  if (state.phase.kind === 'gameOver') {
    const { result } = state.phase;
    if (result.winner === player && result.reason === 'win')
      return 10_000 + WIN_BONUS_BP * Math.max(0, stopWeek - result.week);
    return result.scores[player] ?? 0;
  }
  return scores(engine.content, state)[player] ?? 0;
}

/** Plays every human seat with its bot until `stopWeek` starts or the game ends. */
export function playUntil(
  engine: Engine,
  state: GameState,
  bots: Map<string, Bot>,
  stopWeek: number,
) {
  let guard = 0;
  while (state.phase.kind !== 'gameOver' && state.week < stopWeek) {
    const seat = state.pending?.player ?? (state.phase.kind === 'turn' ? state.phase.player : '');
    const bot = bots.get(seat);
    if (!bot) throw new Error(`no bot for seat ${seat}`);
    if (++guard > 50_000) throw new Error('rollout did not finish');
    const result = engine.reduceInPlace(state, bot.choose(engine, state));
    if (!result.ok) throw new Error(`${bot.id} chose an illegal action: ${result.error.code}`);
  }
}

const seatBots = (engine: Engine, matchup: Matchup, seed: string) =>
  new Map(
    matchup.bots.map((id, i) => [`p${i + 1}`, botFor(engine.content, id, `${seed}|seat${i + 1}`)]),
  );

/** Play one game and assess a sample of its human weekend decisions. */
export function assessGame(
  engine: Engine,
  matchup: Matchup,
  seed: string,
  options: AssessOptions,
): { situations: Situation[]; picked: string[] } {
  const bots = seatBots(engine, matchup, seed);
  const sample = createRng(`${seed}|assess`);
  const { state } = engine.newGame(setupFor(matchup, seed));
  if (matchup.start) applyScenario(state, matchup.start);
  const found: Situation[] = [];
  const picked = new Set<string>();
  let guard = 0;
  while (state.phase.kind !== 'gameOver') {
    if (++guard > 50_000) throw new Error('assessed game did not finish');
    const decision = state.pending;
    const seat = decision?.player ?? (state.phase.kind === 'turn' ? state.phase.player : '');
    const bot = bots.get(seat);
    if (!bot) throw new Error(`no bot for seat ${seat}`);
    const action = bot.choose(engine, state);
    if (decision?.subject && action.type === 'decide')
      picked.add(`${decision.subject}.${action.optionId}`);
    if (
      decision?.subject &&
      action.type === 'decide' &&
      decision.options.length > 1 &&
      sample.chance(options.rateBp)
    ) {
      const stopWeek = state.week + options.horizonWeeks;
      const values: Record<string, number> = {};
      for (const option of decision.options) {
        let total = 0;
        for (let r = 0; r < options.rollouts; r++) {
          const copy = structuredClone(state);
          const rolloutBots = seatBots(engine, matchup, `${seed}|rollout${r}|w${state.week}`);
          const forced = engine.reduceInPlace(copy, {
            type: 'decide',
            decisionId: decision.id,
            optionId: option,
          });
          if (!forced.ok) throw new Error(`can't force ${option}: ${forced.error.code}`);
          playUntil(engine, copy, rolloutBots, stopWeek);
          total += rolloutValue(engine, copy, seat, stopWeek);
        }
        values[option] = Math.round(total / options.rollouts);
      }
      const best = decision.options.reduce((a, b) => ((values[b] ?? 0) > (values[a] ?? 0) ? b : a));
      found.push({
        event: decision.subject,
        persona: bot.id,
        matchup: matchup.id,
        seed,
        week: state.week,
        values,
        chosen: action.optionId,
        best,
        regret: (values[best] ?? 0) - (values[action.optionId] ?? 0),
      });
    }
    const result = engine.reduceInPlace(state, action);
    if (!result.ok) throw new Error(`${bot.id} chose an illegal action: ${result.error.code}`);
  }
  return { situations: found, picked: [...picked].sort() };
}

export type ChoiceClass = 'meaningful' | 'no-brainer' | 'trap' | 'flat' | 'dead';

export interface ChoiceVerdict {
  event: string;
  class: ChoiceClass;
  situations: number;
  /** For each option: how often it was best, how often the bots picked it, and its mean regret when picked. */
  options: Record<string, { bestShare: number; pickShare: number; meanRegret: number }>;
  /** Option ids the verdict is about: the no-brainer, the trap, or the dead options. */
  about: string[];
  note: string;
}

/** Thresholds for `classify` (simulator §6), in basis points of score. */
export const CLASSIFY = {
  /** Options closer than this are within noise of each other. */
  flatBp: 100,
  /** Best in more than this share of situations, for every persona that met it: a no-brainer. */
  noBrainerShareBp: 9000,
  /** Picked in at least this share of situations... */
  trapPickBp: 3000,
  /** ...with at least this mean regret when picked: a trap. */
  trapRegretBp: 300,
  /** Fewer situations than this can't support a verdict. */
  minSituations: 3,
};

const share = (part: number, whole: number) => Math.round((part * 10_000) / Math.max(1, whole));

/**
 * One verdict per weekend event, from its assessed situations and the event's option ids. `picked` lists every
 * `event.option` any game used, for the dead check: an option no bot but `random` ever picked is dead.
 */
export function classify(
  eventOptions: Map<string, string[]>,
  situations: Situation[],
  picked: Set<string>,
): ChoiceVerdict[] {
  const verdicts: ChoiceVerdict[] = [];
  for (const [event, ids] of eventOptions) {
    if (ids.length < 2) continue;
    const here = situations.filter((s) => s.event === event);
    const options: ChoiceVerdict['options'] = {};
    for (const id of ids) {
      const chosen = here.filter((s) => s.chosen === id);
      options[id] = {
        bestShare: share(here.filter((s) => s.best === id).length, here.length),
        pickShare: share(chosen.length, here.length),
        meanRegret: chosen.length
          ? Math.round(chosen.reduce((a, s) => a + s.regret, 0) / chosen.length)
          : 0,
      };
    }
    const verdict = (cls: ChoiceClass, about: string[], note: string) =>
      verdicts.push({ event, class: cls, situations: here.length, options, about, note });

    const dead = ids.filter((id) => !picked.has(`${event}.${id}`));
    if (dead.length === ids.length) {
      verdict(
        'dead',
        dead,
        'event never drawn for a strategy bot: check its conditions and weight',
      );
      continue;
    }
    if (dead.length > 0) {
      verdict('dead', dead, 'drawn, but this option was never picked');
      continue;
    }
    if (here.length < CLASSIFY.minSituations) {
      verdict('meaningful', [], `only ${here.length} situations assessed: no evidence against it`);
      continue;
    }
    const spread = (s: Situation) => {
      const v = Object.values(s.values);
      return Math.max(...v) - Math.min(...v);
    };
    const flatShare = share(here.filter((s) => spread(s) < CLASSIFY.flatBp).length, here.length);
    if (flatShare >= 8000) {
      verdict(
        'flat',
        ids,
        `options within ${CLASSIFY.flatBp / 100}% in ${flatShare / 100}% of cases`,
      );
      continue;
    }
    // A no-brainer is best almost always, for every persona that met it, when the choice isn't flat.
    const decisive = here.filter((s) => spread(s) >= CLASSIFY.flatBp);
    const personas = [...new Set(decisive.map((s) => s.persona))];
    const always = ids.find((id) =>
      personas.every((p) => {
        const mine = decisive.filter((s) => s.persona === p);
        return (
          share(mine.filter((s) => s.best === id).length, mine.length) > CLASSIFY.noBrainerShareBp
        );
      }),
    );
    if (always && decisive.length >= CLASSIFY.minSituations) {
      verdict('no-brainer', [always], `best in every persona's decisive cases`);
      continue;
    }
    const traps = ids.filter((id) => {
      const o = options[id];
      return o && o.pickShare >= CLASSIFY.trapPickBp && o.meanRegret >= CLASSIFY.trapRegretBp;
    });
    if (traps.length > 0) {
      verdict('trap', traps, 'picked often, but costs more than the alternative');
      continue;
    }
    verdict('meaningful', [], 'best option depends on who and when');
  }
  return verdicts;
}

/** Mean regret per persona (simulator §6.4): high regret for `balanced` means the bot is weak, not the game. */
export function regretByPersona(situations: Situation[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const persona of new Set(situations.map((s) => s.persona))) {
    const mine = situations.filter((s) => s.persona === persona);
    out[persona] = Math.round(mine.reduce((a, s) => a + s.regret, 0) / mine.length);
  }
  return out;
}
