import { z } from 'zod';
import type { Ai, Condition, News, Quest, WeekendEvent } from './hooks.ts';
import {
  ACTION_KINDS,
  ANYWHERE,
  DEBT_KINDS,
  DIFFICULTIES,
  FEED_MOMENTS,
  GOAL_KEYS,
  MODIFIER_TARGETS,
  SAVINGS_ID,
  STAT_KEYS,
  TEASERS,
} from './keys.ts';
import {
  Bp,
  BpRange,
  Cents,
  Chance,
  EffectsSchema,
  Id,
  IntRange,
  Minutes,
  PositiveMinutes,
  StatDeltas,
  StatKeySchema,
  StatRange,
} from './primitives.ts';

export * from './hooks.ts';
export * from './keys.ts';
export * from './primitives.ts';

/** Top-level content manifest (FR-74, NFR-15). */
export const MetaSchema = z.object({
  contentVersion: z.number().int().positive(),
  defaultCity: z.string().min(1),
});

export type Meta = z.infer<typeof MetaSchema>;

/** A flat modifier on a target quantity from an item or subscription (engine-design §8.3). */
const ModifierSchema = z.object({ target: z.enum(MODIFIER_TARGETS), bp: Bp.min(-10_000) });

/** A stat threshold that scales a target quantity while the stat is below it (FR-21), e.g. low energy. */
export const StatModifierSchema = z.object({
  /** Also the copy key suffix: `modifier.<id>`. */
  id: Id,
  stat: StatKeySchema,
  below: z.number().int(),
  target: z.enum(MODIFIER_TARGETS),
  /** Basis points added to ×1 (10 000). −2000 is −20%. */
  bp: Bp.min(-10_000),
});

export type StatModifier = z.infer<typeof StatModifierSchema>;

const GoalTargetsSchema = z.object({
  /** Net worth in cents. */
  wealth: z.number().int().positive(),
  /** Wellbeing score, 0–100. */
  wellbeing: z.number().int().positive().max(100),
  /** Credential points plus skill points. */
  skills: z.number().int().positive(),
  /** Career points: job level × stability, plus reputation. */
  career: z.number().int().positive(),
});

export type GoalTargets = z.infer<typeof GoalTargetsSchema>;

/** A market regime (FR-55): weekly returns per asset while it lasts. */
const RegimeSchema = z.object({
  id: Id,
  /** Chance of being picked when the previous regime ends. */
  weight: z.number().int().nonnegative(),
  weeks: IntRange.refine((r) => r.min >= 1, 'a regime lasts at least a week'),
  /** Weekly return per asset id, in basis points. */
  returnsBp: z.record(z.string(), BpRange),
});

const AssetSchema = z.object({
  id: Id,
  /** Weekly chance of a crash on top of the regime's return, e.g. a crypto rug-pull (FR-53). */
  crashChanceBp: Chance,
  crashBp: Bp.min(-10_000).max(0),
});

