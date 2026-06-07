export interface DeferredInstallPrompt {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let _deferred: DeferredInstallPrompt | null = null;
const _listeners = new Set<() => void>();

function capture(e: Event) {
  e.preventDefault();
  _deferred = e as unknown as DeferredInstallPrompt;
  _listeners.forEach((fn) => fn());
}

// Self-initialize at module load — before React mounts.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', capture);
  window.addEventListener('appinstalled', () => {
    _deferred = null;
    _listeners.forEach((fn) => fn());
  });
}

export function getPwaInstallPrompt(): DeferredInstallPrompt | null {
  return _deferred;
}

export function clearPwaInstallPrompt(): void {
  _deferred = null;
  _listeners.forEach((fn) => fn());
}

export function onPwaInstallChange(fn: () => void): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}
