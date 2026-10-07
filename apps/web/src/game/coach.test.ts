import type { GameState } from '@fastlane/engine';
import { describe, expect, it } from 'vitest';
import { coachStep } from './coach.ts';
import { content, engine } from './engine.ts';

const fresh = (): GameState =>
  engine.newGame({ seed: 'coach', players: [{ name: 'Ana', controller: 'human' }] }).state;

function me(state: GameState) {
  const p = state.players[0];
  if (!p) throw new Error('no player');
  return p;
}

describe('coachStep (ENG-20)', () => {
  const office = content.city.jobs.find((j) => !j.remote && j.location !== 'joblink');
  if (!office) throw new Error('need an on-site job away from JobLink');

  it('walks from no job to the first paycheck', () => {
    const s = fresh();
    expect(coachStep(content, s, me(s), false)).toMatchObject({
      id: 'findJob',
      target: 'go',
      location: 'joblink',
      n: 1,
    });
    me(s).location = 'joblink';
    expect(coachStep(content, s, me(s), false)).toMatchObject({ id: 'apply', target: 'actions' });
    me(s).job = { id: office.id } as never;
    expect(coachStep(content, s, me(s), false)).toMatchObject({
      id: 'goWork',
      location: office.location,
    });
    me(s).location = office.location;
    expect(coachStep(content, s, me(s), false)).toMatchObject({ id: 'work', target: 'quick' });
    expect(coachStep(content, s, me(s), true)).toMatchObject({ id: 'paid', target: 'end', n: 5 });
  });

  it('keeps coaching into week 2 until paid, then stops', () => {
    const s = fresh();
    s.week = 2;
    expect(coachStep(content, s, me(s), false)?.id).toBe('findJob');
    expect(coachStep(content, s, me(s), true)).toBeNull();
    s.week = 3;
    expect(coachStep(content, s, me(s), false)).toBeNull();
  });
});
