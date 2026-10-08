/**
 * Keep the installed app current: check for a new service worker when the
 * app comes back to the foreground (home-screen apps on iOS are rarely
 * reloaded), and reload once when a new worker has taken control — but never
 * in the middle of a navigation (deferred until it ends).
 */

/** Reload now, later (navigating) or not at all (first install, no old version). */
export function reloadDecision(hadController: boolean, navigating: boolean): 'now' | 'later' | 'no' {
  if (!hadController) return 'no';
  return navigating ? 'later' : 'now';
}

export function registerServiceWorker(url: string): void {
  const sw = navigator.serviceWorker;
  const hadController = sw.controller !== null;
  let reloading = false;
  const reload = () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  };
  const navigating = () => document.body.classList.contains('nav-mode');

  sw.addEventListener('controllerchange', () => {
    const d = reloadDecision(hadController, navigating());
    if (d === 'now') reload();
    else if (d === 'later') {
      new MutationObserver((_, obs) => {
        if (!navigating()) {
          obs.disconnect();
          reload();
        }
      }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    }
  });

  sw.register(url)
    .then((reg) => {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void reg.update().catch(() => undefined);
      });
    })
    .catch((err) => console.warn('SW registration failed', err));
}
