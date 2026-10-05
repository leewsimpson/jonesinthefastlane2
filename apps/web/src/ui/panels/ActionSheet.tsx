/**
 * The action sheet (FR-03, NFR-02): everything the player can do here, each option with its preview, greyed out with
 * the reason when it isn't available. Portrait shows it under the board; landscape docks it on the right. Rows are
 * numbered for the keyboard (NFR-03).
 */
import { ANYWHERE } from '@fastlane/content/keys';
import type { Action, Preview, WorldState } from '@fastlane/engine';
import { useTranslation } from 'react-i18next';
import { targetInfo, targetLabel } from '../../game/copy.ts';
import { content } from '../../game/engine.ts';
import { duration, money } from '../../i18n/format.ts';
import { KEY_END_WEEK, KEY_TRAVEL } from '../common/hotkeys.ts';
import { PlanChips } from '../common/PlanChips.tsx';

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
  // Local actions first, then the ones available anywhere (GigHub); shortcuts follow display order.
  const ordered = [...groups.values()].sort((a, b) => Number(a.anywhere) - Number(b.anywhere));
  for (const g of ordered) for (const r of g.rows) r.key = keyFor(n++);
  return ordered;
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
  onPick,
}: {
  row: ActionRow;
  world: Readonly<WorldState>;
  onPick(a: Action): void;
}) {
  const { t } = useTranslation();
  const { preview, key } = row;
  const label = optionLabel(preview.action);
  const { actionId, target } = preview.action;
  const info = target === undefined ? null : targetInfo(actionId, target, world);
  return (
    <button
      type="button"
      className="action-row"
      disabled={!preview.available}
      onClick={() => onPick(preview.action)}
      aria-keyshortcuts={key}
    >
      <span className="flex w-full items-center gap-2">
        {key && <kbd>{key.toUpperCase()}</kbd>}
        <span className="flex-1 text-left font-bold">
          {label || t(`action.${preview.action.actionId}`)}
        </span>
        {!preview.available && (
          <span className="text-coral text-xs">{t(`error.${preview.reason.code}`)}</span>
        )}
      </span>
      {info && <span className="text-fg-muted text-xs">{info}</span>}
      {preview.plan && <PlanChips plan={preview.plan} />}
    </button>
  );
}

export function ActionSheet({
  location,
  world,
  groups,
  canAct,
  onPick,
  onTravel,
  onEndWeek,
  children,
}: {
  location: string;
  world: Readonly<WorldState>;
  groups: ActionGroup[];
  canAct: boolean;
  onPick(a: Action): void;
  onTravel(): void;
  onEndWeek(): void;
  children?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const local = groups.filter((g) => !g.anywhere);
  const anywhere = groups.filter((g) => g.anywhere);

  const renderGroup = (g: ActionGroup) => {
    const single = g.rows.length === 1 && g.rows[0] && !optionLabel(g.rows[0].preview.action);
    return (
      <li key={g.actionId} className="flex flex-col gap-1">
        {!single && <h3 className="font-bold text-sm">{t(`action.${g.actionId}`)}</h3>}
        {g.rows.map((r) => (
          <Row key={JSON.stringify(r.preview.action)} row={r} world={world} onPick={onPick} />
        ))}
      </li>
    );
  };

  return (
    <section
      className="sheet flex min-h-0 flex-col border-ink border-t-2 bg-surface-raised dark:border-cream/30"
      aria-labelledby="sheet-heading"
    >
      <div className="flex items-center gap-2 px-3 pt-2">
        <h2 id="sheet-heading" className="flex-1 font-bold font-display text-lg">
          {t('sheet.here', { location: t(`location.${location}`) })}
        </h2>
      </div>
      {children}
      <div className="relative min-h-0 flex-1 overflow-y-auto px-3 pb-2">
        {local.length === 0 && anywhere.length === 0 && (
          <p className="text-fg-muted">{t('sheet.nothing')}</p>
        )}
        <ul className="flex flex-col gap-3">{local.map(renderGroup)}</ul>
        {anywhere.length > 0 && (
          <>
            <h3 className="mt-3 mb-1 text-fg-muted text-xs uppercase tracking-wide">
              {t('sheet.everywhere')}
            </h3>
            <ul className="flex flex-col gap-3">{anywhere.map(renderGroup)}</ul>
          </>
        )}
      </div>
      <div className="flex gap-2 border-ink/20 border-t-2 p-2 dark:border-cream/20">
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
        >
          {t('sheet.endWeek')} <kbd>{KEY_END_WEEK.toUpperCase()}</kbd>
        </button>
      </div>
    </section>
  );
}