/** Global balance constants (NFR-15). City-specific prices, wages and rents live in the city profile (FR-33). */
export const BalanceSchema = z
  .object({
    /** Discretionary waking minutes per week (FR-01). */
    weekMinutes: PositiveMinutes,
    /** Inclusive range for every stat. `max: null` means unbounded (cash). Cash is in cents. */
    statRanges: z.record(StatKeySchema, StatRange),
    startingStats: z.record(StatKeySchema, z.number().int()),
    /** Dress tier ids, lowest first. The wardrobe stat is an index into this list. */
    wardrobeTiers: z.array(Id).min(1),
    /** Energy gained per unspent hour when the week ends (FR-04). Rounded down. */
    restBonusEnergyPerHour: z.number().int().nonnegative(),
    /** Checked in this order; the UI lists them in this order (FR-21). */
    statModifiers: z.array(StatModifierSchema),
    /** Applied by the food check when the player didn't eat during the week (§4 Hunger). */
    hungerPenalty: StatDeltas,
    /** Weekly sleep recovery and stat decay, applied after the food check (FR-05). */
    weeklyDrift: StatDeltas,

    /** Jobs and careers (FR-40–FR-43). */
    jobs: z.object({
      /** Most a job lets you work per week, before any hours cut. */
      maxWeeklyMinutes: PositiveMinutes,
      ratingStart: z.number().int().min(0).max(100),
      /** Performance gained per hour worked. */
      ratingPerHour: z.number().int().nonnegative(),
      /** Performance lost in a week with no shifts. At 0 the player is let go. */
      noShowPenalty: z.number().int().nonnegative(),
      /** Performance needed for a promotion. */
      promotionRating: z.number().int().min(0).max(100),
    }),
    /** AI disruption (FR-42). Weekly chance = base rate × exposure × news. */
    aiDisruption: z.object({
      baseRateBp: Chance,
      /** Relative odds of each outcome when a job is hit. */
      outcomeWeights: z.object({
        hoursCut: z.number().int().nonnegative(),
        restructure: z.number().int().nonnegative(),
        layoff: z.number().int().nonnegative(),
      }),
      /** Added to the job's weekly hours cap per hours cut. */
      hoursCutBp: Bp.max(0),
      /** The cap never falls below this. */
      minHoursCapBp: Chance,
      /** Added to the job's wage per restructure. */
      restructureWageBp: Bp.max(0),
      minWageBp: Chance,
      /** The skill track that protects against disruption and raises output. */
      track: Id,
      exposureCutPerPointBp: Bp.min(0),
      maxExposureCutBp: Chance,
      outputPerPointBp: Bp.min(0),
      maxOutputBp: Bp.min(0),
    }),
    /** GigHub (FR-44). Pay rates are city data. */
    gig: z.object({
      deactivationChanceBp: Chance,
      deactivationWeeks: z.number().int().positive(),
    }),
    /** Skill tracks (§3 Skills). Skill points per track = ⌊√(hours studied × pointsScale)⌋, so broad learning pays. */
    skills: z.object({ tracks: z.array(Id).min(1), pointsScale: z.number().int().positive() }),
    /** Leases (FR-51, FR-14). */
    housing: z.object({
      leaseWeeks: z.number().int().positive(),
      /** Rent rise rolled at each renewal. */
      renewalHikeBp: BpRange,
      /** Consecutive weeks of missed rent before eviction to the first housing tier. */
      evictAfterMissed: z.number().int().positive(),
    }),
    /** Inflation (FR-50): weekly drift of the price index; wages close part of the gap each week. */
    inflation: z.object({ weeklyDriftBp: BpRange, wageCatchUpBp: Chance }),
    /** Banking and debt (FR-53, FR-54). Weekly rates in parts per million. */
    finance: z.object({
      savingsWeeklyPpm: z.number().int().nonnegative(),
      card: z.object({
        weeklyPpm: z.number().int().nonnegative(),
        /** Credit limit by score: the highest band whose `minScore` the player meets. */
        limits: z.array(z.object({ minScore: z.number().int(), limit: Cents })).min(1),
      }),
      studentWeeklyPpm: z.number().int().nonnegative(),
      /** Minimum weekly payment on card and student debt: this share of the balance, at least `minPayment`. */
      minPaymentBp: Chance,
      minPayment: Cents,
      lateFee: Cents,
      /** Consecutive missed payments before a debt goes to collections. */
      collectionsAfter: z.number().int().positive(),
      collectionsFee: Cents,
      /** Credit score changes. */
      credit: z.object({
        /** Per debt payment made in full. */
        onTime: z.number().int(),
        /** Per week of rent paid in full, so a debt-free renter can build credit too. */
        onTimeRent: z.number().int(),
        missed: z.number().int(),
        collections: z.number().int(),
        missedRent: z.number().int(),
        eviction: z.number().int(),
      }),
    }),
    /** Market simulation (FR-55): a seeded random walk with regimes. */
    market: z.object({
      assets: z.array(AssetSchema).min(1),
      regimes: z.array(RegimeSchema).min(1),
      startRegime: Id,
    }),
    /** Goals and scoring (§3, FR-10–FR-12). */
    goals: z.object({
      presets: z.record(z.enum(DIFFICULTIES), GoalTargetsSchema),
      /** Wellbeing = mean of the parts − this share of (mean − lowest part). */
      wellbeingLowPartPenaltyBp: Chance,
      /** Career points per job level, before stability. */
      careerPointsPerLevel: z.number().int().positive(),
      /** Stability = 1 − exposure × this. */
      stabilityExposureBp: Chance,
    }),
    /** Weekend events (FR-70). */
    events: z.object({
      /** Weekly chance of drawing a card from the deck. Burnout cards come regardless. */
      chanceBp: Chance,
      /** Default weeks before the same card can come up again for a player. */
      cooldownWeeks: z.number().int().nonnegative(),
    }),
    /** The news ticker (FR-72). */
    news: z.object({
      /** Weekly chance of a new story while fewer than `maxActive` run. */
      chanceBp: Chance,
      maxActive: z.number().int().positive(),
    }),
    /** Micro-goals (ENG-11). */
    quests: z.object({
      /** Quests each player has on the go; topped up every week (1–3, ENG-11). */
      active: z.number().int().min(1).max(3),
      /** Weeks before a finished or failed quest can be issued again. */
      cooldownWeeks: z.number().int().nonnegative(),
    }),
    /** Next-week teasers (ENG-10): how close counts as "close". */
    teasers: z.object({
      /** A promotion teaser shows once the rating is this close to `jobs.promotionRating`. */
      promotionRatingGap: z.number().int().nonnegative(),
      /** A credential teaser shows once this many study minutes or fewer are left. */
      credentialMinutes: Minutes,
    }),
    /** Rival tension and near misses (ENG-13, ENG-14). */
    rival: z.object({
      /** A goal at or above this progress, but short of it, is a near miss. */
      nearMissBp: Chance,
      /** Jones posts about a net-worth jump of at least this much in a week, in cents. */
      netWorthJump: Cents,
      /** "Jones is close" teaser: a rival's score within this many basis points of the player's, or ahead. */
      closeBp: Chance,
    }),
  })
  .superRefine((b, ctx) => {
    for (const key of STAT_KEYS) {
      const range = b.statRanges[key];
      const start = b.startingStats[key];
      if (start < range.min || (range.max !== null && start > range.max)) {
        ctx.addIssue({
          code: 'custom',
          path: ['startingStats', key],
          message: `starting ${key} is outside its range`,
        });
      }
    }
    if (b.statRanges.wardrobe.max !== b.wardrobeTiers.length - 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['statRanges', 'wardrobe'],
        message: 'wardrobe max must be the last wardrobe tier index',
      });
    }
  });

