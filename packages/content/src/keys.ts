/** Zod-free constants shared with the engine, so importing them never pulls Zod or content JSON into a bundle. */

/** Player stats with a numeric value (FR-20). Time is the weekly budget and is tracked separately. */
export const STAT_KEYS = [
  'cash',
  'energy',
  'health',
  'happiness',
  'social',
  'creditScore',
  'wardrobe',
] as const;
export type StatKey = (typeof STAT_KEYS)[number];

/** Engine handler for an action definition (engine-design §8.2). */
export const ACTION_KINDS = [
  'basic',
  'eat',
  'eat-stored',
  'work-shift',
  'gig',
  'apply-job',
  'enroll',
  'drop-course',
  'study',
  'buy',
  'rent-home',
  'subscribe',
  'unsubscribe',
  'subscription-audit',
  'deposit',
  'withdraw',
  'borrow',
  'repay',
] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];

/** Quantities a modifier can scale (engine-design §8.3, FR-21). */
export const MODIFIER_TARGETS = ['workOutput', 'studyOutput', 'travelTime'] as const;
export type ModifierTarget = (typeof MODIFIER_TARGETS)[number];

/** The four goals (§3). */
export const GOAL_KEYS = ['wealth', 'wellbeing', 'skills', 'career'] as const;
export type GoalKey = (typeof GOAL_KEYS)[number];

/** Difficulty presets (FR-10). `custom` means the setup gave its own targets. */
export const DIFFICULTIES = ['chill', 'standard', 'hustle-culture'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

/** Debts a player can owe (FR-54, FR-14). Arrears are unpaid bills and rent. */
export const DEBT_KINDS = ['card', 'student', 'arrears'] as const;
export type DebtKind = (typeof DEBT_KINDS)[number];

/** Where a player's savings sit. Market assets (index fund, crypto, …) are content (`balance.market.assets`). */
export const SAVINGS_ID = 'savings';

/** Location id for actions that are available everywhere, such as GigHub (FR-44). */
export const ANYWHERE = '*';

/** Weekend event categories (FR-71). */
export const EVENT_CATEGORIES = [
  'work',
  'money',
  'life',
  'health',
  'housing',
  'viral',
  'climate',
] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];

/**
 * Next-week teasers (ENG-10), in priority order, with the slots their copy may use. Copy key: `teaser.<id>`.
 * Money slots are cents; the UI formats them.
 */
export const TEASERS = {
  layoff: ['job'],
  'eviction-risk': ['owed'],
  'collections-risk': ['debt'],
  'lease-renewal': ['rent'],
  'rival-close': ['rival'],
  'promotion-close': ['job'],
  'credential-close': ['course', 'hours'],
  'quest-deadline': ['quest'],
  news: ['news'],
  'gig-back': [],
  'next-week': ['rival'],
} as const satisfies Record<string, readonly string[]>;
export type TeaserId = keyof typeof TEASERS;

/**
 * Moments Jones posts about in the highlight reel (FR-82), with the slots their lines may use. The engine picks the
 * moment and fills the slots; copy keys are `feed.<moment>.<n>`, several variants each (FR-84). `react-*` moments
 * react to a human's week; `overtook` and `fell-behind` are the rivalry beats (ENG-14).
 */
export const FEED_MOMENTS = {
  hired: ['job'],
  promoted: ['job'],
  credential: ['course'],
  'moved-up': ['home'],
  bought: ['item'],
  'net-worth-up': ['amount'],
  'quest-done': [],
  /** Jones drew a viral weekend card: it spins any attention as a win (FR-82). */
  'went-viral': [],
  'quiet-week': [],
  'react-hired': ['player', 'job'],
  'react-promoted': ['player', 'job'],
  'react-credential': ['player', 'course'],
  'react-moved-up': ['player', 'home'],
  'react-setback': ['player'],
  overtook: ['player'],
  'fell-behind': ['player'],
} as const satisfies Record<string, readonly string[]>;
export type FeedMoment = keyof typeof FEED_MOMENTS;
