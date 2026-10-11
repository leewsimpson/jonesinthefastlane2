/**
 * The action sheet (FR-03, NFR-02): everything the player can do here, each option with its preview, greyed out with
 * the reason when it isn't available. Portrait shows it under the board; landscape docks it on the right. Rows are
 * numbered for the keyboard (NFR-03).
 */
import { ANYWHERE } from '@fastlane/content/keys';
import type { Action, Preview, SmartDefault, WorldState } from '@fastlane/engine';
import type { TFunction } from 'i18next';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { buildingFrame } from '../../board/frames.ts';
import { actionKind, targetInfo, targetLabel } from '../../game/copy.ts';
import { content } from '../../game/engine.ts';
import { duration, money } from '../../i18n/format.ts';
import { BuildingArt, CharacterArt, ItemArt, interiorFor, itemFrame } from '../common/AtlasArt.tsx';
import { KEY_END_WEEK, KEY_TRAVEL, keyLabel, QUICK_KEYS } from '../common/hotkeys.ts';
import { actionIcon, FAMILY_FILL, FAMILY_TILE, Icon } from '../common/Icon.tsx';
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
      className="flex flex-col gap-1.5 px-4 pt-3"
      data-coach="quick"
    >
      {shown.map(({ d, key }) => {
        return (
          <button
            key={d.kind}
            type="button"
            className="action-row border-gold bg-butter/45 dark:border-gold dark:bg-gold/15"
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
  describe = false,
  onPick,
}: {
  row: ActionRow;
  world: Readonly<WorldState>;
  recommended?: boolean;
  /** Show the action's one-line description: for a row that stands alone, not one option of several. */
  describe?: boolean;
  onPick(a: Action): void;
}) {
  const { t } = useTranslation();
  const { preview, key } = row;
  const label = optionLabel(preview.action);
  const { actionId, target, minutes } = preview.action;
  const info = target === undefined ? null : targetInfo(actionId, target, world);
  const home =
    target !== undefined && actionKind(actionId) === 'rent-home'
      ? content.city.housing.find((h) => h.id === target)
      : undefined;
  const [icon, family] = actionIcon(actionId, ACTION_KIND.get(actionId));
  const art = target !== undefined && itemFrame(target) ? target : undefined;
  // The time sits beside the label; an option already named by its length ("4h") doesn't repeat it.
  const time = preview.plan && minutes === undefined ? preview.plan.time : 0;
  return (
    <button
      type="button"
      className={`action-row flex-row items-start gap-3 ${
        recommended ? 'border-gold bg-butter/45 dark:border-gold dark:bg-gold/15' : ''
      }`}
      disabled={!preview.available}
      data-recommended={recommended || undefined}
      onClick={() => onPick(preview.action)}
      aria-keyshortcuts={key}
    >
      <span className={`icon-tile ${FAMILY_TILE[family]}`}>
        {art ? (
          <ItemArt id={art} size={44} />
        ) : (
          <Icon name={icon} size={34} fill={FAMILY_FILL[family]} weight={2.2} />
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-start gap-2">
          <span className="text-left font-bold leading-snug wide:text-[1.0625rem]">
            {label || t(`action.${preview.action.actionId}`)}
          </span>
          {key && <kbd className="mt-0.5">{keyLabel(key)}</kbd>}
        </span>
        {info && <span className="text-fg-muted text-sm">{info}</span>}
        {!info && describe && (
          <span className="text-fg-muted text-sm">{t(`actionInfo.${actionId}`)}</span>
        )}
        {recommended && (
          <span className="flex items-center gap-1 font-bold text-good text-sm">
            <Icon name="star" size={14} />
            {t('sheet.recommended')}
          </span>
        )}
        {!preview.available && (
          <span className="flex items-center gap-1 text-bad text-sm">
            <Icon name="info" size={14} />
            {t(`error.${preview.reason.code}`)}
          </span>
        )}
        {home && <WeeklyChips effects={home.weekly} />}
      </span>
      {/* Time and effects line up on the right, as in the original's price column. */}
      <span className="flex max-w-[45%] shrink-0 flex-col items-end gap-0.5 text-right">
        {time > 0 && (
          <span className="flex items-center gap-1.5 text-sm">
            <Icon name="clock" size={18} />
            <span className="sr-only">{t('stat.time')} </span>
            <span className="tabular">{duration(time)}</span>
          </span>
        )}
        {preview.plan && (
          <PlanChips
            plan={preview.plan}
            bare
            labelled
            showTime={minutes !== undefined}
            align="end"
          />
        )}
      </span>
    </button>
  );
}

/**
 * Where the player is (art-direction §4): the place's name on a teal bar, its scene (the room at home, the building
 * elsewhere) and its owner's line. It heads the action sheet.
 */
function LocationCard({
  location,
  week,
  housingTier,
  avatar,
}: {
  location: string;
  week: number;
  housingTier: string;
  /** The player's character, shown at home in their room. */
  avatar?: string | undefined;
}) {
  const { t } = useTranslation();
  const atHome = location === content.city.board.home;
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-butter border-b-4 bg-teal-deep px-4 py-2 text-cream">
        <Icon name={atHome ? 'home' : 'store'} size={30} />
        <h2
          id="sheet-heading"
          className="font-bold font-display text-2xl leading-tight wide:text-[1.75rem]"
        >
          {t(`location.${location}`)}
        </h2>
      </div>
      {/* On mobile the board above already shows the place, so the scene gives its room to the actions. */}
      <div className="hidden px-3 pt-3 wide:block">
        {atHome ? (
          <div
            aria-hidden="true"
            className="relative h-28 overflow-hidden rounded-md border border-ink bg-[center_45%] bg-cover wide:h-[clamp(7rem,22vh,13rem)] dark:border-cream/30"
            style={{ backgroundImage: `url(${interiorFor(housingTier)})` }}
          >
            {avatar && (
              // Framed from the knees up, standing in the room's left foreground: only where the scene is tall enough.
              <div className="absolute -bottom-24 left-[2%] hidden [@media(min-width:1024px)_and_(min-height:900px)]:block">
                <CharacterArt avatar={avatar} height={300} />
              </div>
            )}
          </div>
        ) : (
          <div
            aria-hidden="true"
            className="scene-ground flex h-28 items-end justify-center rounded-md border border-ink pb-1 wide:h-[clamp(7rem,16vh,9rem)] dark:border-cream/30"
          >
            <BuildingArt frame={buildingFrame(location, housingTier)} width={150} />
          </div>
        )}
      </div>
      <p className="px-4 pt-2 text-sm wide:text-base">“{t(ownerLine(location, week))}”</p>
    </div>
  );
}

export function ActionSheet({
  location,
  week,
  housingTier,
  avatar,
  world,
  groups,
  smart = [],
  studyNote,
  canAct,
  onPick,
  children,
  footer,
}: {
  location: string;
  week: number;
  housingTier: string;
  avatar?: string | undefined;
  world: Readonly<WorldState>;
  groups: ActionGroup[];
  smart?: readonly SmartDefault[];
  /** Where the enrolled course stands, shown under the Study shortcut. */
  studyNote?: string | undefined;
  canAct: boolean;
  onPick(a: Action): void;
  /** Guidance shown under the location card: the coach and the week's needs. */
  children?: React.ReactNode;
  /** Shown after the actions. */
  footer?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const { open, locked, lockedCount } = splitLocked(groups);
  const recommended = recommendedKeys(smart);
  const local = open.filter((g) => !g.anywhere);
  const anywhere = open.filter((g) => g.anywhere);
  const lockedJobs = locked.some((g) => ACTION_KIND.get(g.actionId) === 'apply-job');
  // A new place starts at the top of its sheet, wherever the last one was scrolled to.
  const sheet = useRef<HTMLElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs on arrival
  useEffect(() => {
    sheet.current?.scrollTo({ top: 0 });
  }, [location]);

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
            describe={!!single}
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
      ref={sheet}
      id="sheet"
      className="sheet flex flex-col bg-surface-raised"
      aria-label={t('sheet.here', { location: t(`location.${location}`) })}
    >
      <LocationCard location={location} week={week} housingTier={housingTier} avatar={avatar} />
      {children}
      {canAct && <QuickBar smart={smart} groups={groups} studyNote={studyNote} onPick={onPick} />}
      <div className="relative px-4 pt-3 pb-4" data-coach="actions">
        <h3 className="section-label mb-2 border-ink/15 border-t pt-3 wide:text-base dark:border-cream/15">
          {t('sheet.actionsAt', { location: t(`location.${location}`) })}
        </h3>
        {local.length === 0 && anywhere.length === 0 && (
          <p className="text-fg-muted">{t('sheet.nothing')}</p>
        )}
        {lockedJobs && !local.some((g) => ACTION_KIND.get(g.actionId) === 'apply-job') && (
          <p className="mb-2 text-fg-muted text-sm">{t('sheet.betterJobs')}</p>
        )}
        <ul className="flex flex-col gap-2">{local.map(renderGroup)}</ul>
        {anywhere.length > 0 && (
          <>
            <h3 className="section-label mt-4 mb-2">{t('sheet.everywhere')}</h3>
            <ul className="flex flex-col gap-2">{anywhere.map(renderGroup)}</ul>
          </>
        )}
        {lockedCount > 0 && (
          <details className="mt-3" data-testid="locked">
            <summary className="cursor-pointer text-fg-muted text-sm">
              {t('sheet.locked', { count: lockedCount })}
            </summary>
            <ul className="mt-2 flex flex-col gap-2">
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
      {footer}
    </section>
  );
}

/**
 * Travel and End week, with what the last action did above them (FR-03), pinned at the foot of the location panel.
 * The buttons size to the panel's width, not the screen's: the hints show only where there's room.
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
    <div className="dock @container flex flex-none flex-col gap-1 border-ink/25 border-t bg-surface-raised pt-1 pb-2 shadow-[0_-4px_12px_rgb(0_0_0/0.06)] dark:border-cream/25">
      {children && <div className="max-h-24 overflow-y-auto">{children}</div>}
      <div className="flex gap-2 px-2 @md:px-3">
        <button
          type="button"
          className="btn btn-sky min-w-0 flex-1 px-2 @md:justify-start @md:py-3"
          onClick={onTravel}
          disabled={!canAct}
          aria-keyshortcuts={KEY_TRAVEL}
        >
          <Icon
            name="pin"
            size={26}
            fill="var(--color-ink)"
            className="[&_*:last-child]:stroke-sky"
          />
          <span className="flex min-w-0 flex-col items-start leading-tight">
            <span className="whitespace-nowrap font-display @md:text-xl">
              {t('sheet.travel')} <kbd>{KEY_TRAVEL.toUpperCase()}</kbd>
            </span>
            <span className="hidden truncate font-normal text-xs @md:inline">
              {t('sheet.travelHint')}
            </span>
          </span>
        </button>
        <button
          type="button"
          className="btn btn-primary min-w-0 flex-1 px-2 @md:justify-start @md:py-3"
          onClick={onEndWeek}
          disabled={!canAct}
          aria-keyshortcuts={KEY_END_WEEK}
          data-coach="end"
        >
          <Icon name="calendar" size={26} />
          <span className="flex min-w-0 flex-col items-start leading-tight">
            <span className="whitespace-nowrap font-display @md:text-xl">
              {t('sheet.endWeek')} <kbd>{KEY_END_WEEK.toUpperCase()}</kbd>
            </span>
            <span className="hidden truncate font-normal text-xs @md:inline">
              {t('sheet.endWeekHint')}
            </span>
          </span>
        </button>
      </div>
    </div>
  );
}