export type Balance = z.infer<typeof BalanceSchema>;

/** A travel mode (FR-02). Time, money and energy grow with the distance around the loop. */
export const TransportModeSchema = z
  .object({
    id: Id,
    minutesBase: Minutes,
    minutesPerStep: Minutes,
    costBase: Cents,
    costPerStep: Cents,
    energyPerStep: z.number().int().nonnegative(),
    /** Item the player must own to use this mode. */
    requiresItem: Id.optional(),
  })
  .refine((m) => m.minutesBase + m.minutesPerStep > 0, 'a trip takes time');

export type TransportMode = z.infer<typeof TransportModeSchema>;

export const LocationSchema = z.object({
  id: Id,
});

export type Location = z.infer<typeof LocationSchema>;

/** The board is a loop: travel distance is the shorter way round (FR-30). */
export const BoardSchema = z.object({
  /** Locations in loop order. */
  locations: z.array(LocationSchema).min(2),
  /** `segments[i]` is the distance from `locations[i]` to the next one, wrapping round. */
  segments: z.array(z.number().int().positive()),
  /** Where each player starts the week. */
  home: Id,
  transportModes: z.array(TransportModeSchema).min(1),
});

export type Board = z.infer<typeof BoardSchema>;

/** Something a player can do at a location (FR-03). Its label is the copy key `action.<id>`. */
export const LocationActionSchema = z.object({
  id: Id,
  /** A board location, or `*` for anywhere (GigHub, FR-44). */
  location: z.union([Id, z.literal(ANYWHERE)]),
  /** The engine handler that runs it (engine-design §8.2). */
  kind: z.enum(ACTION_KINDS),
  /** Fixed length, or the shortest choice when `durations` is set. */
  minutes: PositiveMinutes,
  /** Lengths the player can pick (work, study, gigs). Effects are then per hour. */
  durations: z.array(PositiveMinutes).min(1).optional(),
  /** Amount presets offered for money actions (deposit, withdraw, borrow, repay), in cents. */
  amounts: z.array(Cents.refine((c) => c > 0, 'must be positive')).optional(),
  /** Paid up front; the action is unavailable if the player can't afford it. Scaled by the price index. */
  cost: Cents,
  /**
   * Stat changes on completion. A `cash` effect is money earned and can't be negative: costs go in `cost`, which
   * the preview checks against cash (engine-design §10).
   */
  effects: EffectsSchema,
  /** Positive effects are scaled by modifiers on this target (e.g. low energy on `workOutput`). */
  outputTarget: z.enum(MODIFIER_TARGETS).optional(),
  /** Needs an owned item, or at least this housing tier. */
  requires: z.object({ item: Id.optional(), housing: Id.optional() }).optional(),
  /** `enroll`: put the tuition on a student loan instead of paying cash (§5). */
  loan: z.boolean().optional(),
  /** `work-shift`: work here for a remote job (FR-46) instead of at the employer. */
  remote: z.boolean().optional(),
  /** First week this is offered (FR-15). Absent means week 1. */
  unlockWeek: z.number().int().min(2).optional(),
});

