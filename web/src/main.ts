import './ui/style.css';
import { startApp } from './app';
import { detectLocale, setLocale, t } from './i18n';
import { createMap } from './ui/map';

const locale = detectLocale(navigator.languages ?? [navigator.language]);
setLocale(locale);
document.documentElement.lang = locale;
document.title = t('app.title');

const mapEl = document.getElementById('map');
const uiEl = document.getElementById('ui');
if (mapEl && uiEl) {
  const map = createMap(mapEl);
  // 'style.load' fires as soon as the style is ready (our layers need it);
  // 'load' would also wait for every basemap tile, which took >10 s on slow links.
  const start = () => startApp(map, uiEl).catch((err) => console.error('startup failed', err));
  if (map.isStyleLoaded()) start();
  else map.once('style.load', start);
}

// Offline support: only in production builds (dev server serves unbundled modules).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('SW registration failed', err));
  });
}
