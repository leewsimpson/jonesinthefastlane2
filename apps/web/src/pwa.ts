/**
 * PWA wiring (NFR-11). The service worker registers after the first load, from a lazy chunk, so Workbox stays out
 * of the initial bundle. The browser's install prompt is caught here and offered from the title screen.
 */
import { create } from 'zustand';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface PwaState {
  /** Set while the browser would let us offer an install. */
  installable: InstallPromptEvent | null;
  install(): Promise<void>;
}

export const usePwa = create<PwaState>()((set, get) => ({
  installable: null,
  async install() {
    const e = get().installable;
    if (!e) return;
    set({ installable: null });
    await e.prompt();
    await e.userChoice.catch(() => undefined);
  },
}));

export function setUpPwa(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Keep the browser's mini-bar quiet; the title screen offers the install instead.
    e.preventDefault();
    usePwa.setState({ installable: e as InstallPromptEvent });
  });
  window.addEventListener('appinstalled', () => usePwa.setState({ installable: null }));
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    import('virtual:pwa-register')
      .then(({ registerSW }) => registerSW({ immediate: true }))
      .catch((e: unknown) => console.error('service worker registration failed', e));
  });
}