export type LocationAction = z.infer<typeof LocationActionSchema>;

/** A job (FR-40). Wages are per hour and scaled by the wage index (FR-50). */
export const JobSchema = z.object({
  id: Id,
  /** The employer: where shifts are worked. */
  location: Id,
  /** Career ladder id (FR-41). Levels on a ladder run 1, 2, 3, … */
  ladder: Id,
  level: z.number().int().positive(),
  /** Cents per hour. */
  wage: Cents,
  /** Minimum wardrobe tier index. */
  dressTier: z.number().int().nonnegative(),
  /** Minutes worked on this ladder before you qualify. */
  minExperience: Minutes,
  requires: z.object({
    credentials: z.array(Id),
    /** Minimum skill points per track. */
    skills: z.record(z.string(), z.number().int().positive()),
  }),
  /** Relative AI risk (FR-42), not a weekly chance. */
  aiExposureBp: Chance,
  benefits: z.object({ health: z.boolean(), pto: z.boolean() }),
  /** Can be worked from Your Place (FR-46). */
  remote: z.boolean(),
  /** Weekly chance of an opening at JobLink. Entry jobs that are always open keep the no-softlock floor (FR-14). */
  openChanceBp: Chance,
});

export type Job = z.infer<typeof JobSchema>;

/** A credential course at UpSkill U (§5). */
export const CourseSchema = z.object({
  id: Id,
  type: z.enum(['cert', 'bootcamp', 'degree']),
  track: Id,
  tuition: Cents,
  /** Study minutes to earn the credential. */
  studyMinutes: PositiveMinutes,
  /** Points toward the Skills goal (§3). */
  credentialPoints: z.number().int().positive(),
  /** Tuition can go on a student loan. */
  loanEligible: z.boolean(),
});

export type Course = z.infer<typeof CourseSchema>;

/** A housing tier (FR-51), lowest first. The first tier is the eviction fallback: free, no deposit, no checks. */
export const HousingTierSchema = z.object({
  id: Id,
  /** Weekly rent in cents, locked when the lease is signed. */
  rent: Cents,
  deposit: Cents,
  minCreditScore: z.number().int(),
  /** Stat changes each week you live here (better rest and happiness, FR-51). */
  weekly: StatDeltas,
});

export type HousingTier = z.infer<typeof HousingTierSchema>;

/** Something to buy (FR-60). Durable items are owned once; `meals` items are groceries added to the pantry. */
export const ItemSchema = z.object({
  id: Id,
  /** The location that sells it. */
  shop: Id,
  price: Cents,
  /** Resale value as a share of the base price; net worth counts items at this (§3 Wealth). */
  resaleBp: Chance,
  modifiers: z.array(ModifierSchema),
  /** Stat changes each week you own it. */
  weekly: StatDeltas,
  /** Clothing: owning it raises the wardrobe stat to this tier index. */
  wardrobeTier: z.number().int().nonnegative().optional(),
  /** Groceries: stored meals added per purchase. Not owned as an item. */
  meals: z.number().int().positive().optional(),
  /** Needs another item first (groceries need a fridge). */
  requiresItem: Id.optional(),
});

