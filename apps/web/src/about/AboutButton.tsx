/** A button that opens About & privacy, loading it on first use. */
import { lazy, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';

const AboutDialog = lazy(() => import('./AboutDialog.tsx'));

export function AboutButton({ className = 'btn' }: { className?: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {t('about.button')}
      </button>
      {open && (
        <Suspense fallback={null}>
          <AboutDialog open={open} onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  );
}
