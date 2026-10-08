/**
 * About & privacy (NFR-14, ENG-35): what the game keeps and sends, credits, the IP note and links to real financial
 * help. Lazy-loaded like the settings dialog.
 */
import * as Dialog from '@radix-ui/react-dialog';
import { useTranslation } from 'react-i18next';
import { HELP_LINKS } from './help.ts';

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <h3 id={id} className="font-bold font-display text-lg">
        {title}
      </h3>
      {children}
    </section>
  );
}

export default function AboutDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  const { t } = useTranslation();
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content flex flex-col gap-5" aria-describedby={undefined}>
          <Dialog.Title className="font-bold font-display text-2xl">
            {t('about.title')}
          </Dialog.Title>
          <Section id="about-privacy" title={t('about.privacy')}>
            <ul className="list-disc space-y-1 pl-5">
              <li>{t('about.privacy.account')}</li>
              <li>{t('about.privacy.saves')}</li>
              <li>{t('about.privacy.analytics')}</li>
              <li>{t('about.privacy.hosting')}</li>
              <li>{t('about.privacy.delete')}</li>
            </ul>
          </Section>
          <Section id="about-help" title={t('about.help')}>
            <p>{t('about.help.intro')}</p>
            <ul className="list-disc space-y-1 pl-5">
              {HELP_LINKS.map((l) => (
                <li key={l.id}>
                  <a className="underline" href={l.url} target="_blank" rel="noopener noreferrer">
                    {t(`about.help.${l.id}`)}
                  </a>
                </li>
              ))}
            </ul>
          </Section>
          <Section id="about-credits" title={t('about.credits')}>
            <p>{t('about.credits.made')}</p>
            <p>{t('about.credits.art')}</p>
            <p className="text-fg-muted text-sm">{t('about.credits.ip')}</p>
          </Section>
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