export type Item = z.infer<typeof ItemSchema>;

/** A weekly subscription (FR-52). */
export const SubscriptionSchema = z.object({
  id: Id,
  weeklyCost: Cents,
  modifiers: z.array(ModifierSchema),
  weekly: StatDeltas,
  /** Meals delivered each week; they count for the food check. */
  meals: z.number().int().nonnegative().optional(),
  requiresItem: Id.optional(),
  /** First week this can be started (FR-15). Absent means week 1. */
  unlockWeek: z.number().int().min(2).optional(),
});

export type Subscription = z.infer<typeof SubscriptionSchema>;

/** The files of a city profile folder, `cities/<id>/`, besides `city.json`, by the `City` field each fills. */
export const CITY_FILES = {
  jobs: 'jobs.json',
  courses: 'courses.json',
  housing: 'housing.json',
  items: 'items.json',
  subscriptions: 'subscriptions.json',
} as const;

/** Everything city-specific (FR-33): board, actions, wages, prices and rents. Its name is the copy key `city.<id>`. */
export const CitySchema = z.object({
  id: Id,
  board: BoardSchema,
  actions: z.array(LocationActionSchema),
  /** GigHub pay per hour, before the wage index (FR-44). */
  gigPayPerHour: IntRange,
  jobs: z.array(JobSchema),
  courses: z.array(CourseSchema),
  housing: z.array(HousingTierSchema).min(1),
  items: z.array(ItemSchema),
  subscriptions: z.array(SubscriptionSchema),
});

export type City = z.infer<typeof CitySchema>;

/** The resolved content the engine runs against. */
export interface GameContent {
  meta: Meta;
  balance: Balance;
  city: City;
  /** Weekend event deck (FR-70). */
  events: WeekendEvent[];
  /** News stories (FR-72). */
  news: News[];
  /** Micro-goals (ENG-11). */
  quests: Quest[];
  /** Jones and the utility scorer (FR-80–FR-83). */
  ai: Ai;
}

/** UI copy, keyed by string key (NFR-06). Content holds ids; copy lives in `locales/<lang>.json`. */
export const StringsSchema = z.record(z.string(), z.string().min(1));

export type Strings = z.infer<typeof StringsSchema>;

/** Kinds that need a `durations` list, and kinds that need `amounts`. */
const DURATION_KINDS = new Set(['work-shift', 'gig', 'study']);
const AMOUNT_KINDS = new Set(['deposit', 'withdraw', 'borrow', 'repay']);

