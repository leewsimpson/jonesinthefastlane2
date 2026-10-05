/**
 * Travel (FR-02): every destination by every transport mode, with the time, fare and energy it costs. Keyboard:
 * a number picks the destination, then a mode's letter goes.
 */

import type { Action, Preview } from '@fastlane/engine';
import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { content } from '../../game/engine.ts';
import { rowKey } from '../common/hotkeys.ts';
import { PlanChips } from '../common/PlanChips.tsx';

type TravelPreview = Preview & { action: Extract<Action, { type: 'travel' }> };

/** One letter per transport mode: the first letter of its id not taken by an earlier mode. */
export function modeKeys(modes: readonly string[]): Record<string, string> {
  const used = new Set<string>();
  const out: Record<string, string> = {};
  for (const id of modes) {
    const key = [...id.toLowerCase()].find((c) => /[a-z]/.test(c) && !used.has(c));
    if (key) {
      used.add(key);
      out[id] = key;
    }
  }
  return out;
}

export function TravelDialog({
  open,
  from,
  initial,
  previews,
  onClose,
  onPick,
}: {
  open: boolean;
  from: string;
  initial: string | null;
  previews: readonly Preview[];
  onClose(): void;
  onPick(a: Action): void;
}) {
  const { t } = useTranslation();
  const { board } = content.city;
  const [dest, setDest] = useState<string | null>(initial);
  const [showAll, setShowAll] = useState(initial === null);
  const rowRefs = useRef(new Map<string, HTMLLIElement>());
  const keys = useMemo(() => modeKeys(board.transportModes.map((m) => m.id)), [board]);

  useEffect(() => {
    if (open) {
      setDest(initial);
      setShowAll(initial === null);
    }
  }, [open, initial]);

  const all = board.locations.map((l) => l.id).filter((id) => id !== from);
  // Picked on the board: just that destination, unless the player asks for the rest.
  const destinations = showAll || !initial ? all : all.filter((id) => id === initial);
  const byDest = new Map<string, TravelPreview[]>();
  for (const p of previews)
    if (p.action.type === 'travel') {
      const list = byDest.get(p.action.to) ?? [];
      list.push(p as TravelPreview);
      byDest.set(p.action.to, list);
    }

  const focusRow = (id: string) => {
    setDest(id);
    const row = rowRefs.current.get(id);
    row?.scrollIntoView({ block: 'nearest' });
    row?.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus();
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: focus once the dialog has rendered the rows
  useEffect(() => {
    if (open && initial) requestAnimationFrame(() => focusRow(initial));
  }, [open, initial]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    const k = e.key.toLowerCase();
    const n = destinations.findIndex((_, i) => rowKey(i) === k);
    if (n >= 0 && /^[0-9]$/.test(k)) {
      e.preventDefault();
      const id = destinations[n];
      if (id) focusRow(id);
      return;
    }
    if (!dest) return;
    const mode = Object.entries(keys).find(([, key]) => key === k)?.[0];
    const p = byDest.get(dest)?.find((x) => x.action.mode === mode);
    if (p?.available) {
      e.preventDefault();
      onPick(p.action);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content" onKeyDown={onKeyDown}>
          <Dialog.Title className="font-bold font-display text-2xl">
            {t('travel.title')}
          </Dialog.Title>
          <Dialog.Description className="sr-only">{t('travel.title')}</Dialog.Description>
          <ul className="mt-3 flex flex-col gap-2">
            {destinations.map((id, i) => {
              const options = byDest.get(id) ?? [];
              return (
                <li
                  key={id}
                  ref={(el) => {
                    if (el) rowRefs.current.set(id, el);
                    else rowRefs.current.delete(id);
                  }}
                  className={`rounded-xl border-2 p-2 ${dest === id ? 'border-coral' : 'border-ink/20 dark:border-cream/20'}`}
                >
                  <div className="mb-1 flex items-center gap-2 font-bold">
                    {i < 10 && <kbd>{rowKey(i)}</kbd>}
                    {t('travel.to', { location: t(`location.${id}`) })}
                  </div>
                  <div className="grid gap-1 sm:grid-cols-2">
                    {options.map((p) => (
                      <button
                        key={p.action.mode}
                        type="button"
                        className="action-row"
                        disabled={!p.available}
                        onFocus={() => setDest(id)}
                        onClick={() => onPick(p.action)}
                        aria-keyshortcuts={keys[p.action.mode]}
                      >
                        <span className="flex w-full items-center gap-2">
                          {keys[p.action.mode] && <kbd>{keys[p.action.mode]?.toUpperCase()}</kbd>}
                          <span className="flex-1 text-left">
                            {t(`transport.${p.action.mode}`)}
                          </span>
                          {!p.available && (
                            <span className="text-coral text-xs">
                              {t(`error.${p.reason.code}`)}
                            </span>
                          )}
                        </span>
                        {p.plan && <PlanChips plan={p.plan} />}
                      </button>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
          {!showAll && (
            <button
              type="button"
              className="btn btn-sm mt-3 w-full"
              onClick={() => setShowAll(true)}
            >
              {t('travel.showAll')}
            </button>
          )}
          <Dialog.Close className="btn mt-3 w-full">{t('travel.close')}</Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
