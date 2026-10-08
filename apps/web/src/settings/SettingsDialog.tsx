/**
 * The settings dialog (NFR-04): theme, motion, text size, the week-1 coach and data-sharing consent (NFR-14). Lazy-loaded from the title screen and
 * the HUD, so Radix stays out of the initial bundle.
 */
import * as Dialog from '@radix-ui/react-dialog';
import { useTranslation } from 'react-i18next';
import { type Motion, type Settings, TEXT_SIZES, type Theme, useSettings } from './settings.ts';

function Choice<T extends string | number>({
  legend,
  name,
  value,
  options,
  label,
  onChange,
}: {
  legend: string;
  name: string;
  value: T;
  options: readonly T[];
  label(v: T): string;
  onChange(v: T): void;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 font-bold">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label key={String(o)} className="chip-toggle">
            <input
              type="radio"
              className="sr-only"
              name={name}
              checked={value === o}
              onChange={() => onChange(o)}
            />
            {label(o)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export default function SettingsDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  const { t } = useTranslation();
  const s = useSettings();
  const set = (patch: Partial<Settings>) => s.set(patch);
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content flex flex-col gap-4" aria-describedby={undefined}>
          <Dialog.Title className="font-bold font-display text-2xl">
            {t('settings.title')}
          </Dialog.Title>
          <Choice<Theme>
            legend={t('settings.theme')}
            name="theme"
            value={s.theme}
            options={['system', 'light', 'dark']}
            label={(v) => t(`settings.theme.${v}`)}
            onChange={(theme) => set({ theme })}
          />
          <Choice<Motion>
            legend={t('settings.motion')}
            name="motion"
            value={s.motion}
            options={['system', 'reduce', 'full']}
            label={(v) => t(`settings.motion.${v}`)}
            onChange={(motion) => set({ motion })}
          />
          <Choice
            legend={t('settings.textSize')}
            name="textSize"
            value={s.textSize}
            options={TEXT_SIZES}
            label={(v) => `${v}%`}
            onChange={(textSize) => set({ textSize })}
          />
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className="size-5 accent-coral"
              checked={s.tutorial}
              onChange={(e) => set({ tutorial: e.target.checked })}
            />
            {t('settings.tutorial')}
          </label>
          <div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="size-5 accent-coral"
                checked={s.shareData}
                onChange={(e) => set({ shareData: e.target.checked })}
                aria-describedby="share-data-hint"
              />
              {t('settings.shareData')}
            </label>
            <p id="share-data-hint" className="mt-1 text-fg-muted text-sm">
              {t('settings.shareDataHint')}
            </p>
          </div>
          <Dialog.Close asChild>
            <button type="button" className="btn btn-primary">
              {t('details.close')}
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
