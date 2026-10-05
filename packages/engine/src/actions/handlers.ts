/**
 * Action handlers: the code for one action `kind`, split into a pure `plan` and an `apply` that carries the plan out
 * (engine-design §8.2). Content says where, which handler and with which numbers; new gameplay adds kinds, not
 * commands.
 */
import type { ActionKind } from '@fastlane/content/keys';
import { borrow, deposit, repay, withdraw } from './banking.ts';
import { type ActionHandler, basic, eat } from './common.ts';
import { enroll, study } from './education.ts';
import { rentHome } from './housing.ts';
import { buy, eatStored, subscribe, subscriptionAudit, unsubscribe } from './shopping.ts';
import { applyJob, gig, workShift } from './work.ts';

export type { ActionHandler } from './common.ts';

export const HANDLERS: Record<ActionKind, ActionHandler> = {
  basic,
  eat,
  'eat-stored': eatStored,
  'work-shift': workShift,
  gig,
  'apply-job': applyJob,
  enroll,
  study,
  buy,
  'rent-home': rentHome,
  subscribe,
  unsubscribe,
  'subscription-audit': subscriptionAudit,
  deposit,
  withdraw,
  borrow,
  repay,
};
