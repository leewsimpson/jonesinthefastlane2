import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SlotSummary } from '../../persistence/saves.ts';
import { usePwa } from '../../pwa.ts';
import { SettingsButton } from '../../settings/SettingsButton.tsx';
import { useApp } from '../../store/app.ts';

type Slots = { state: 'loading' } | { state: 'ok'; slots: SlotSummary[] } | { state: 'error' };

/** Title screen (initial bundle). The save list loads the game chunk in the background. */
export function Title() {
  const { t } = useTranslation();
  const go = useApp((s) => s.go);
  const [slots, setSlots] = useState<Slots>({ state: 'loading' });
  const [confirm, setConfirm] = useState<string | null>(null);
  const installable = usePwa((s) => s.installable);
  const install = usePwa((s) => s.install);

  const refresh = () =>
    import('../../persistence/client.ts')
      .then((m) => m.saves.list())
      .then((list) => setSlots({ state: 'ok', slots: list }))
      .catch(() => setSlots({ state: 'error' }));

  // biome-ignore lint/correctness/useExhaustiveDependencies: load once on mount
  useEffect(() => {
    void refresh();
  }, []);

  const remove = async (id: string) => {
    const { saves } = await import('../../persistence/client.ts');
    await saves.remove(id);
    setConfirm(null);
    await refresh();
  };

  const latest = slots.state === 'ok' ? slots.slots.find((s) => !s.finished) : undefined;

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-8 p-6 text-center">
      <div>
        <h1 className="font-display text-5xl font-extrabold tracking-tight sm:text-6xl">
          {t('app.title')} <span className="text-bad">{t('app.year')}</span>
        </h1>
        <p className="mt-3 text-fg-muted text-lg">{t('app.tagline')}</p>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        {latest && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => go({ name: 'game', slot: latest.id })}
          >
            {t('title.continue')}
          </button>
        )}
        <button
          type="button"
          className={latest ? 'btn' : 'btn btn-primary'}
          onClick={() => go({ name: 'setup' })}
          // biome-ignore lint/a11y/noAutofocus: the title screen's main action
          autoFocus
        >
          {t('title.newGame')}
        </button>
        <SettingsButton />
        {installable && (
          <button type="button" className="btn" onClick={() => void install()}>
            {t('title.install')}
          </button>
        )}
      </div>
      <section className="w-full text-left" aria-labelledby="saves-heading">
        <h2 id="saves-heading" className="mb-2 font-display font-bold text-xl">
          {t('title.saves')}
        </h2>
        {slots.state === 'loading' && <p className="text-fg-muted">{t('app.loading')}</p>}
        {slots.state === 'ok' && slots.slots.length === 0 && (
          <p className="text-fg-muted">{t('title.noSaves')}</p>
        )}
        <ul className="flex flex-col gap-2">
          {slots.state === 'ok' &&
            slots.slots.map((s) => (
              <li key={s.id} className="card flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-bold">{s.players.join(' vs ')}</div>
                  <div className="text-fg-muted text-sm">
                    {t('title.saveLine', {
                      week: s.week,
                      difficulty: t(`difficulty.${s.difficulty}`, { defaultValue: s.difficulty }),
                    })}
                    {s.finished && ` · ${t('title.saveFinished')}`}
                    {' · '}
                    {new Date(s.updatedAt).toLocaleString()}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => go({ name: 'game', slot: s.id })}
                >
                  {t('title.load')}
                </button>
                {confirm === s.id ? (
                  <button
                    type="button"
                    className="btn btn-sm btn-danger"
                    onClick={() => void remove(s.id)}
                  >
                    {t('title.deleteConfirm')}
                  </button>
                ) : (
                  <button type="button" className="btn btn-sm" onClick={() => setConfirm(s.id)}>
                    {t('title.delete')}
                  </button>
                )}
              </li>
            ))}
        </ul>
      </section>
    </main>
  );
}
