/** A button that opens the settings dialog, loading it on first use. */
import { lazy, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';

const SettingsDialog = lazy(() => import('./SettingsDialog.tsx'));

export function SettingsButton({ className = 'btn' }: { className?: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {t('settings.title')}
      </button>
      {open && (
        <Suspense fallback={null}>
          <SettingsDialog open={open} onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  );
}