/** Cross-file and cross-reference checks that a single schema can't express. Returns problems found. */
export function checkContent(content: GameContent): string[] {
  const problems: string[] = [];
  const { balance, city } = content;
  const { board, actions } = city;
  const dupes = (ids: string[]) => ids.filter((id, i) => ids.indexOf(id) !== i);
  const unique = (what: string, ids: string[]) => {
    for (const id of dupes(ids)) problems.push(`duplicate ${what} id "${id}"`);
  };

  const locationIds = board.locations.map((l) => l.id);
  const itemIds = city.items.map((i) => i.id);
  const courseIds = city.courses.map((c) => c.id);
  const housingIds = city.housing.map((h) => h.id);
  const assetIds = balance.market.assets.map((a) => a.id);
  const tracks = balance.skills.tracks;
  unique('location', locationIds);
  unique(
    'transport mode',
    board.transportModes.map((m) => m.id),
  );
  unique(
    'action',
    actions.map((a) => a.id),
  );
  unique(
    'stat modifier',
    balance.statModifiers.map((m) => m.id),
  );
  unique(
    'job',
    city.jobs.map((j) => j.id),
  );
  unique('course', courseIds);
  unique('housing', housingIds);
  unique('item', itemIds);
  unique(
    'subscription',
    city.subscriptions.map((s) => s.id),
  );
  unique('asset', assetIds);
  unique(
    'regime',
    balance.market.regimes.map((r) => r.id),
  );
  unique('track', tracks);

  if (board.segments.length !== locationIds.length)
    problems.push('the board needs one segment per location');
  if (!locationIds.includes(board.home)) problems.push(`home "${board.home}" is not a location`);
  if (!board.transportModes.some((m) => !m.requiresItem))
    problems.push('at least one transport mode must need no item');
  for (const m of board.transportModes)
    if (m.requiresItem && !itemIds.includes(m.requiresItem))
      problems.push(`transport mode "${m.id}" needs unknown item "${m.requiresItem}"`);

  for (const a of actions) {
    if (a.location !== ANYWHERE && !locationIds.includes(a.location))
      problems.push(`action "${a.id}" is at unknown location "${a.location}"`);
    const longest = Math.max(a.minutes, ...(a.durations ?? []));
    if (longest > balance.weekMinutes) problems.push(`action "${a.id}" takes longer than a week`);
    if (DURATION_KINDS.has(a.kind) !== (a.durations !== undefined))
      problems.push(`action "${a.id}": durations are for work, gig and study actions only`);
    if (a.durations?.some((d) => d % a.minutes !== 0))
      problems.push(`action "${a.id}": durations must be whole multiples of its minutes`);
    if (AMOUNT_KINDS.has(a.kind) !== (a.amounts !== undefined))
      problems.push(`action "${a.id}": amounts are for money actions only`);
    if (a.requires?.item && !itemIds.includes(a.requires.item))
      problems.push(`action "${a.id}" needs unknown item "${a.requires.item}"`);
    if (a.requires?.housing && !housingIds.includes(a.requires.housing))
      problems.push(`action "${a.id}" needs unknown housing "${a.requires.housing}"`);
  }

  const ladders = new Map<string, number[]>();
  for (const j of city.jobs) {
    if (!locationIds.includes(j.location))
      problems.push(`job "${j.id}" is at unknown location "${j.location}"`);
    if (j.dressTier >= balance.wardrobeTiers.length)
      problems.push(`job "${j.id}" needs an unknown dress tier`);
    for (const c of j.requires.credentials)
      if (!courseIds.includes(c)) problems.push(`job "${j.id}" needs unknown credential "${c}"`);
    for (const t of Object.keys(j.requires.skills))
      if (!tracks.includes(t)) problems.push(`job "${j.id}" needs unknown skill track "${t}"`);
    ladders.set(j.ladder, [...(ladders.get(j.ladder) ?? []), j.level]);
  }
  for (const [ladder, levels] of ladders) {
    const sorted = [...levels].sort((a, b) => a - b);
    if (sorted.some((l, i) => l !== i + 1))
      problems.push(`ladder "${ladder}" needs one job per level, starting at 1`);
  }
  if (!city.jobs.some((j) => isEntryJob(j)))
    problems.push('at least one job must need nothing and always be open (FR-14)');
  // Every job can be worked at its employer with nothing extra, so an entry job really is a floor (FR-14).
  const onSite = (j: Job) =>
    actions.some(
      (a) => a.kind === 'work-shift' && !a.requires && !a.remote && a.location === j.location,
    );
  for (const j of city.jobs)
    if (!onSite(j)) problems.push(`job "${j.id}" has no work-shift action at its location`);
  if (city.jobs.some((j) => j.remote) && !actions.some((a) => a.kind === 'work-shift' && a.remote))
    problems.push('remote jobs need a remote work-shift action (FR-46)');

  for (const c of city.courses)
    if (!tracks.includes(c.track))
      problems.push(`course "${c.id}" is on unknown track "${c.track}"`);
  if (!tracks.includes(balance.aiDisruption.track))
    problems.push(`AI disruption track "${balance.aiDisruption.track}" is unknown`);

  const [fallback] = city.housing;
  if (fallback && (fallback.rent !== 0 || fallback.deposit !== 0))
    problems.push(`the first housing tier "${fallback.id}" must be free (FR-14)`);

  for (const i of city.items) {
    if (!locationIds.includes(i.shop))
      problems.push(`item "${i.id}" is sold at unknown "${i.shop}"`);
    if (i.requiresItem && !itemIds.includes(i.requiresItem))
      problems.push(`item "${i.id}" needs unknown item "${i.requiresItem}"`);
    if (i.wardrobeTier !== undefined && i.wardrobeTier >= balance.wardrobeTiers.length)
      problems.push(`item "${i.id}" has an unknown wardrobe tier`);
  }
  for (const s of city.subscriptions)
    if (s.requiresItem && !itemIds.includes(s.requiresItem))
      problems.push(`subscription "${s.id}" needs unknown item "${s.requiresItem}"`);

  if (assetIds.includes(SAVINGS_ID)) problems.push(`"${SAVINGS_ID}" is reserved, not an asset id`);
  const regimeIds = balance.market.regimes.map((r) => r.id);
  if (!regimeIds.includes(balance.market.startRegime))
    problems.push(`start regime "${balance.market.startRegime}" is unknown`);
  for (const r of balance.market.regimes)
    for (const a of assetIds)
      if (!r.returnsBp[a]) problems.push(`regime "${r.id}" has no return for asset "${a}"`);
  if (!balance.market.regimes.some((r) => r.weight > 0))
    problems.push('at least one market regime needs a positive weight');
  problems.push(...checkHooks(content));
  return problems;
}

