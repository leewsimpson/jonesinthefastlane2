/**
 * The action sheet (FR-03, NFR-02): everything the player can do here, each option with its preview, greyed out with
 * the reason when it isn't available. Portrait shows it under the board; landscape docks it on the right. Rows are
 * numbered for the keyboard (NFR-03).
 */
import { ANYWHERE } from '@fastlane/content/keys';
import type { Action, Preview, SmartDefault, WorldState } from '@fastlane/engine';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { buildingFrame } from '../../board/frames.ts';
import { actionKind, targetInfo, targetLabel } from '../../game/copy.ts';
import { content } from '../../game/engine.ts';
import { duration, money } from '../../i18n/format.ts';
import { BuildingArt, ItemArt, interiorFor, itemFrame } from '../common/AtlasArt.tsx';
import { KEY_END_WEEK, KEY_TRAVEL, keyLabel, QUICK_KEYS } from '../common/hotkeys.ts';
import { PlanChips, WeeklyChips } from '../common/PlanChips.tsx';

/** Action kinds per action id. */
const ACTION_KIND = new Map(content.city.actions.map((a) => [a.id, a.kind]));

type PerformAction = Extract<Action, { type: 'perform' }>;

export interface ActionRow {
  preview: Preview & { action: PerformAction };
  key: string | undefined;
}

export interface ActionGroup {
  actionId: string;
  anywhere: boolean;
  rows: ActionRow[];
}

/** Group the `perform` previews by action, in content order, and give each row its shortcut. */
export function groupActions(
  previews: readonly Preview[],
  keyFor: (n: number) => string | undefined,
): ActionGroup[] {
  const groups = new Map<string, ActionGroup>();
  let n = 0;
  for (const p of previews) {
    if (p.action.type !== 'perform') continue;
    const { actionId } = p.action;
    let g = groups.get(actionId);
    if (!g) {
      const def = content.city.actions.find((a) => a.id === actionId);
      g = { actionId, anywhere: def?.location === ANYWHERE, rows: [] };
      groups.set(actionId, g);
    }
    g.rows.push({ preview: p as ActionRow['preview'], key: undefined });
  }
  // Local actions first, then the ones available anywhere (GigHub). Shortcuts follow display order and go only to
  // rows that can be taken, so 1–9 always reach something to do.
  const ordered = [...groups.values()].sort((a, b) => Number(a.anywhere) - Number(b.anywhere));
  for (const g of ordered) for (const r of g.rows) if (r.preview.available) r.key = keyFor(n++);
  return ordered;
}

/**
 * Split the groups into what can be done now and what is locked (FR-03): the first holds only available rows, the
 * second only unavailable ones, each keeping its group, so locked options collapse into one expandable line.
 */
export function splitLocked(groups: readonly ActionGroup[]): {
  open: ActionGroup[];
  locked: ActionGroup[];
  lockedCount: number;
} {
  const open: ActionGroup[] = [];
  const locked: ActionGroup[] = [];
  let lockedCount = 0;
  for (const g of groups) {
    const shown = g.rows.filter(
      (r) => r.preview.available || r.preview.reason.code !== 'NOT_UNLOCKED',
    ); // not revealed yet (FR-15)
    const on = shown.filter((r) => r.preview.available);
    const off = shown.filter((r) => !r.preview.available);
    if (on.length > 0) open.push({ ...g, rows: on });
    if (off.length > 0) locked.push({ ...g, rows: off });
    lockedCount += off.length;
  }
  return { open, locked, lockedCount };
}

/** The meal the "Eat now" quick move points at; its row is marked instead of repeating it (ENG-02). */
export function recommendedKeys(smart: readonly SmartDefault[]): Set<string> {
  return new Set(
    smart.filter((d) => d.kind === 'eat').map((d) => JSON.stringify(d.preview.action)),
  );
}

/** The reason every row of a group is unavailable, when they all share one; such a group shows as one line. */
export function sharedReason(g: ActionGroup): string | null {
  const codes = new Set<string>();
  for (const r of g.rows) {
    if (r.preview.available) return null;
    codes.add(r.preview.reason.code);
  }
  return codes.size === 1 && g.rows.length > 1 ? ([...codes][0] ?? null) : null;
}

/** The owner's line this week (FR-32): it rotates by week. */
export function ownerLine(location: string, week: number): string {
  return `owner.${location}.${((week - 1) % OWNER_LINES) + 1}`;
}
const OWNER_LINES = 3;

/** The label for a one-tap default: "Work full shift" when it is the longest shift on offer. */
export function quickLabel(t: TFunction, d: SmartDefault, groups: readonly ActionGroup[]): string {
  const { action } = d.preview;
  if (action.type !== 'perform') return '';
  const time = action.minutes === undefined ? '' : duration(action.minutes);
  if (d.kind === 'eat') return t('quick.eat', { action: t(`action.${action.actionId}`) });
  if (d.kind === 'study') return t('quick.study', { time });
  const longest = Math.max(
    0,
    ...(groups.find((g) => g.actionId === action.actionId)?.rows ?? []).map(
      (r) => r.preview.action.minutes ?? 0,
    ),
  );
  return t(action.minutes === longest ? 'quick.workFull' : 'quick.workRest', { time });
}

