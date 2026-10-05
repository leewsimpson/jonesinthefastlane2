/** Small hand-made content for rule tests, so tuning the real balance data never breaks them. */
import { BalanceSchema, CitySchema, type GameContent, MetaSchema } from '@fastlane/content';

export const fixtureContent: GameContent = {
  meta: MetaSchema.parse({ contentVersion: 1, defaultCity: 'test' }),
  balance: BalanceSchema.parse({
    weekMinutes: 600,
    statRanges: {
      cash: { min: 0, max: null },
      energy: { min: 0, max: 100 },
      health: { min: 0, max: 100 },
      happiness: { min: 0, max: 100 },
      social: { min: 0, max: 100 },
      creditScore: { min: 300, max: 850 },
      wardrobe: { min: 0, max: 1 },
    },
    startingStats: {
      cash: 2000,
      energy: 50,
      health: 50,
      happiness: 50,
      social: 50,
      creditScore: 600,
      wardrobe: 0,
    },
    wardrobeTiers: ['casual', 'smart'],
    restBonusEnergyPerHour: 2,
    statModifiers: [
      { id: 'low-energy', stat: 'energy', below: 20, target: 'workOutput', bp: -5000 },
    ],
    hungerPenalty: { energy: -10, health: -5 },
    weeklyDrift: { energy: 20, social: -3 },
  }),
  city: CitySchema.parse({
    id: 'test',
    board: {
      home: 'a',
      locations: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }],
      // a→b 1, b→c 1, c→d 1, d→e 1, e→a 2: a to e is 2 either way, a to d is 3 one way and 3 the other.
      segments: [1, 1, 1, 1, 2],
      transportModes: [
        {
          id: 'walk',
          minutesBase: 0,
          minutesPerStep: 60,
          costBase: 0,
          costPerStep: 0,
          energyPerStep: 2,
        },
        {
          id: 'cab',
          minutesBase: 15,
          minutesPerStep: 15,
          costBase: 500,
          costPerStep: 100,
          energyPerStep: 0,
        },
        {
          id: 'bike',
          minutesBase: 0,
          minutesPerStep: 30,
          costBase: 0,
          costPerStep: 0,
          energyPerStep: 0,
          requiresItem: 'bike',
        },
      ],
    },
    actions: [
      { id: 'rest', location: 'a', kind: 'basic', minutes: 120, cost: 0, effects: { energy: 10 } },
      { id: 'snack', location: 'b', kind: 'eat', minutes: 60, cost: 400, effects: { health: -1 } },
      {
        id: 'shift',
        location: 'c',
        kind: 'basic',
        minutes: 240,
        cost: 0,
        effects: { cash: 4000, energy: -15 },
        outputTarget: 'workOutput',
      },
      {
        id: 'party',
        location: 'b',
        kind: 'basic',
        minutes: 180,
        cost: 1000,
        effects: { social: { min: 2, max: 9 }, energy: -60 },
      },
      {
        id: 'grind',
        location: 'a',
        kind: 'basic',
        minutes: 600,
        cost: 0,
        effects: { cash: { min: 1000, max: 3000 } },
        outputTarget: 'workOutput',
      },
    ],
  }),
};