/** Cross-references for events, news, quests and the rival (FR-74: every id an event uses resolves). */
function checkHooks(content: GameContent): string[] {
  const problems: string[] = [];
  const { balance, city, events, news, quests, ai } = content;
  const dupes = (what: string, ids: string[]) => {
    for (const id of ids.filter((x, i) => ids.indexOf(x) !== i))
      problems.push(`duplicate ${what} id "${id}"`);
  };
  dupes(
    'event',
    events.map((e) => e.id),
  );
  dupes(
    'news',
    news.map((n) => n.id),
  );
  dupes(
    'quest',
    quests.map((q) => q.id),
  );
  dupes(
    'persona',
    ai.rivals.map((p) => p.id),
  );

  const housingIds = city.housing.map((h) => h.id);
  const itemIds = city.items.map((i) => i.id);
  const condition = (where: string, c: Condition | undefined) => {
    if (!c) return;
    for (const h of c.housing ?? [])
      if (!housingIds.includes(h)) problems.push(`${where} needs unknown housing "${h}"`);
    for (const i of [...(c.items ?? []), ...(c.notItems ?? [])])
      if (!itemIds.includes(i)) problems.push(`${where} needs unknown item "${i}"`);
  };
  for (const e of events) {
    condition(`event "${e.id}"`, e.when);
    dupes(
      `choice (event "${e.id}")`,
      e.choices.map((c) => c.id),
    );
    for (const c of e.choices) condition(`event "${e.id}" choice "${c.id}"`, c.when);
    // A card can always be answered, however broke the player is (FR-14).
    if (!e.choices.some((c) => c.cost === 0 && !c.when))
      problems.push(`event "${e.id}" needs a free choice with no condition`);
    if (e.when?.job !== true && e.choices.some((c) => c.jobRating !== 0 || c.layoffWarning))
      problems.push(`event "${e.id}" changes the job, so it needs "when": { "job": true }`);
  }
  if (events.length > 0 && !events.some((e) => e.trigger === 'burnout'))
    problems.push('the deck needs a burnout card (§4 Energy)');
  if (events.length > 0 && !events.some((e) => !e.trigger))
    problems.push('the deck needs at least one regular card');

  const ladders = new Set(city.jobs.map((j) => j.ladder));
  const regimes = balance.market.regimes.map((r) => r.id);
  for (const n of news) {
    for (const x of n.effects.exposure)
      if (!ladders.has(x.ladder))
        problems.push(`news "${n.id}" changes unknown ladder "${x.ladder}"`);
    if (n.effects.regime && !regimes.includes(n.effects.regime))
      problems.push(`news "${n.id}" sets unknown regime "${n.effects.regime}"`);
  }
  for (const q of quests) condition(`quest "${q.id}"`, q.when);
  if (quests.length > 0 && quests.length < balance.quests.active)
    problems.push('there are fewer quests than a player has on the go');

  const personaIds = ai.rivals.map((p) => p.id);
  for (const d of DIFFICULTIES)
    if (!personaIds.includes(ai.byDifficulty[d]))
      problems.push(`rival for ${d} is unknown persona "${ai.byDifficulty[d]}"`);
  return problems;
}

