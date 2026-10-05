import { ENGINE_VERSION } from '@fastlane/engine';
import { useEffect, useState } from 'react';
import { loadConfig, type RuntimeConfig } from '../config.ts';

type ApiStatus =
  | { state: 'loading' }
  | { state: 'ok'; environment: string; version: string }
  | { state: 'error'; message: string };

const SWATCHES = ['bg-ink', 'bg-coral', 'bg-mustard', 'bg-teal', 'bg-sky', 'bg-lilac', 'bg-mint'];

export function App() {
  const [config, setConfig] = useState<RuntimeConfig | null>(null);
  const [api, setApi] = useState<ApiStatus>({ state: 'loading' });

  useEffect(() => {
    let cancelled = false;
    loadConfig()
      .then(async (cfg) => {
        if (cancelled) return;
        setConfig(cfg);
        const res = await fetch(`${cfg.apiBase}/healthz`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as { environment: string; version: string };
        if (!cancelled) setApi({ state: 'ok', ...body });
      })
      .catch((err: unknown) => {
        if (!cancelled) setApi({ state: 'error', message: String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-6 p-6 text-center">
      <h1 className="font-display text-5xl font-extrabold tracking-tight">
        Fast Lane <span className="text-coral">2026</span>
      </h1>
      <p className="text-fg-muted text-lg">Coming soon. The rent is already due.</p>
      <div className="flex gap-2" aria-hidden="true">
        {SWATCHES.map((c) => (
          <span key={c} className={`size-6 rounded-full border-2 border-ink ${c}`} />
        ))}
      </div>
      <dl className="bg-surface-raised tabular grid grid-cols-2 gap-x-4 gap-y-1 rounded-xl border-2 border-ink px-5 py-3 text-left text-sm">
        <dt className="text-fg-muted">Environment</dt>
        <dd>{config?.environment ?? '…'}</dd>
        <dt className="text-fg-muted">Engine</dt>
        <dd>{ENGINE_VERSION}</dd>
        <dt className="text-fg-muted">API</dt>
        <dd data-testid="api-status">
          {api.state === 'loading' && '…'}
          {api.state === 'ok' && `ok · ${api.environment} · ${api.version.slice(0, 7)}`}
          {api.state === 'error' && `unreachable (${api.message})`}
        </dd>
      </dl>
    </main>
  );
}