/** The one-tap row (ENG-02): the likeliest next moves, each with its preview. */
function QuickBar({
  smart,
  groups,
  studyNote,
  onPick,
}: {
  smart: readonly SmartDefault[];
  groups: readonly ActionGroup[];
  studyNote?: string | undefined;
  onPick(a: Action): void;
}) {
  const { t: tr } = useTranslation();
  // The meal is marked in the list below instead of being offered twice; its shortcut still works (Game.tsx).
  const shown = smart.flatMap((d, i) => (d.kind === 'eat' ? [] : [{ d, key: QUICK_KEYS[i] }]));
  if (shown.length === 0) return null;
  return (
    <section
      aria-label={tr('quick.title')}
      className="flex flex-col gap-1 px-3 pt-2"
      data-coach="quick"
    >
      {shown.map(({ d, key }) => {
        return (
          <button
            key={d.kind}
            type="button"
            className="action-row border-coral bg-coral/10 dark:border-coral"
            onClick={() => onPick(d.preview.action)}
            aria-keyshortcuts={key}
            data-testid={`quick-${d.kind}`}
          >
            <span className="flex w-full items-center gap-2">
              {key && <kbd>{keyLabel(key)}</kbd>}
              <span className="flex-1 text-left font-bold">{quickLabel(tr, d, groups)}</span>
            </span>
            {d.kind === 'study' && studyNote && (
              <span className="text-fg-muted text-xs">{studyNote}</span>
            )}
            <PlanChips plan={d.preview.plan} />
          </button>
        );
      })}
    </section>
  );
}

/** "Laptop", "4h", "$500", or a combination. Empty for an action with a single plain option. */
export function optionLabel(action: PerformAction): string {
  const parts: string[] = [];
  if (action.target !== undefined) parts.push(targetLabel(action.actionId, action.target));
  if (action.minutes !== undefined) parts.push(duration(action.minutes));
  if (action.amount !== undefined) parts.push(money(action.amount));
  return parts.join(' · ');
}

function Row({
  row,
  world,
  recommended = false,
  onPick,
}: {
  row: ActionRow;
  world: Readonly<WorldState>;
  recommended?: boolean;
  onPick(a: Action): void;
}) {
  const { t } = useTranslation();
  const { preview, key } = row;
  const label = optionLabel(preview.action);
  const { actionId, target } = preview.action;
  const info = target === undefined ? null : targetInfo(actionId, target, world);
  const home =
    target !== undefined && actionKind(actionId) === 'rent-home'
      ? content.city.housing.find((h) => h.id === target)
      : undefined;
  return (
    <button
      type="button"
      className={`action-row wide:flex-row wide:flex-wrap wide:items-center wide:gap-x-2 wide:gap-y-1 wide:py-1.5 ${
        recommended ? 'border-coral bg-coral/10 dark:border-coral' : ''
      }`}
      disabled={!preview.available}
      data-recommended={recommended || undefined}
      onClick={() => onPick(preview.action)}
      aria-keyshortcuts={key}
    >
      <span className="flex w-full flex-wrap items-center gap-x-2 gap-y-0.5 wide:w-auto wide:flex-[1_1_9rem]">
        {key && <kbd>{keyLabel(key)}</kbd>}
        {target !== undefined && itemFrame(target) && <ItemArt id={target} size={32} />}
        <span className="flex-1 text-left font-bold">
          {label || t(`action.${preview.action.actionId}`)}
        </span>
        {recommended && <span className="chip chip-good">{t('sheet.recommended')}</span>}
        {!preview.available && (
          <span className="text-bad text-xs">{t(`error.${preview.reason.code}`)}</span>
        )}
      </span>
      {info && <span className="text-fg-muted text-xs">{info}</span>}
      {preview.plan && <PlanChips plan={preview.plan} />}
      {home && <WeeklyChips effects={home.weekly} />}
    </button>
  );
}

/** Where the player is: the building, its owner's line and, at home, the room. It heads the action sheet. */
function LocationCard({
  location,
  week,
  housingTier,
}: {
  location: string;
  week: number;
  housingTier: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col">
      {location === content.city.board.home && (
        <div
          aria-hidden="true"
          className="h-16 shrink-0 bg-center bg-cover wide:h-24 dark:brightness-75"
          style={{ backgroundImage: `url(${interiorFor(housingTier)})` }}
        />
      )}
      <div className="flex items-end gap-2 px-3 pt-2">
        <BuildingArt frame={buildingFrame(location, housingTier)} width={56} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 id="sheet-heading" className="font-bold font-display text-lg leading-tight">
            {t('sheet.here', { location: t(`location.${location}`) })}
          </h2>
          <p className="self-start rounded-xl border-2 border-ink/25 bg-surface px-2 py-1 text-fg-muted text-xs italic dark:border-cream/25">
            “{t(ownerLine(location, week))}”
          </p>
        </div>
      </div>
    </div>
  );
}