/** A job anyone can get at any time: the "free basic job" of FR-14. */
export function isEntryJob(job: Job): boolean {
  return (
    job.level === 1 &&
    job.dressTier === 0 &&
    job.minExperience === 0 &&
    job.requires.credentials.length === 0 &&
    Object.keys(job.requires.skills).length === 0 &&
    job.openChanceBp === 10_000
  );
}

/** Every copy key the content refers to (NFR-06). */
export function contentStringKeys(content: GameContent): string[] {
  const { city, balance } = content;
  return [
    `city.${city.id}`,
    ...city.board.locations.map((l) => `location.${l.id}`),
    ...city.board.transportModes.map((m) => `transport.${m.id}`),
    ...city.actions.map((a) => `action.${a.id}`),
    ...balance.wardrobeTiers.map((t) => `wardrobe.${t}`),
    ...balance.statModifiers.map((m) => `modifier.${m.id}`),
    ...city.jobs.map((j) => `job.${j.id}`),
    ...[...new Set(city.jobs.map((j) => j.ladder))].map((l) => `ladder.${l}`),
    ...city.courses.map((c) => `course.${c.id}`),
    ...balance.skills.tracks.map((t) => `track.${t}`),
    ...city.housing.map((h) => `housing.${h.id}`),
    ...city.items.map((i) => `item.${i.id}`),
    ...city.subscriptions.map((s) => `subscription.${s.id}`),
    ...balance.market.assets.map((a) => `asset.${a.id}`),
    ...balance.market.regimes.map((r) => `regime.${r.id}`),
    ...GOAL_KEYS.map((g) => `goal.${g}`),
    ...DIFFICULTIES.map((d) => `difficulty.${d}`),
    ...DEBT_KINDS.map((d) => `debt.${d}`),
    `asset.${SAVINGS_ID}`,
    ...content.events.flatMap((e) => [
      `event.${e.id}`,
      `event.${e.id}.text`,
      ...e.choices.map((c) => `event.${e.id}.${c.id}`),
    ]),
    ...content.news.flatMap((n) => [`news.${n.id}`, `news.${n.id}.text`]),
    ...content.quests.map((q) => `quest.${q.id}`),
    ...content.ai.rivals.map((p) => `persona.${p.id}`),
    ...Object.keys(TEASERS).map((t) => `teaser.${t}`),
  ];
}

/** Jones needs a few lines per moment so the feed doesn't repeat itself (FR-84). */
export const MIN_FEED_VARIANTS = 3;

/** `{{slot}}` placeholders in a line of copy (i18next interpolation). */
const slotsOf = (text: string) => [...text.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1] ?? '');

/**
 * Copy keys the content needs but the strings file lacks, at least `MIN_FEED_VARIANTS` numbered lines per feed
 * moment (`feed.<moment>.1`, `.2`, …), and no slot a teaser or feed line can't fill.
 */
export function checkStrings(content: GameContent, strings: Strings): string[] {
  const problems = contentStringKeys(content)
    .filter((key) => strings[key] === undefined)
    .map((key) => `missing string "${key}"`);
  const slotCheck = (key: string, allowed: readonly string[]) => {
    for (const slot of slotsOf(strings[key] ?? ''))
      if (!allowed.includes(slot)) problems.push(`string "${key}" uses unknown slot "${slot}"`);
  };
  for (const [teaser, slots] of Object.entries(TEASERS)) slotCheck(`teaser.${teaser}`, slots);
  for (const [moment, slots] of Object.entries(FEED_MOMENTS)) {
    const n = feedVariants(strings, moment);
    if (n < MIN_FEED_VARIANTS)
      problems.push(`feed moment "${moment}" has ${n} lines, needs ${MIN_FEED_VARIANTS}`);
    for (let i = 1; i <= n; i++) slotCheck(`feed.${moment}.${i}`, slots);
  }
  return problems;
}

/** How many numbered lines `feed.<moment>.1`, `.2`, … the strings have, stopping at the first gap. */
export function feedVariants(strings: Strings, moment: string): number {
  let n = 0;
  while (strings[`feed.${moment}.${n + 1}`] !== undefined) n++;
  return n;
}
