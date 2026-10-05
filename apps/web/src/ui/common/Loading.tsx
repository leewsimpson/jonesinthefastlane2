import { useTranslation } from 'react-i18next';

export function Loading() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-dvh items-center justify-center text-fg-muted" role="status">
      {t('app.loading')}
    </div>
  );
}