export function ActionSheet({
  location,
  week,
  housingTier,
  world,
  groups,
  smart = [],
  studyNote,
  canAct,
  onPick,
  children,
}: {
  location: string;
  week: number;
  housingTier: string;
  world: Readonly<WorldState>;
  groups: ActionGroup[];
  smart?: readonly SmartDefault[];
  /** Where the enrolled course stands, shown under the Study shortcut. */
  studyNote?: string | undefined;
  canAct: boolean;
  onPick(a: Action): void;
  children?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const { open, locked, lockedCount } = splitLocked(groups);
  const recommended = recommendedKeys(smart);
  const local = open.filter((g) => !g.anywhere);
  const anywhere = open.filter((g) => g.anywhere);
  const lockedJobs = locked.some((g) => ACTION_KIND.get(g.actionId) === 'apply-job');

  const renderGroup = (g: ActionGroup) => {
    const single = g.rows.length === 1 && g.rows[0] && !optionLabel(g.rows[0].preview.action);
    return (
      <li key={g.actionId} className="flex flex-col gap-1">
        {!single && <h3 className="font-bold text-sm">{t(`action.${g.actionId}`)}</h3>}
        {g.rows.map((r) => (
          <Row
            key={JSON.stringify(r.preview.action)}
            row={r}
            world={world}
            recommended={recommended.has(JSON.stringify(r.preview.action))}
            onPick={onPick}
          />
        ))}
        {lockedJobs && ACTION_KIND.get(g.actionId) === 'apply-job' && (
          <p className="text-fg-muted text-xs">{t('sheet.betterJobs')}</p>
        )}
      </li>
    );
  };

  return (
    <section
      id="sheet"
      className="sheet flex min-h-0 flex-col border-ink border-t-2 bg-surface-raised dark:border-cream/30"
      aria-label={t('sheet.here', { location: t(`location.${location}`) })}
    >
      <div className="wide:border-ink/15 wide:border-b wide:pb-2 dark:wide:border-cream/15">
        <LocationCard location={location} week={week} housingTier={housingTier} />
      </div>
      {children}
      {canAct && <QuickBar smart={smart} groups={groups} studyNote={studyNote} onPick={onPick} />}
      <div
        className="relative px-3 pt-1 pb-4 wide:min-h-0 wide:flex-1 wide:overflow-y-auto wide:pb-2"
        data-coach="actions"
      >
        {local.length === 0 && anywhere.length === 0 && (
          <p className="text-fg-muted">{t('sheet.nothing')}</p>
        )}
        {lockedJobs && !local.some((g) => ACTION_KIND.get(g.actionId) === 'apply-job') && (
          <p className="mb-2 text-fg-muted text-sm">{t('sheet.betterJobs')}</p>
        )}
        <ul className="flex flex-col gap-3 wide:gap-2">{local.map(renderGroup)}</ul>
        {anywhere.length > 0 && (
          <>
            <h3 className="section-label mt-4 mb-1">{t('sheet.everywhere')}</h3>
            <ul className="flex flex-col gap-3 wide:gap-2">{anywhere.map(renderGroup)}</ul>
          </>
        )}
        {lockedCount > 0 && (
          <details className="mt-3" data-testid="locked">
            <summary className="cursor-pointer text-fg-muted text-sm">
              {t('sheet.locked', { count: lockedCount })}
            </summary>
            <ul className="mt-2 flex flex-col gap-3">
              {locked.map((g) => (
                <li key={g.actionId} className="flex flex-col gap-1">
                  <h3 className="font-bold text-sm">{t(`action.${g.actionId}`)}</h3>
                  {g.rows.map((r) => (
                    <Row
                      key={JSON.stringify(r.preview.action)}
                      row={r}
                      world={world}
                      onPick={onPick}
                    />
                  ))}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </section>
  );
}

/**
 * Travel and End week, with what the last action did above them (FR-03). Portrait sticks it to the bottom of the
 * screen, so both stay in reach wherever the page is scrolled; landscape docks it under the action sheet.
 */
export function ActionDock({
  canAct,
  onTravel,
  onEndWeek,
  children,
}: {
  canAct: boolean;
  onTravel(): void;
  onEndWeek(): void;
  /** The ticker. */
  children?: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="dock flex flex-col border-ink border-t-2 bg-surface-raised shadow-[0_-4px_12px_rgb(0_0_0/0.08)] dark:border-cream/30">
      {children && <div className="max-h-24 overflow-y-auto pt-1">{children}</div>}
      <div className="flex gap-2 px-3 pt-1 pb-2">
        <button
          type="button"
          className="btn flex-1"
          onClick={onTravel}
          disabled={!canAct}
          aria-keyshortcuts={KEY_TRAVEL}
        >
          {t('sheet.travel')} <kbd>{KEY_TRAVEL.toUpperCase()}</kbd>
        </button>
        <button
          type="button"
          className="btn btn-primary flex-1"
          onClick={onEndWeek}
          disabled={!canAct}
          aria-keyshortcuts={KEY_END_WEEK}
          data-coach="end"
        >
          {t('sheet.endWeek')} <kbd>{KEY_END_WEEK.toUpperCase()}</kbd>
        </button>
      </div>
    </div>
  );
}
